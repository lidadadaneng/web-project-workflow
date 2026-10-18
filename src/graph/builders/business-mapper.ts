/**
 * 业务-代码映射（business_map 边）多源证据融合
 *
 * 已实现四源证据：
 *   - doc-extract  文档提取（高权重，直接证据）
 *   - semantic     语义匹配（间接证据，需向量索引）
 *   - git-history  Git 历史追溯（间接证据，按 commit 修改文件频次）
 *   - name-match   命名匹配（低权重兜底，中英词典 + 前缀/包含匹配）
 *
 * 同一目标被多源命中时，按 noisy-OR 聚合权重（1 − ∏(1 − wᵢ)，上限 0.95），
 * 边的 source 字段取最权威证据源（与收集顺序无关）。
 *
 * 语义回填仅对 L1 模块 / L2 文件生成语义证据（控制规模，不对 L3 逐一生成）。
 */
import type { GraphConfig, GraphNode, VectorMapping } from '../types';
import { EdgeBuilder, aggregateWeights, type MappingEvidence } from './edge-builder';
import type { ParsedCapability } from '../parsers/capability-parser';
import type { ParsedModule } from '../parsers/module-parser';
import { matchByName, traceFromGit, isGitRepo, type GitTraceResult } from '../parsers/mapping-sources';
import { cosineSimilarity } from './vector-builder';

/** Git 追溯函数类型（可注入用于测试） */
export type GitTracer = (root: string, keywords: string[], maxCommits: number) => GitTraceResult;

/** 源开关（消融实验用，未设置即该源开启） */
export interface MappingSourceSwitch {
  doc?: boolean;
  semantic?: boolean;
  git?: boolean;
  name?: boolean;
}

/** business_map 构建上下文 */
export interface BusinessMapContext {
  caps: ParsedCapability[];
  modules: ParsedModule[];
  fileNodes: Map<string, GraphNode>;
  /** 全部结构节点；用于把能力语义直接映射到类和方法。 */
  codeNodes?: GraphNode[];
  root: string;
  config: GraphConfig;
  /** 向量数据（语义回填用，为 null 则跳过语义源） */
  vectors: Float32Array | null;
  /** 向量维度 */
  dimensions: number;
  /** 向量-节点映射 */
  mapping: VectorMapping | null;
  /** Git 追溯函数（可注入用于测试，默认 traceFromGit） */
  traceGit?: GitTracer;
  /** Git 仓库判定函数（可注入用于测试，默认 isGitRepo） */
  isGit?: (root: string) => boolean;
  /** 源开关（消融实验用，默认全开） */
  sources?: MappingSourceSwitch;
}

/** 语义匹配权重上限（间接证据，权威性低于 doc-extract 的 0.85） */
const SEMANTIC_WEIGHT_CAP = 0.7;
/** Git 历史权重上限 */
const GIT_WEIGHT_CAP = 0.7;
/** 命名匹配基础权重打折系数 */
const NAME_WEIGHT_FACTOR = 0.5;
/** business_map 边最低权重阈值 */
const MIN_EDGE_WEIGHT = 0.3;

/**
 * 构建 business_map 边（四源证据融合）
 *
 * C 层能力节点 → L1/L2/L3 结构节点
 */
export function buildBusinessMapEdges(eb: EdgeBuilder, ctx: BusinessMapContext): void {
  const { caps, modules, fileNodes, codeNodes, root, config, vectors, dimensions, mapping } = ctx;
  const traceGit: GitTracer = ctx.traceGit ?? traceFromGit;
  const isGit: (root: string) => boolean = ctx.isGit ?? isGitRepo;
  const sw = ctx.sources ?? {};
  const useDoc = sw.doc !== false;
  const useSemantic = sw.semantic !== false;
  const useGitSrc = sw.git !== false;
  const useName = sw.name !== false;

  // 模块名 -> 模块节点
  const moduleByName = new Map<string, ParsedModule>();
  for (const m of modules) moduleByName.set(m.node.name.toLowerCase(), m);

  // 文件路径 -> 文件节点 ID
  const filePathToNodeId = new Map<string, string>();
  for (const [fp, node] of fileNodes) {
    filePathToNodeId.set(fp.replace(/\\/g, '/'), node.id);
  }

  // 节点 ID -> 节点（供语义扫描取 L1/L2 节点）
  const nodeById = new Map<string, GraphNode>();
  for (const m of modules) nodeById.set(m.node.id, m.node);
  for (const [, n] of fileNodes) nodeById.set(n.id, n);
  for (const n of codeNodes ?? []) nodeById.set(n.id, n);

  // Git 前置判断
  const useGit = useGitSrc && config.mapping.gitHistory && isGit(root);
  const gitMinFreq = config.mapping.gitMinFreq ?? 2;

  // 语义阈值
  const semanticThreshold = config.mapping.semanticThreshold ?? config.search.threshold;
  const semanticTopK = config.mapping.semanticTopK ?? 5;
  const semanticReady =
    useSemantic && !!vectors && !!mapping && mapping.indexToNodeId.length > 0;

  if (useSemantic && !semanticReady) {
    console.warn('[business-mapper] 向量索引缺失，语义映射源已跳过');
  }

  for (const cap of caps) {
    const evidences: MappingEvidence[] = [];

    if (useDoc) collectDocEvidences(cap, moduleByName, evidences);
    if (useGit) collectGitEvidences(cap, root, config, traceGit, filePathToNodeId, gitMinFreq, evidences);
    if (useName) collectNameEvidences(cap, modules, moduleByName, evidences);
    if (semanticReady) {
      collectSemanticEvidences(
        cap, vectors!, dimensions, mapping!, nodeById, semanticThreshold, semanticTopK, evidences,
      );
    }

    const aggregated = aggregateWeights(evidences);
    for (const [targetId, { weight, source }] of aggregated) {
      if (weight >= MIN_EDGE_WEIGHT) {
        eb.addBusinessMap(cap.node.id, targetId, weight, source);
      }
    }
  }
}

// ==================== 各源证据收集 ====================

/** Layer 1: 文档提取（高权重直接证据） */
function collectDocEvidences(
  cap: ParsedCapability,
  moduleByName: Map<string, ParsedModule>,
  evidences: MappingEvidence[],
): void {
  // 从能力节点的 features 中提取模块名（启发式：功能名中包含模块名）
  const moduleNames = extractModuleNamesFromCap(cap);
  for (const modName of moduleNames) {
    const mod = moduleByName.get(modName.toLowerCase());
    if (mod) {
      evidences.push({
        targetId: mod.node.id,
        source: 'doc-extract',
        baseWeight: 0.85,
      });
    }
  }
}

/** 从能力 spec 中提取模块名候选 */
function extractModuleNamesFromCap(cap: ParsedCapability): string[] {
  const names: string[] = [];
  const text = cap.vectorText.toLowerCase();

  // 从能力名和描述中提取可能的模块名
  // 简单启发：用 - 拆分能力名，检查各部分是否匹配模块
  const parts = cap.node.name.split('-');
  for (const p of parts) {
    if (p.length >= 3) names.push(p);
  }

  // 从 features 名称中提取（前几个词）
  if (cap.node.attrs.features) {
    for (const f of cap.node.attrs.features) {
      // 提取功能名中的英文关键词
      const words = f.name.split(/[\s\-_/]+/).filter(w => w.length >= 3);
      for (const w of words) {
        if (/^[a-zA-Z]+$/.test(w)) {
          names.push(w.toLowerCase());
        }
      }
    }
  }

  return [...new Set(names)];
}

/** Layer 4: 命名匹配（低权重兜底） */
function collectNameEvidences(
  cap: ParsedCapability,
  modules: ParsedModule[],
  moduleByName: Map<string, ParsedModule>,
  evidences: MappingEvidence[],
): void {
  const moduleNames = modules.map((m) => m.node.name);
  const result = matchByName(cap.node.name, moduleNames);
  for (const [modName, score] of result.matches) {
    const mod = moduleByName.get(modName.toLowerCase());
    if (mod) {
      evidences.push({
        targetId: mod.node.id,
        source: 'name-match',
        baseWeight: score * NAME_WEIGHT_FACTOR,
      });
    }
  }
}

/** Layer 3: Git 历史追溯
 * 导出以支持单测：可注入 traceGit mock。 */
export function collectGitEvidences(
  cap: ParsedCapability,
  root: string,
  config: GraphConfig,
  traceGit: GitTracer,
  filePathToNodeId: Map<string, string>,
  gitMinFreq: number,
  evidences: MappingEvidence[],
): void {
  const keywords = [cap.node.name];
  if (cap.node.attrs.features) {
    for (const f of cap.node.attrs.features) {
      keywords.push(f.name);
    }
  }
  const { fileCounts } = traceGit(root, keywords, config.mapping.gitMaxCommits);

  let maxFreq = 0;
  for (const freq of fileCounts.values()) {
    if (freq > maxFreq) maxFreq = freq;
  }
  if (maxFreq === 0) return;

  for (const [filePath, freq] of fileCounts) {
    if (freq < gitMinFreq) continue;
    const targetId = filePathToNodeId.get(filePath.replace(/\\/g, '/'));
    if (!targetId) continue;
    const normFreq = freq / maxFreq;
    evidences.push({
      targetId,
      source: 'git-history',
      baseWeight: Math.min(GIT_WEIGHT_CAP, normFreq * 0.6),
    });
  }
}

/**
 * Layer 2: 语义匹配
 *
 * 取能力节点向量，对所有 L1 模块 / L2 文件节点向量做余弦相似度线性扫描。
 * 仅对 L1/L2 生成语义证据（控制规模，不对 L3 逐一生成）。
 *
 * 导出以支持单测。
 */
export function collectSemanticEvidences(
  cap: ParsedCapability,
  vectors: Float32Array,
  dimensions: number,
  mapping: VectorMapping,
  nodeById: Map<string, GraphNode>,
  threshold: number,
  topK: number,
  evidences: MappingEvidence[],
): void {
  const capIdx = mapping.nodeIdToIndex.get(cap.node.id);
  if (capIdx === undefined) return;
  const capVecOffset = capIdx * dimensions;
  const capVec = vectors.subarray(capVecOffset, capVecOffset + dimensions);

  const total = mapping.indexToNodeId.length;
  const scored: Array<{ nodeId: string; score: number; group: string }> = [];
  for (let i = 0; i < total; i++) {
    const nodeId = mapping.indexToNodeId[i];
    if (nodeId === cap.node.id) continue;
    const node = nodeById.get(nodeId);
    if (!node) continue;
    // L3 类/方法携带源码注释、签名和路由，往往比拼音文件名更能
    // 表达中文业务语义。topK 已限制最终规模，因此纳入 L3。
    if (node.level !== 'L1' && node.level !== 'L2' && node.level !== 'L3') continue;

    const vecOffset = i * dimensions;
    const vec = vectors.subarray(vecOffset, vecOffset + dimensions);
    const sim = cosineSimilarity(capVec, vec);
    if (sim >= threshold) {
      const name = node.name.toLowerCase();
      const accessorPenalty = /(?:^|\.)(?:get|set|is)[A-Z_]/.test(node.name) ? 0.82 : 1;
      const typeBoost = node.type === 'class' || node.type === 'component'
        ? 1.08
        : node.type === 'function'
          ? 1.02
          : node.level === 'L2'
            ? 1.04
            : node.level === 'L1'
              ? 0.85
              : 1;
      const genericPenalty = /\/(?:vo|model|view)\//i.test(node.attrs.filePath ?? '') ? 0.78 : 1;
      const score = sim * accessorPenalty * typeBoost * genericPenalty;
      const group = node.attrs.filePath ?? `node:${node.id}`;
      scored.push({ nodeId, score, group });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  // Keep at most one semantic target per file.  Without this, a generated
  // entity's many getters can occupy the whole topK and hide controllers,
  // services and pages that implement the same capability.
  const diversified: Array<{ nodeId: string; score: number; group: string }> = [];
  const seenGroups = new Set<string>();
  for (const item of scored) {
    if (seenGroups.has(item.group)) continue;
    seenGroups.add(item.group);
    diversified.push(item);
    if (diversified.length >= topK) break;
  }
  for (const { nodeId, score } of diversified) {
    evidences.push({
      targetId: nodeId,
      source: 'semantic',
      baseWeight: Math.min(SEMANTIC_WEIGHT_CAP, score * 0.6),
    });
  }
}
