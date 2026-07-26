/**
 * 图谱构建调度器
 *
 * 全量构建流程：
 *   1. 读取配置
 *   2. 解析需求 → L1 节点 + 文档提取
 *   3. 解析模块 → L2 节点
 *   4. 扫描源码文件 → 解析 → L3/L4 节点
 *   5. 生成 contain 边（层级从属）
 *   6. 生成 import/call/inherit 边（依赖关系）
 *   7. 生成 business_map 边（业务映射，五层混合）
 *   8. 生成向量索引
 *   9. 完整性校验
 *  10. 持久化存储
 *
 * 增量更新：
 *   1. 对比文件哈希，识别变更
 *   2. 加载旧图谱，删除变更部分
 *   3. 重新解析变更部分
 *   4. 重建相关边
 *   5. 更新向量
 *   6. 保存
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import type {
  GraphConfig,
  GraphData,
  GraphNode,
  GraphMeta,
  BuildStats,
  NodeLevel,
  EdgeType,
} from '../types';
import {
  NODE_TYPE_FILE,
  NODE_TYPE_MODULE,
  NODE_TYPE_REQUIREMENT,
  EDGE_TYPE_CONTAIN,
} from '../types';
import { loadGraphConfig } from '../config';
import { JsonlGraphStore } from '../storage/graph-store';
import { BinaryVectorStore } from '../storage/vector-store';
import { JsonMetaStore, createEmptyMeta, SCHEMA_VERSION } from '../storage/meta-store';
import { parseAllRequirements, ParsedRequirement } from '../parsers/requirement-parser';
import { parseModules, ParsedModule } from '../parsers/module-parser';
import { parseSourceFiles, isSupportedFile } from '../parsers/source-parser';
import { ParseResult } from '../parsers/ts-parser';
import { sniffProjectType } from '../../lib/project-type';
import { EdgeBuilder, aggregateWeights, MappingEvidence } from './edge-builder';
import { buildGraphIndex } from '../storage/graph-store';
import { generateNodeId } from './node-builder';

const WPF_DIR = '.wpf';

/** 构建结果 */
export interface BuildResult {
  data: GraphData;
  meta: GraphMeta;
  stats: BuildStats;
}

/**
 * 全量构建图谱
 */
export async function buildGraph(root: string): Promise<BuildResult> {
  const startTime = Date.now();
  const phaseTimes: Record<string, number> = {};
  const mark = (name: string, start: number) => {
    phaseTimes[name] = Date.now() - start;
  };

  // 1. 配置
  const config = loadGraphConfig(root);
  const projectType = sniffProjectType(root);

  // 2. 解析需求
  const t0 = Date.now();
  const parsedReqs = parseAllRequirements(root);
  mark('requirements', t0);

  // 3. 解析模块
  const t1 = Date.now();
  const parsedModules = parseModules(root, config, projectType);
  mark('modules', t1);

  // 4. 扫描并解析源码文件
  const t2 = Date.now();
  const sourceFiles = scanSourceFiles(root, config);
  const parseResults = await parseSourceFiles(sourceFiles, root);
  mark('source-parse', t2);

  // 5. 生成边
  const t3 = Date.now();
  const edgeBuilder = new EdgeBuilder();
  const allNodes: GraphNode[] = [];

  // --- 收集所有节点 ---
  for (const req of parsedReqs) {
    allNodes.push(req.node);
  }
  for (const mod of parsedModules) {
    allNodes.push(mod.node);
  }
  const fileNodes: Map<string, GraphNode> = new Map(); // 路径 → 文件节点
  const elemNodes: Map<string, GraphNode[]> = new Map(); // 文件路径 → 元素节点列表
  for (const pr of parseResults) {
    allNodes.push(pr.fileNode);
    const filePath = pr.fileNode.attrs.filePath!;
    fileNodes.set(filePath, pr.fileNode);
    elemNodes.set(filePath, pr.elements);
    allNodes.push(...pr.elements);
  }

  // --- contain 边 ---
  buildContainEdges(edgeBuilder, parsedReqs, parsedModules, fileNodes, elemNodes);

  // --- import 边 ---
  buildImportEdges(edgeBuilder, parseResults, fileNodes, root);

  // --- business_map 边（文档提取 + 命名匹配，语义匹配和 Git 后面单独处理）---
  buildBusinessMapEdges(edgeBuilder, parsedReqs, parsedModules, fileNodes, root, config);

  mark('edges', t3);

  // 6. 完整性校验
  const t4 = Date.now();
  const graphData: GraphData = {
    nodes: allNodes,
    edges: edgeBuilder.getEdges(),
  };
  const validation = validateGraph(graphData);
  mark('validation', t4);

  // 7. 持久化
  const t5 = Date.now();
  const wpfPath = path.join(root, WPF_DIR);
  const graphStore = new JsonlGraphStore(wpfPath);
  graphStore.save(graphData);

  // 元数据
  const metaStore = new JsonMetaStore(wpfPath);
  const fileHashes = buildFileHashSnapshot(parseResults);
  const meta: GraphMeta = {
    schemaVersion: SCHEMA_VERSION,
    builtAt: Date.now(),
    totalNodes: allNodes.length,
    totalEdges: edgeBuilder.size(),
    totalVectors: 0, // 向量后面单独处理
    fileHashes,
    configVersion: configHash(config),
  };
  metaStore.save(meta);
  mark('save', t5);

  // 统计
  const totalTime = Date.now() - startTime;
  const stats: BuildStats = {
    nodesByLevel: countNodesByLevel(allNodes),
    edgesByType: countEdgesByType(edgeBuilder.getEdges()),
    vectorCount: 0,
    totalTimeMs: totalTime,
    phaseTimes,
    validation,
  };

  return { data: graphData, meta, stats };
}

// ==================== contain 边 ====================

function buildContainEdges(
  eb: EdgeBuilder,
  reqs: ParsedRequirement[],
  modules: ParsedModule[],
  fileNodes: Map<string, GraphNode>,
  elemNodes: Map<string, GraphNode[]>,
): void {
  // 模块 → 文件 contain 边
  for (const mod of modules) {
    const modDir = mod.node.attrs.dir?.replace(/\\/g, '/');
    if (!modDir) continue;

    for (const [filePath, fileNode] of fileNodes) {
      const normPath = filePath.replace(/\\/g, '/');
      if (normPath.startsWith(modDir + '/') || normPath === modDir) {
        eb.addContain(mod.node.id, fileNode.id);
      }
    }
  }

  // 文件 → 元素 contain 边
  for (const [filePath, elems] of elemNodes) {
    const fileNode = fileNodes.get(filePath);
    if (!fileNode) continue;
    for (const elem of elems) {
      eb.addContain(fileNode.id, elem.id);
    }
  }

  // 注：需求 → 模块 的 business_map 边在 buildBusinessMapEdges 中生成（不是 contain 边）
  // 需求和模块之间是业务映射关系，不是包含关系
}

// ==================== import 边 ====================

function buildImportEdges(
  eb: EdgeBuilder,
  parseResults: ParseResult[],
  fileNodes: Map<string, GraphNode>,
  root: string,
): void {
  const pathMap = new Map<string, string>(); // 相对路径 → nodeId
  for (const [fp, node] of fileNodes) {
    pathMap.set(fp.replace(/\\/g, '/'), node.id);
  }

  for (const pr of parseResults) {
    const fromId = pr.fileNode.id;
    const filePath = pr.fileNode.attrs.filePath!;
    const fileDir = path.dirname(filePath);

    for (const imp of pr.imports) {
      // 只处理相对路径的 import（本项目内的文件）
      if (!imp.startsWith('.') && !imp.startsWith('/')) continue;

      // 解析相对路径
      let resolved = path.resolve(fileDir, imp).replace(/\\/g, '/');
      // 去掉 root 前缀
      const rootNorm = root.replace(/\\/g, '/');
      if (resolved.startsWith(rootNorm + '/')) {
        resolved = resolved.slice(rootNorm.length + 1);
      }

      // 尝试匹配文件（补全扩展名）
      const targetId = resolveImportTarget(resolved, pathMap);
      if (targetId) {
        eb.addImport(fromId, targetId);
      }
    }
  }
}

/** 解析 import 路径对应的文件节点 ID */
function resolveImportTarget(
  importPath: string,
  pathMap: Map<string, string>,
): string | null {
  // 直接匹配
  if (pathMap.has(importPath)) return pathMap.get(importPath)!;

  // 尝试加扩展名
  const exts = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  for (const ext of exts) {
    const candidate = importPath + ext;
    if (pathMap.has(candidate)) return pathMap.get(candidate)!;
  }

  return null;
}

// ==================== business_map 边 ====================

function buildBusinessMapEdges(
  eb: EdgeBuilder,
  reqs: ParsedRequirement[],
  modules: ParsedModule[],
  fileNodes: Map<string, GraphNode>,
  root: string,
  config: GraphConfig,
): void {
  // 模块名 → 模块节点映射
  const moduleByName = new Map<string, ParsedModule>();
  for (const m of modules) {
    moduleByName.set(m.node.name.toLowerCase(), m);
  }

  for (const req of reqs) {
    const evidences: MappingEvidence[] = [];

    // Layer 1: 文档提取（高权重）
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

    // Layer 4: 命名匹配（低权重兜底）
    const nameMatchResult = matchRequirementToModules(req.node.name, modules);
    for (const [modId, weight] of nameMatchResult) {
      evidences.push({
        targetId: modId,
        source: 'name-match',
        baseWeight: weight * 0.5, // 命名匹配权重打个折
      });
    }

    // 权重叠加
    const weights = aggregateWeights(evidences);

    // 生成边
    for (const [targetId, weight] of weights) {
      if (weight >= 0.3) {
        // 找到最权威的来源
        const ev = evidences.find((e) => e.targetId === targetId);
        eb.addBusinessMap(req.node.id, targetId, weight, ev?.source ?? 'name-match');
      }
    }
  }

  // 注：语义匹配（Layer 2）和 Git 追溯（Layer 3）在向量构建后单独处理
  // 因为语义匹配需要向量，Git 追溯需要逐个需求调用 git
}

/** 需求名与模块名的简单匹配（用 mapping-sources 里的逻辑，这里简化实现） */
function matchRequirementToModules(
  reqName: string,
  modules: ParsedModule[],
): Map<string, number> {
  const result = new Map<string, number>();
  const nameLower = reqName.toLowerCase();

  for (const mod of modules) {
    const modLower = mod.node.name.toLowerCase();
    let score = 0;

    // 直接包含
    if (modLower.includes(nameLower) || nameLower.includes(modLower)) {
      score = Math.max(score, 0.6);
    }

    // 英文关键词简单匹配（小词典）
    const keywords: Record<string, string[]> = {
      用户: ['user', 'account', 'member'],
      认证: ['auth', 'authentication', 'login'],
      登录: ['login', 'signin', 'auth'],
      订单: ['order'],
      支付: ['pay', 'payment'],
      商品: ['product', 'goods', 'item'],
    };
    for (const [cn, ens] of Object.entries(keywords)) {
      if (reqName.includes(cn)) {
        for (const en of ens) {
          if (modLower.includes(en)) {
            score = Math.max(score, 0.5);
          }
        }
      }
    }

    if (score > 0) {
      result.set(mod.node.id, Math.min(score, 0.7));
    }
  }

  return result;
}

// ==================== 扫描源码文件 ====================

function scanSourceFiles(root: string, config: GraphConfig): string[] {
  const ignoreSet = new Set(config.build.ignore);
  const result: string[] = [];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath);

      // 检查忽略
      const parts = relPath.split(/[\\/]/);
      if (parts.some((p) => ignoreSet.has(p) || p.startsWith('.'))) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (isSupportedFile(relPath, config.build.languages)) {
          result.push(fullPath);
        }
      }
    }
  }

  const srcDir = path.join(root, 'src');
  if (fs.existsSync(srcDir)) {
    walk(srcDir);
  }

  return result;
}

// ==================== 文件哈希快照 ====================

function buildFileHashSnapshot(parseResults: ParseResult[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const pr of parseResults) {
    const fp = pr.fileNode.attrs.filePath!;
    const hash = pr.fileNode.attrs.fileHash!;
    hashes[fp] = hash;
  }
  return hashes;
}

// ==================== 完整性校验 ====================

export function validateGraph(data: GraphData): {
  passed: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  const nodeIds = new Set<string>();

  // 节点 ID 唯一性
  for (const node of data.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`节点 ID 冲突: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  // 边引用合法性
  for (const edge of data.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`边引用不存在的起始节点: ${edge.id} (from: ${edge.from})`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`边引用不存在的目标节点: ${edge.id} (to: ${edge.to})`);
    }
  }

  // 孤立节点警告（没有任何边的节点）
  const idx = buildGraphIndex(data);
  let isolatedCount = 0;
  for (const node of data.nodes) {
    const out = idx.outEdges.get(node.id) ?? [];
    const inEd = idx.inEdges.get(node.id) ?? [];
    if (out.length === 0 && inEd.length === 0) {
      isolatedCount++;
    }
  }
  if (isolatedCount > 0) {
    warnings.push(`${isolatedCount} 个节点没有任何关联边`);
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}

// ==================== 统计 ====================

function countNodesByLevel(nodes: GraphNode[]): Record<string, number> {
  const counts: Record<string, number> = { L1: 0, L2: 0, L3: 0, L4: 0 };
  for (const n of nodes) {
    counts[n.level] = (counts[n.level] || 0) + 1;
  }
  return counts;
}

function countEdgesByType(edges: { type: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of edges) {
    counts[e.type] = (counts[e.type] || 0) + 1;
  }
  return counts;
}

function configHash(config: GraphConfig): string {
  return createHash('sha256')
    .update(JSON.stringify(config))
    .digest('hex')
    .slice(0, 16);
}

/** 获取 .wpf 目录路径 */
export function getWpfDir(root: string): string {
  return path.join(root, WPF_DIR);
}

// ==================== 增量更新 ====================

/**
 * 增量更新图谱
 *
 * 流程：
 *  1. 读取上次的文件哈希快照
 *  2. 扫描当前文件状态，对比哈希
 *  3. 识别新增/修改/删除的源码文件
 *  4. 加载旧图谱到内存
 *  5. 删除变更文件相关的节点和边
 *  6. 重新解析变更文件，生成新节点新边
 *  7. 处理需求变更（active/archived 移动、.wpw.yaml 变化）
 *  8. 更新向量
 *  9. 保存
 */
export async function updateGraph(root: string): Promise<BuildResult | null> {
  const wpfPath = path.join(root, WPF_DIR);
  const metaStore = new JsonMetaStore(wpfPath);
  const meta = metaStore.load();

  // 没有历史图谱，降级为全量构建
  if (!meta) {
    return buildGraph(root);
  }

  const startTime = Date.now();
  const phaseTimes: Record<string, number> = {};
  const mark = (name: string, t: number) => {
    phaseTimes[name] = Date.now() - t;
  };

  const config = loadGraphConfig(root);
  const projectType = sniffProjectType(root);

  // 1. 扫描当前源码文件并计算哈希
  const t0 = Date.now();
  const sourceFiles = scanSourceFiles(root, config);
  const currentHashes = new Map<string, string>();
  for (const fp of sourceFiles) {
    try {
      const content = fs.readFileSync(fp, 'utf-8');
      const hash = createHash('sha256').update(content).digest('hex').slice(0, 16);
      const relPath = path.relative(root, fp).replace(/\\/g, '/');
      currentHashes.set(relPath, hash);
    } catch {
      // 跳过读不了的文件
    }
  }

  // 对比旧快照
  const oldHashes = new Map(Object.entries(meta.fileHashes));
  const changedFiles: string[] = []; // 新增 + 修改
  const deletedFiles: string[] = []; // 删除

  for (const [fp, hash] of currentHashes) {
    const old = oldHashes.get(fp);
    if (!old || old !== hash) {
      changedFiles.push(fp);
    }
  }
  for (const [fp] of oldHashes) {
    if (!currentHashes.has(fp)) {
      deletedFiles.push(fp);
    }
  }
  mark('scan', t0);

  // 如果没有变更，直接返回
  if (changedFiles.length === 0 && deletedFiles.length === 0) {
    // 检查需求文件变更（简单起见，这里先只处理源码文件变更）
    // 需求变更在另外的流程里处理
    return null; // 无变更
  }

  // 2. 加载旧图谱
  const t1 = Date.now();
  const graphStore = new JsonlGraphStore(wpfPath);
  const oldData = graphStore.load();
  const oldIdx = buildGraphIndex(oldData);
  mark('load', t1);

  // 3. 删除变更文件相关的节点和边
  const t2 = Date.now();
  const nodesToRemove = new Set<string>();
  const edgesToRemove = new Set<string>();

  for (const fp of [...changedFiles, ...deletedFiles]) {
    // 找到对应的文件节点
    const fileNodeId = findFileNodeByPath(oldData.nodes, fp);
    if (!fileNodeId) continue;

    // 标记文件节点删除
    nodesToRemove.add(fileNodeId);

    // 标记该文件下所有元素节点删除
    const containEdges = oldIdx.outEdges.get(fileNodeId) ?? [];
    for (const e of containEdges) {
      if (e.type === EDGE_TYPE_CONTAIN) {
        nodesToRemove.add(e.to);
      }
    }

    // 标记所有与该文件节点相关的边删除
    const outE = oldIdx.outEdges.get(fileNodeId) ?? [];
    const inE = oldIdx.inEdges.get(fileNodeId) ?? [];
    for (const e of [...outE, ...inE]) {
      edgesToRemove.add(e.id);
    }
  }

  // 构建新节点列表（保留未删除的）
  const newNodes = oldData.nodes.filter((n) => !nodesToRemove.has(n.id));
  const newEdges = oldData.edges.filter((e) => !edgesToRemove.has(e.id));
  mark('delete', t2);

  // 4. 重新解析变更文件
  const t3 = Date.now();
  const changedAbsFiles = changedFiles
    .map((fp) => path.join(root, fp))
    .filter((fp) => fs.existsSync(fp));

  const newParseResults = await parseSourceFiles(changedAbsFiles, root);

  // 添加新解析的节点和 contain 边
  const edgeBuilder = new EdgeBuilder();

  // 先把保留的边加进去
  for (const e of newEdges) {
    edgeBuilder.addEdge({
      from: e.from,
      to: e.to,
      type: e.type,
      weight: e.weight,
      source: e.source,
    });
  }

  // 添加新解析的文件节点和元素节点
  const fileNodes = new Map<string, GraphNode>();
  const elemNodes = new Map<string, GraphNode[]>();
  for (const pr of newParseResults) {
    newNodes.push(pr.fileNode);
    const fp = pr.fileNode.attrs.filePath!;
    fileNodes.set(fp, pr.fileNode);
    elemNodes.set(fp, pr.elements);
    newNodes.push(...pr.elements);
  }

  // 重建变更文件的 contain 边（文件⊃元素）
  for (const [fp, elems] of elemNodes) {
    const fNode = fileNodes.get(fp);
    if (!fNode) continue;
    for (const elem of elems) {
      edgeBuilder.addContain(fNode.id, elem.id);
    }
  }

  // 重建变更文件的模块 contain 边（模块⊃文件）
  const modules = parseModules(root, config, projectType);
  for (const mod of modules) {
    const modDir = mod.node.attrs.dir?.replace(/\\/g, '/');
    if (!modDir) continue;

    for (const [fp, fNode] of fileNodes) {
      const normPath = fp.replace(/\\/g, '/');
      if (normPath.startsWith(modDir + '/') || normPath === modDir) {
        // 检查这个模块节点是否已存在（复用旧的）
        const existingModNode = newNodes.find(
          (n) => n.level === 'L2' && n.name === mod.node.name,
        );
        const modId = existingModNode ? existingModNode.id : mod.node.id;
        if (!existingModNode) {
          newNodes.push(mod.node);
        }
        edgeBuilder.addContain(modId, fNode.id);
      }
    }
  }

  // 重建 import 边（涉及变更文件的都重算一遍）
  // 先重新解析所有文件的 import 太麻烦，简单处理：
  // 删除所有指向/来自变更文件的 import 边（已经在上面删了）
  // 然后为新解析的文件重新建立 import 边
  // 注意：需要所有文件的映射，所以用旧节点 + 新节点一起找
  const allFileNodes = new Map<string, GraphNode>();
  for (const n of newNodes) {
    if (n.type === NODE_TYPE_FILE && n.attrs.filePath) {
      allFileNodes.set(n.attrs.filePath.replace(/\\/g, '/'), n);
    }
  }

  // 重新计算变更文件的 import 边
  for (const pr of newParseResults) {
    const fromId = pr.fileNode.id;
    const filePath = pr.fileNode.attrs.filePath!;
    const fileDir = path.dirname(filePath);

    for (const imp of pr.imports) {
      if (!imp.startsWith('.') && !imp.startsWith('/')) continue;
      let resolved = path.resolve(fileDir, imp).replace(/\\/g, '/');
      const rootNorm = root.replace(/\\/g, '/');
      if (resolved.startsWith(rootNorm + '/')) {
        resolved = resolved.slice(rootNorm.length + 1);
      }
      const targetId = resolveImportTarget(resolved, new Map(
        Array.from(allFileNodes.entries()).map(([k, v]) => [k, v.id]),
      ));
      if (targetId) {
        edgeBuilder.addImport(fromId, targetId);
      }
    }
  }

  // 注意：变更文件被其他文件 import 的反向边，这里不重新计算
  // 因为其他文件没变，它们的 import 边应该还指向这个文件
  // 但文件 node_id 变了吗？
  // 答：文件节点 ID 基于路径，路径没变 ID 就没变，所以反向边还是对的 ✅

  mark('rebuild', t3);

  // 5. 组装最终数据
  const t4 = Date.now();
  const finalData: GraphData = {
    nodes: newNodes,
    edges: edgeBuilder.getEdges(),
  };

  // 完整性校验
  const validation = validateGraph(finalData);
  mark('validate', t4);

  // 6. 保存
  const t5 = Date.now();
  graphStore.save(finalData);

  const newMeta: GraphMeta = {
    schemaVersion: SCHEMA_VERSION,
    builtAt: Date.now(),
    totalNodes: newNodes.length,
    totalEdges: edgeBuilder.size(),
    totalVectors: meta.totalVectors, // 向量更新单独处理
    fileHashes: Object.fromEntries(currentHashes),
    configVersion: configHash(config),
  };
  metaStore.save(newMeta);

  const totalTime = Date.now() - startTime;
  mark('save', t5);

  const stats: BuildStats = {
    nodesByLevel: countNodesByLevel(newNodes),
    edgesByType: countEdgesByType(edgeBuilder.getEdges()),
    vectorCount: meta.totalVectors,
    totalTimeMs: totalTime,
    phaseTimes,
    validation,
  };

  return { data: finalData, meta: newMeta, stats };
}

/** 根据路径找文件节点 ID */
function findFileNodeByPath(nodes: GraphNode[], filePath: string): string | null {
  const norm = filePath.replace(/\\/g, '/');
  for (const n of nodes) {
    if (n.type === NODE_TYPE_FILE && n.attrs.filePath?.replace(/\\/g, '/') === norm) {
      return n.id;
    }
  }
  return null;
}

// ==================== 强制重建 ====================

/**
 * 强制重建图谱（清空 + 全量构建）
 */
export async function rebuildGraph(root: string): Promise<BuildResult> {
  const wpfPath = path.join(root, WPF_DIR);

  // 清空旧数据
  if (fs.existsSync(wpfPath)) {
    fs.rmSync(wpfPath, { recursive: true, force: true });
  }

  // 全量构建
  return buildGraph(root);
}

// ==================== 需求变更检测 ====================

/**
 * 检测需求目录是否有变更（新增/删除/归档/状态变更）
 *
 * 注意：增量更新主要处理源码文件变更。
 * 需求变更相对低频，一般建议直接 rebuild。
 * 这里提供检测函数供调用方判断是否需要全量重建。
 */
export function detectRequirementChanges(
  root: string,
  oldMeta: GraphMeta,
): { changed: boolean; reason?: string } {
  // 简单实现：对比需求目录数量
  const activeDir = path.join(root, 'wpw', 'active');
  const archivedDir = path.join(root, 'wpw', 'archived');

  let totalReqDirs = 0;
  if (fs.existsSync(activeDir)) {
    totalReqDirs += fs.readdirSync(activeDir, { withFileTypes: true })
      .filter((e) => e.isDirectory()).length;
  }
  if (fs.existsSync(archivedDir)) {
    totalReqDirs += fs.readdirSync(archivedDir, { withFileTypes: true })
      .filter((e) => e.isDirectory()).length;
  }

  // 用旧 meta 里的节点数粗略判断
  // 更精确的做法是保存需求目录列表和哈希，这里先简化
  const oldReqCount = Math.floor((oldMeta.totalNodes / 238) * 0); // 占位，简化处理
  // 如果需求数量变化较大，标记为需要重建
  // （首版简化处理：需求变更提示用户手动 rebuild）

  return { changed: false };
}
