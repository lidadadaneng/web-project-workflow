/**
 * 业务-代码映射（business_map 边）多源证据融合
 *
 * 已实现四源证据：
 *   - doc-extract  文档提取（高权重，直接证据）
 *   - semantic     语义匹配（间接证据，需向量索引）
 *   - git-history  Git 历史追溯（间接证据，按 commit 修改文件频次）
 *   - name-match   命名匹配（低权重兜底，中英词典 + 前缀/包含匹配）
 *
 * 未来工作：ai-refine（AI 校准，可选第 5 源，需接 LLM 调用，当前为配置桩，
 *           mode === 'ai-refine' 分支未实现）。
 *
 * 同一目标被多源命中时，按 noisy-OR 聚合权重（1 − ∏(1 − wᵢ)，上限 0.95），
 * 边的 source 字段取最权威证据源（与收集顺序无关）。
 *
 * 设计要点：
 *   - traceGit / isGit 可注入（默认 traceFromGit / isGitRepo），便于单测 mock
 *   - sources 开关支持消融实验（关闭某源后重建对比）
 *   - 语义回填仅对 L2 模块 / L3 文件生成（控制规模，不对 L4 逐一生成）
 */
import type { GraphConfig, GraphNode, VectorMapping } from '../types';
import { EdgeBuilder, aggregateWeights, type MappingEvidence } from './edge-builder';
import type { ParsedRequirement } from '../parsers/requirement-parser';
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
  reqs: ParsedRequirement[];
  modules: ParsedModule[];
  fileNodes: Map<string, GraphNode>;
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
 * @param eb 边构建器
 * @param ctx 构建上下文
 */
export function buildBusinessMapEdges(eb: EdgeBuilder, ctx: BusinessMapContext): void {
  const { reqs, modules, fileNodes, root, config, vectors, dimensions, mapping } = ctx;
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

  // 文件路径 -> 文件节点 ID（前向斜杠归一化，供 Git 历史追溯匹配）
  const filePathToNodeId = new Map<string, string>();
  for (const [fp, node] of fileNodes) {
    filePathToNodeId.set(fp.replace(/\\/g, '/'), node.id);
  }

  // 节点 ID -> 节点（供语义扫描取 L2/L3 节点）
  const nodeById = new Map<string, GraphNode>();
  for (const m of modules) nodeById.set(m.node.id, m.node);
  for (const [, n] of fileNodes) nodeById.set(n.id, n);

  // Git 前置判断（非 Git 仓库或关闭则整体跳过该源）
  const useGit = useGitSrc && config.mapping.gitHistory && isGit(root);
  const gitMinFreq = config.mapping.gitMinFreq ?? 2;

  // 语义阈值（未设置时回退 search.threshold）
  const semanticThreshold = config.mapping.semanticThreshold ?? config.search.threshold;
  const semanticTopK = config.mapping.semanticTopK ?? 5;
  const semanticReady =
    useSemantic && !!vectors && !!mapping && mapping.indexToNodeId.length > 0;

  if (useSemantic && !semanticReady) {
    // 向量缺失时提示（不阻断其余源）
    console.warn('[business-mapper] 向量索引缺失，语义映射源已跳过');
  }

  for (const req of reqs) {
    const evidences: MappingEvidence[] = [];

    if (useDoc) collectDocEvidences(req, moduleByName, evidences);
    if (useGit) collectGitEvidences(req, root, config, traceGit, filePathToNodeId, gitMinFreq, evidences);
    if (useName) collectNameEvidences(req, modules, moduleByName, evidences);
    if (semanticReady) {
      collectSemanticEvidences(
        req, vectors!, dimensions, mapping!, nodeById, semanticThreshold, semanticTopK, evidences,
      );
    }

    const aggregated = aggregateWeights(evidences);
    for (const [targetId, { weight, source }] of aggregated) {
      if (weight >= MIN_EDGE_WEIGHT) {
        eb.addBusinessMap(req.node.id, targetId, weight, source);
      }
    }
  }
}

// ==================== 各源证据收集 ====================

/** Layer 1: 文档提取（高权重直接证据） */
function collectDocEvidences(
  req: ParsedRequirement,
  moduleByName: Map<string, ParsedModule>,
  evidences: MappingEvidence[],
): void {
  for (const modName of req.extractedModules) {
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

/** Layer 4: 命名匹配（低权重兜底，完整中英词典 + 前缀/包含匹配） */
function collectNameEvidences(
  req: ParsedRequirement,
  modules: ParsedModule[],
  moduleByName: Map<string, ParsedModule>,
  evidences: MappingEvidence[],
): void {
  const moduleNames = modules.map((m) => m.node.name);
  const result = matchByName(req.node.name, moduleNames);
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

/** Layer 3: Git 历史追溯（间接证据，按 commit 修改文件频次）
 *
 * 导出以支持单测：可注入 traceGit mock，绕过真实 Git 仓库依赖。 */
export function collectGitEvidences(
  req: ParsedRequirement,
  root: string,
  config: GraphConfig,
  traceGit: GitTracer,
  filePathToNodeId: Map<string, string>,
  gitMinFreq: number,
  evidences: MappingEvidence[],
): void {
  const keywords = [req.node.name, ...req.extractedModules];
  const { fileCounts } = traceGit(root, keywords, config.mapping.gitMaxCommits);

  // 求最大频次用于归一化
  let maxFreq = 0;
  for (const freq of fileCounts.values()) {
    if (freq > maxFreq) maxFreq = freq;
  }
  if (maxFreq === 0) return;

  for (const [filePath, freq] of fileCounts) {
    if (freq < gitMinFreq) continue; // 过滤单次修改噪声
    const targetId = filePathToNodeId.get(filePath.replace(/\\/g, '/'));
    if (!targetId) continue; // 非项目源码文件（如配置/文档），跳过
    const normFreq = freq / maxFreq;
    evidences.push({
      targetId,
      source: 'git-history',
      baseWeight: Math.min(GIT_WEIGHT_CAP, normFreq * 0.6),
    });
  }
}

/**
 * Layer 2: 语义匹配（间接证据，需向量索引）
 *
 * 取需求节点向量，对所有 L2 模块 / L3 文件节点向量做余弦相似度线性扫描，
 * 取相似度 ≥ 阈值的 Top-K 作为语义证据。仅对 L2/L3 生成（控制规模）。
 *
 * 导出以支持单测：可注入构造的向量索引，绕过真实 Embedding 模型。
 */
export function collectSemanticEvidences(
  req: ParsedRequirement,
  vectors: Float32Array,
  dimensions: number,
  mapping: VectorMapping,
  nodeById: Map<string, GraphNode>,
  threshold: number,
  topK: number,
  evidences: MappingEvidence[],
): void {
  // 取需求节点的向量
  const reqIdx = mapping.nodeIdToIndex.get(req.node.id);
  if (reqIdx === undefined) return; // 该需求未生成向量（如无描述文本）
  const reqVecOffset = reqIdx * dimensions;
  const reqVec = vectors.subarray(reqVecOffset, reqVecOffset + dimensions);

  // 扫描所有向量，计算与 L2/L3 节点的相似度
  const total = mapping.indexToNodeId.length;
  const scored: Array<{ nodeId: string; score: number }> = [];
  for (let i = 0; i < total; i++) {
    const nodeId = mapping.indexToNodeId[i];
    if (nodeId === req.node.id) continue; // 跳过自身
    const node = nodeById.get(nodeId);
    if (!node) continue;
    // 仅对 L2 模块与 L3 文件生成语义证据（控制规模，不对 L4 逐一生成）
    if (node.level !== 'L2' && node.level !== 'L3') continue;

    const vecOffset = i * dimensions;
    const vec = vectors.subarray(vecOffset, vecOffset + dimensions);
    const sim = cosineSimilarity(reqVec, vec);
    if (sim >= threshold) {
      scored.push({ nodeId, score: sim });
    }
  }

  // Top-K（按相似度降序）
  scored.sort((a, b) => b.score - a.score);
  for (const { nodeId, score } of scored.slice(0, topK)) {
    evidences.push({
      targetId: nodeId,
      source: 'semantic',
      baseWeight: Math.min(SEMANTIC_WEIGHT_CAP, score * 0.6),
    });
  }
}
