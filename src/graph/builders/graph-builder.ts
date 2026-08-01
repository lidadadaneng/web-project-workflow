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
  VectorMapping,
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
import { VectorMappingStore } from '../storage/mapping-store';
import { JsonMetaStore, createEmptyMeta, SCHEMA_VERSION } from '../storage/meta-store';
import { parseAllRequirements, ParsedRequirement } from '../parsers/requirement-parser';
import { parseModules, ParsedModule } from '../parsers/module-parser';
import { parseSourceFiles, isSupportedFile } from '../parsers/source-parser';
import { ParseResult } from '../parsers/ts-parser';
import { sniffProjectType } from '../../lib/project-type';
import { EdgeBuilder } from './edge-builder';
import { buildBusinessMapEdges } from './business-mapper';
import { buildGraphIndex } from '../storage/graph-store';
import { generateNodeId } from './node-builder';
import { buildNodeVectors } from './vector-builder';

const WPF_DIR = path.join('wpw', 'knowledge', 'graph');

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
  const piniaStoreNodes: Map<string, GraphNode> = new Map(); // store id → store 节点
  const piniaElemByStore: Map<string, GraphNode[]> = new Map(); // store id → 子元素列表
  for (const pr of parseResults) {
    allNodes.push(pr.fileNode);
    const filePath = pr.fileNode.attrs.filePath!;
    fileNodes.set(filePath, pr.fileNode);
    elemNodes.set(filePath, pr.elements);
    allNodes.push(...pr.elements);

    // Pinia store 节点（L3）
    if (pr.piniaStores && pr.piniaStores.length > 0) {
      for (const store of pr.piniaStores) {
        allNodes.push(store);
        piniaStoreNodes.set(store.name, store);
        // 收集该 store 的子元素（从 elements 中筛选 parentName === storeId 的）
        const storeElems = pr.elements.filter(
          (el) => el.attrs.parentName === store.name &&
            (el.type === 'pinia-action' || el.type === 'pinia-getter' || el.type === 'pinia-state'),
        );
        piniaElemByStore.set(store.name, storeElems);
      }
    }
  }

  // --- contain 边 ---
  buildContainEdges(edgeBuilder, parsedReqs, parsedModules, fileNodes, elemNodes);
  // Pinia 从属边：file → store (defined_in/contain) 和 store → action/getter/state (contain)
  buildPiniaContainEdges(edgeBuilder, parseResults, fileNodes, piniaStoreNodes, piniaElemByStore);

  // --- import 边 ---
  buildImportEdges(edgeBuilder, parseResults, fileNodes, root);

  // --- Pinia call 边（组件 → action 调用） ---
  buildPiniaCallEdges(edgeBuilder, parseResults, root, piniaStoreNodes, piniaElemByStore);
  mark('edges', t3);

  // 6. 向量索引（在 business_map 之前构建，供语义回填使用；先在内存中保留，稍后持久化）
  const tVec = Date.now();
  let vectors: Float32Array | null = null;
  let vectorDimensions = 0;
  let vectorMapping: VectorMapping | null = null;
  let vectorCount = 0;
  if (config.embedding.enabled) {
    try {
      const result = await buildNodeVectors(
        allNodes,
        config.embedding.model,
        config.embedding.mirror,
      );
      vectors = result.vectors;
      vectorDimensions = result.dimensions;
      vectorMapping = result.mapping;
      vectorCount = result.mapping.indexToNodeId.length;
    } catch (e) {
      console.warn(
        `[graph-builder] 向量构建失败，跳过（语义检索/语义映射将不可用）: ${(e as Error).message}`,
      );
      vectors = null;
    }
  }
  mark('vectors', tVec);

  // 7. business_map 边（四源证据融合：doc / semantic / git / name）
  //    语义回填依赖向量索引，故必须在向量构建之后
  const tBiz = Date.now();
  buildBusinessMapEdges(edgeBuilder, {
    reqs: parsedReqs,
    modules: parsedModules,
    fileNodes,
    root,
    config,
    vectors,
    dimensions: vectorDimensions,
    mapping: vectorMapping,
  });
  mark('business-map', tBiz);

  // 8. 完整性校验
  const t4 = Date.now();
  const graphData: GraphData = {
    nodes: allNodes,
    edges: edgeBuilder.getEdges(),
  };
  const validation = validateGraph(graphData);
  mark('validation', t4);

  // 9. 持久化（图谱 + 向量索引 + 元数据）
  const t5 = Date.now();
  const wpfPath = path.join(root, WPF_DIR);
  const graphStore = new JsonlGraphStore(wpfPath);
  graphStore.save(graphData);

  if (vectors && vectorMapping && vectors.length > 0) {
    const vectorStore = new BinaryVectorStore(wpfPath);
    vectorStore.save(vectors, vectorDimensions);

    const mappingStore = new VectorMappingStore(wpfPath);
    mappingStore.save(vectorMapping);
  }

  // 10. 元数据
  const metaStore = new JsonMetaStore(wpfPath);
  const fileHashes = buildFileHashSnapshot(parseResults);
  const meta: GraphMeta = {
    schemaVersion: SCHEMA_VERSION,
    builtAt: Date.now(),
    totalNodes: allNodes.length,
    totalEdges: edgeBuilder.size(),
    totalVectors: vectorCount,
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
    vectorCount,
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

// ==================== Pinia contain 边 ====================

/**
 * 构建 Pinia 相关的 contain 边：
 *   file → pinia-store（文件包含 store 定义）
 *   pinia-store → action/getter/state（store 包含子元素）
 */
function buildPiniaContainEdges(
  eb: EdgeBuilder,
  parseResults: ParseResult[],
  fileNodes: Map<string, GraphNode>,
  piniaStores: Map<string, GraphNode>,
  piniaElemByStore: Map<string, GraphNode[]>,
): void {
  // 建立 file → store 的 contain 边
  for (const pr of parseResults) {
    if (!pr.piniaStores || pr.piniaStores.length === 0) continue;
    const fileNode = pr.fileNode;
    for (const store of pr.piniaStores) {
      eb.addContain(fileNode.id, store.id);
    }
  }

  // 建立 store → action/getter/state 的 contain 边
  for (const [storeId, elems] of piniaElemByStore) {
    const storeNode = piniaStores.get(storeId);
    if (!storeNode) continue;
    for (const elem of elems) {
      eb.addContain(storeNode.id, elem.id);
    }
  }
}

// ==================== Pinia call 边 ====================

/**
 * 构建组件/文件 → Pinia action 的调用边。
 *
 * 识别模式（启发式）：
 *   1. import { useXxxStore } from '@/stores/xxx' → 识别 store hook
 *   2. const xxx = useXxxStore() → 识别 store 变量名
 *   3. xxx.someAction( → 识别 action 调用
 *
 * 只在能关联到已知 pinia action 节点时才建边。
 */
function buildPiniaCallEdges(
  eb: EdgeBuilder,
  parseResults: ParseResult[],
  root: string,
  piniaStores: Map<string, GraphNode>,
  piniaElemByStore: Map<string, GraphNode[]>,
): void {
  // 构建 store hook 名 → store id 的映射
  // 例如 useAuthStore → useAuthStore（通常和 store id 相同）
  // 也处理 import { useAuthStore as xxx } 的情况

  for (const pr of parseResults) {
    const fileNode = pr.fileNode;
    const filePath = fileNode.attrs.filePath;
    if (!filePath) continue;

    // 读取源码（parseResults 里没有存 source，从文件读）
    let source: string;
    try {
      source = require('fs').readFileSync(path.join(root, filePath), 'utf-8');
    } catch {
      continue;
    }

    // 从 import 语句中识别引入了哪些 store hook
    // 模式：import { useXxxStore } from '.../stores/xxx'
    const storeHookNames: string[] = [];
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*stores?\/[^'"]+['"]/g;
    let match;
    while ((match = importRegex.exec(source)) !== null) {
      const specifiers = match[1].split(',').map((s: string) => s.trim());
      for (const spec of specifiers) {
        // 处理 alias: useXxxStore as xxx
        const aliasMatch = spec.match(/^(\w+)\s+as\s+(\w+)$/);
        if (aliasMatch) {
          storeHookNames.push(aliasMatch[2]); // alias 名
        } else if (/^use\w+Store$/.test(spec)) {
          storeHookNames.push(spec);
        }
      }
    }

    if (storeHookNames.length === 0) continue;

    // 查找 useXxxStore() 调用后赋值的变量名
    const storeVarToHook = new Map<string, string>(); // 变量名 → hook名
    for (const hookName of storeHookNames) {
      // 模式：const xxx = useXxxStore()
      const varRegex = new RegExp(
        `(?:const|let|var)\\s+(\\w+)\\s*=\\s*${hookName}\\s*\\(`,
        'g',
      );
      let varMatch;
      while ((varMatch = varRegex.exec(source)) !== null) {
        storeVarToHook.set(varMatch[1], hookName);
      }
    }

    // 检测 storeVar.action() 调用
    for (const [storeVar, hookName] of storeVarToHook) {
      // hookName 通常就是 store id（useAuthStore 的 id 就是 useAuthStore）
      const storeId = hookName;
      const storeNode = piniaStores.get(storeId);
      if (!storeNode) continue;

      const storeElems = piniaElemByStore.get(storeId) || [];
      const actionNames = new Set(
        storeElems.filter((e) => e.type === 'pinia-action').map((e) => e.name),
      );
      if (actionNames.size === 0) continue;

      // 匹配 storeVar.actionName(
      const callRegex = new RegExp(
        `${storeVar}\\.(${Array.from(actionNames).join('|')})\\s*\\(`,
        'g',
      );
      const calledActions = new Set<string>();
      let callMatch;
      while ((callMatch = callRegex.exec(source)) !== null) {
        calledActions.add(callMatch[1]);
      }

      // 建边：从文件节点 → action 节点（也可以从组件节点，这里用文件节点简化）
      for (const actionName of calledActions) {
        const actionNode = storeElems.find(
          (e) => e.type === 'pinia-action' && e.name === actionName,
        );
        if (actionNode) {
          eb.addCall(fileNode.id, actionNode.id);
        }
      }
    }

    // 同时处理 mapActions 模式
    const mapActionsRegex = /mapActions\s*\(\s*['"](\w+)['"]\s*,\s*\[([^\]]+)\]/g;
    let mapMatch;
    while ((mapMatch = mapActionsRegex.exec(source)) !== null) {
      const storeId = mapMatch[1];
      const actionsStr = mapMatch[2];
      const actionNames = actionsStr
        .split(',')
        .map((s: string) => s.trim().replace(/['"]/g, ''))
        .filter(Boolean);

      const storeNode = piniaStores.get(storeId) || piniaStores.get(`use${capitalize(storeId)}Store`);
      if (!storeNode) continue;

      const storeElems = piniaElemByStore.get(storeNode.name) || [];
      for (const actionName of actionNames) {
        const actionNode = storeElems.find(
          (e) => e.type === 'pinia-action' && e.name === actionName,
        );
        if (actionNode) {
          eb.addCall(fileNode.id, actionNode.id);
        }
      }
    }
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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

/** 获取图谱产物目录路径（wpw/knowledge/graph/） */
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

  // Schema 版本检查：主版本号不同视为不兼容，降级为全量构建
  if (!isSchemaCompatible(meta.schemaVersion, SCHEMA_VERSION)) {
    console.warn(
      `[graph-builder] 图谱 schema 版本不兼容（当前: ${meta.schemaVersion}, 需要: ${SCHEMA_VERSION}），正在全量重建...`,
    );
    console.warn('[graph-builder] 原因：需求节点 ID 生成规则变更，需重建以保证数据一致性。');
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

  const hasFileChanges = changedFiles.length > 0 || deletedFiles.length > 0;

  // 2. 加载旧图谱
  const t1 = Date.now();
  const graphStore = new JsonlGraphStore(wpfPath);
  const oldData = graphStore.load();
  const oldIdx = buildGraphIndex(oldData);
  mark('load', t1);

  // 3. 检测需求变更
  const tReq = Date.now();
  const reqChanges = detectRequirementChanges(root, oldData.nodes);
  const hasReqChanges = reqChanges.length > 0;
  mark('req-detect', tReq);

  // 如果既没有文件变更，也没有需求变更，直接返回
  if (!hasFileChanges && !hasReqChanges) {
    return null;
  }

  // 4. 删除变更文件相关的节点和边
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

  // 删除变更的需求节点及其所有关联边
  // added 类型不用删（本来就没有），modified 先删后重建，deleted 直接删
  const reqsToRebuild = reqChanges.filter(
    (c) => c.type === 'added' || c.type === 'modified' || c.type === 'deleted',
  );
  for (const rc of reqsToRebuild) {
    const reqNode = oldData.nodes.find(
      (n) => n.type === NODE_TYPE_REQUIREMENT && n.name === rc.name,
    );
    if (reqNode) {
      nodesToRemove.add(reqNode.id);
      // 删除所有与该需求相关的边
      const outE = oldIdx.outEdges.get(reqNode.id) ?? [];
      const inE = oldIdx.inEdges.get(reqNode.id) ?? [];
      for (const e of [...outE, ...inE]) {
        edgesToRemove.add(e.id);
      }
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

  // 处理需求变更：添加新增/修改的需求节点
  // 注意：需求节点的 business_map 边暂不在增量更新中重建
  // （与文件变更的 business_map 边处理一致，首版简化：需求有变更建议全量 rebuild）
  const addedOrModifiedReqs = reqChanges.filter(
    (c) => (c.type === 'added' || c.type === 'modified') && c.parsed,
  );
  for (const rc of addedOrModifiedReqs) {
    if (rc.parsed) {
      newNodes.push(rc.parsed.node);
    }
  }

  // 添加新解析的文件节点和元素节点
  const fileNodes = new Map<string, GraphNode>();
  const elemNodes = new Map<string, GraphNode[]>();
  const piniaStoreMap = new Map<string, GraphNode>(); // storeId → store 节点
  const piniaElemByStore = new Map<string, GraphNode[]>();
  for (const pr of newParseResults) {
    newNodes.push(pr.fileNode);
    const fp = pr.fileNode.attrs.filePath!;
    fileNodes.set(fp, pr.fileNode);
    elemNodes.set(fp, pr.elements);
    newNodes.push(...pr.elements);

    // Pinia store 节点
    if (pr.piniaStores && pr.piniaStores.length > 0) {
      for (const store of pr.piniaStores) {
        newNodes.push(store);
        piniaStoreMap.set(store.name, store);
        const storeElems = pr.elements.filter(
          (el) => el.attrs.parentName === store.name &&
            (el.type === 'pinia-action' || el.type === 'pinia-getter' || el.type === 'pinia-state'),
        );
        piniaElemByStore.set(store.name, storeElems);
      }
    }
  }

  // 重建变更文件的 contain 边（文件⊃元素）
  for (const [fp, elems] of elemNodes) {
    const fNode = fileNodes.get(fp);
    if (!fNode) continue;
    for (const elem of elems) {
      edgeBuilder.addContain(fNode.id, elem.id);
    }
  }

  // 重建 Pinia contain 边（文件⊃store, store⊃action/getter/state）
  for (const pr of newParseResults) {
    if (!pr.piniaStores || pr.piniaStores.length === 0) continue;
    const fNode = pr.fileNode;
    for (const store of pr.piniaStores) {
      edgeBuilder.addContain(fNode.id, store.id);
    }
  }
  for (const [storeId, elems] of piniaElemByStore) {
    const storeNode = piniaStoreMap.get(storeId);
    if (!storeNode) continue;
    for (const elem of elems) {
      edgeBuilder.addContain(storeNode.id, elem.id);
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

  // 6. 保存图谱
  const t5 = Date.now();
  graphStore.save(finalData);

  // 7. 重建向量索引（首版简化：增量更新也全量重建向量）
  let vectorCount = meta.totalVectors;
  if (config.embedding.enabled) {
    try {
      const tVec = Date.now();
      const { vectors, dimensions, mapping } = await buildNodeVectors(
        newNodes,
        config.embedding.model,
        config.embedding.mirror,
      );

      if (vectors.length > 0) {
        const vectorStore = new BinaryVectorStore(wpfPath);
        vectorStore.save(vectors, dimensions);

        const mappingStore = new VectorMappingStore(wpfPath);
        mappingStore.save(mapping);

        vectorCount = mapping.indexToNodeId.length;
      }
      mark('vectors', tVec);
    } catch (e) {
      console.warn(
        `[graph-builder] 向量构建失败，跳过: ${(e as Error).message}`,
      );
    }
  }

  // 8. 元数据
  const newMeta: GraphMeta = {
    schemaVersion: SCHEMA_VERSION,
    builtAt: Date.now(),
    totalNodes: newNodes.length,
    totalEdges: edgeBuilder.size(),
    totalVectors: vectorCount,
    fileHashes: Object.fromEntries(currentHashes),
    configVersion: configHash(config),
  };
  metaStore.save(newMeta);

  const totalTime = Date.now() - startTime;
  mark('save', t5);

  const stats: BuildStats = {
    nodesByLevel: countNodesByLevel(newNodes),
    edgesByType: countEdgesByType(edgeBuilder.getEdges()),
    vectorCount,
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

// ==================== 工具函数 ====================

/**
 * 判断两个 schema 版本是否兼容
 *
 * 规则：主版本号不同视为不兼容（破坏性变更）。
 * 次版本号和修订号不同都视为兼容，可以增量更新。
 */
function isSchemaCompatible(oldVersion: string, newVersion: string): boolean {
  const oldMajor = parseInt(oldVersion.split('.')[0], 10);
  const newMajor = parseInt(newVersion.split('.')[0], 10);
  return oldMajor === newMajor;
}

// ==================== 需求变更检测 ====================

/** 需求变更类型 */
interface RequirementChange {
  name: string;
  type: 'added' | 'archived' | 'modified' | 'deleted';
  parsed?: ParsedRequirement;
}

/**
 * 检测需求层面的变更（新增、归档、状态/内容变更）
 *
 * 通过全量重解析当前所有需求，与旧图谱中的需求节点对比，
 * 识别出新增、归档、属性变更的需求。
 *
 * @returns 变更列表
 */
function detectRequirementChanges(
  root: string,
  oldNodes: GraphNode[],
): RequirementChange[] {
  const changes: RequirementChange[] = [];

  // 全量重解析当前所有需求（active + archived）
  const currentReqs = parseAllRequirements(root);
  const currentMap = new Map(currentReqs.map((r) => [r.node.name, r]));

  // 旧图谱中的需求节点
  const oldReqNodes = oldNodes.filter((n) => n.type === NODE_TYPE_REQUIREMENT);
  const oldMap = new Map(oldReqNodes.map((n) => [n.name, n]));

  // 检测新增和修改
  for (const [name, current] of currentMap) {
    const old = oldMap.get(name);
    if (!old) {
      changes.push({ name, type: 'added', parsed: current });
    } else {
      // 检查是否有属性变更（archived 状态、docPath、status）
      const oldStatus = old.attrs.status;
      const newStatus = current.node.attrs.status;
      const oldDocPath = old.attrs.docPath;
      const newDocPath = current.node.attrs.docPath;
      const oldFeatures = JSON.stringify(old.attrs.features || []);
      const newFeatures = JSON.stringify(current.node.attrs.features || []);

      const statusChanged =
        oldStatus?.archived !== newStatus?.archived ||
        JSON.stringify(oldStatus?.artifacts || {}) !==
          JSON.stringify(newStatus?.artifacts || {});
      const docPathChanged = oldDocPath !== newDocPath;
      const featuresChanged = oldFeatures !== newFeatures;

      if (statusChanged || docPathChanged || featuresChanged) {
        changes.push({ name, type: 'modified', parsed: current });
      }
    }
  }

  // 检测删除（需求被彻底删除，不是归档）
  for (const [name] of oldMap) {
    if (!currentMap.has(name)) {
      changes.push({ name, type: 'deleted' });
    }
  }

  return changes;
}
