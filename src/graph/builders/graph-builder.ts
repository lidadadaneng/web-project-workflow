/**
 * 图谱构建调度器
 *
 * 全量构建流程（C + L1/L2/L3 架构）：
 *   1. 读取配置
 *   2. 解析能力 specs → C 层节点
 *   3. 解析模块 → L1 节点
 *   4. 扫描源码文件 → 解析 → L2/L3 节点
 *   5. 生成 contain 边（L1 ⊃ L2 ⊃ L3）
 *   6. 生成 import/call/inherit 边（依赖关系）
 *   7. 生成 business_map 边（C → L1/L2/L3，多源证据融合）
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
import { CURRENT_SCHEMA_VERSION } from '../types';
import {
  NODE_TYPE_FILE,
  NODE_TYPE_MODULE,
  NODE_TYPE_CAPABILITY,
  EDGE_TYPE_CONTAIN,
} from '../types';
import { loadGraphConfig } from '../config';
import { JsonlGraphStore } from '../storage/graph-store';
import { BinaryVectorStore } from '../storage/vector-store';
import { VectorMappingStore } from '../storage/mapping-store';
import { JsonMetaStore, createEmptyMeta } from '../storage/meta-store';
import { parseAllCapabilities, ParsedCapability } from '../parsers/capability-parser';
import { parseModules, ParsedModule } from '../parsers/module-parser';
import { parseSourceFiles, isSupportedFile } from '../parsers/source-parser';
import { ParseResult } from '../parsers/ts-parser';
import { isMiniprogramProject, parseMiniprogramProject } from '../parsers/miniprogram-parser';
import { isUniappProject, parseUniappProject } from '../parsers/uniapp-parser';
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

/** 构建阶段 */
export type BuildPhase =
  | 'capabilities'
  | 'modules'
  | 'source-scan'
  | 'source-parse'
  | 'edges'
  | 'vectors'
  | 'business-map'
  | 'validation'
  | 'save';

/** 构建进度回调信息 */
export interface BuildProgress {
  /** 当前阶段 */
  phase: BuildPhase;
  /** 阶段显示名 */
  phaseLabel: string;
  /** 总体进度（0-1） */
  overall: number;
  /** 当前阶段内进度（0-1，没有细粒度则为 undefined） */
  phaseProgress?: number;
  /** 当前阶段详情文本（如正在解析的文件名） */
  detail?: string;
}

/** 构建进度回调 */
export type BuildProgressCallback = (progress: BuildProgress) => void;

/** 各阶段权重（占总进度比例） */
const PHASE_WEIGHTS: Record<BuildPhase, number> = {
  'capabilities': 2,
  'modules': 3,
  'source-scan': 5,
  'source-parse': 35,
  'edges': 10,
  'vectors': 30,
  'business-map': 8,
  'validation': 2,
  'save': 5,
};

const PHASE_LABELS: Record<BuildPhase, string> = {
  'capabilities': '解析能力规范',
  'modules': '解析模块结构',
  'source-scan': '扫描源码文件',
  'source-parse': '解析源码文件',
  'edges': '构建关系边',
  'vectors': '生成向量索引',
  'business-map': '构建业务映射',
  'validation': '完整性校验',
  'save': '持久化存储',
};

const ALL_PHASES: BuildPhase[] = [
  'capabilities', 'modules', 'source-scan', 'source-parse',
  'edges', 'vectors', 'business-map', 'validation', 'save',
];

const TOTAL_WEIGHT = ALL_PHASES.reduce((s, p) => s + PHASE_WEIGHTS[p], 0);

/** 计算累计到某阶段（不含该阶段）的权重 */
function weightBefore(phase: BuildPhase): number {
  let w = 0;
  for (const p of ALL_PHASES) {
    if (p === phase) break;
    w += PHASE_WEIGHTS[p];
  }
  return w;
}

/**
 * 全量构建图谱
 */
export async function buildGraph(root: string, onProgress?: BuildProgressCallback): Promise<BuildResult> {
  const startTime = Date.now();
  const phaseTimes: Record<string, number> = {};
  const mark = (name: string, start: number) => {
    phaseTimes[name] = Date.now() - start;
  };

  /** 汇报阶段进度 */
  const report = (phase: BuildPhase, phaseProgress?: number, detail?: string) => {
    if (!onProgress) return;
    const before = weightBefore(phase);
    const phaseW = PHASE_WEIGHTS[phase];
    const overall = (before + (phaseProgress ?? 0) * phaseW) / TOTAL_WEIGHT;
    onProgress({
      phase,
      phaseLabel: PHASE_LABELS[phase],
      overall,
      phaseProgress,
      detail,
    });
  };

  // 1. 配置
  const config = loadGraphConfig(root);
  const projectType = sniffProjectType(root);

  // 2. 解析能力 specs → C 层节点
  report('capabilities', 0);
  const t0 = Date.now();
  const parsedCaps = parseAllCapabilities(root);
  mark('capabilities', t0);
  report('capabilities', 1, `${parsedCaps.length} 个能力`);

  // 3. 解析模块 → L1 节点
  report('modules', 0);
  const t1 = Date.now();
  const parsedModules = parseModules(root, config, projectType);
  mark('modules', t1);
  report('modules', 1, `${parsedModules.length} 个模块`);

  // 4. 扫描并解析源码文件 → L2/L3 节点
  report('source-scan', 0);
  const t2 = Date.now();
  const sourceFiles = scanSourceFiles(root, config);
  report('source-scan', 1, `${sourceFiles.length} 个文件`);

  report('source-parse', 0, `0/${sourceFiles.length}`);
  const parseResults = await parseSourceFiles(sourceFiles, root, (done, total, fileName) => {
    report('source-parse', done / total, `${done}/${total}  ${fileName}`);
  });
  mark('source-parse', t2);
  report('source-parse', 1, `${sourceFiles.length} 个文件`);

  // 5. 生成边
  report('edges', 0);
  const t3 = Date.now();
  const edgeBuilder = new EdgeBuilder();
  const allNodes: GraphNode[] = [];

  // --- 收集所有节点 ---
  for (const cap of parsedCaps) {
    allNodes.push(cap.node);
  }
  for (const mod of parsedModules) {
    allNodes.push(mod.node);
  }
  const fileNodes: Map<string, GraphNode> = new Map(); // 路径 → 文件节点
  const elemNodes: Map<string, GraphNode[]> = new Map(); // 文件路径 → 元素节点列表
  const piniaStoreNodes: Map<string, GraphNode> = new Map(); // store id → store 节点
  const piniaElemByStore: Map<string, GraphNode[]> = new Map(); // store id → 子元素列表
  const vuexStoreNodes: Map<string, GraphNode> = new Map(); // store name → store 节点
  const vuexElemByStore: Map<string, GraphNode[]> = new Map(); // store name → 子元素列表
  const reduxSliceNodes: Map<string, GraphNode> = new Map(); // slice name → slice 节点
  const reduxElemBySlice: Map<string, GraphNode[]> = new Map(); // slice name → 子元素列表
  for (const pr of parseResults) {
    allNodes.push(pr.fileNode);
    const filePath = pr.fileNode.attrs.filePath!;
    fileNodes.set(filePath, pr.fileNode);
    // 过滤掉 pinia 元素——它们由 pinia-store contain，不直接挂在 file 下
    const nonPiniaElems = pr.elements.filter(
      (el) => el.type !== 'pinia-action' && el.type !== 'pinia-getter' && el.type !== 'pinia-state',
    );
    elemNodes.set(filePath, nonPiniaElems);
    allNodes.push(...pr.elements);

    // Pinia store 节点（L2）
    if (pr.piniaStores && pr.piniaStores.length > 0) {
      for (const store of pr.piniaStores) {
        allNodes.push(store);
        piniaStoreNodes.set(store.name, store);
        const storeElems = pr.elements.filter(
          (el) => el.attrs.parentName === store.name &&
            (el.type === 'pinia-action' || el.type === 'pinia-getter' || el.type === 'pinia-state'),
        );
        piniaElemByStore.set(store.name, storeElems);
      }
    }

    // Vuex store 节点（L2）
    if (pr.vuexStores && pr.vuexStores.length > 0) {
      for (const store of pr.vuexStores) {
        allNodes.push(store);
        vuexStoreNodes.set(store.name, store);
        const storeElems = pr.elements.filter(
          (el) => el.attrs.parentName === store.name &&
            (el.type === 'vuex-state' || el.type === 'vuex-mutation' ||
              el.type === 'vuex-action' || el.type === 'vuex-getter'),
        );
        vuexElemByStore.set(store.name, storeElems);
      }
    }

    // Redux slice 节点（L2）
    if (pr.reduxSlices && pr.reduxSlices.length > 0) {
      for (const slice of pr.reduxSlices) {
        allNodes.push(slice);
        reduxSliceNodes.set(slice.name, slice);
        const sliceElems = pr.elements.filter(
          (el) => el.attrs.parentName === slice.name &&
            (el.type === 'redux-state' || el.type === 'redux-reducer' ||
              el.type === 'redux-action' || el.type === 'redux-selector'),
        );
        reduxElemBySlice.set(slice.name, sliceElems);
      }
    }
  }

  // --- 小程序节点与边（项目级解析） ---
  let mpResult: ReturnType<typeof parseMiniprogramProject> | null = null;
  const isMpProject = config.build.frameworks.includes('miniprogram') ||
    (config.build.frameworks.length === 0 && isMiniprogramProject(root));
  if (isMpProject) {
    try {
      mpResult = parseMiniprogramProject(root);
      if (mpResult.appNode) allNodes.push(mpResult.appNode);
      allNodes.push(...mpResult.pages);
      allNodes.push(...mpResult.components);
      allNodes.push(...mpResult.elements);
    } catch (e) {
      console.warn(`[graph-builder] 小程序解析失败: ${(e as Error).message}`);
    }
  }

  // --- uni-app 节点与边（项目级解析） ---
  let uniResult: ReturnType<typeof parseUniappProject> | null = null;
  const isUniProject = config.build.frameworks.includes('uniapp') ||
    (config.build.frameworks.length === 0 && isUniappProject(root));
  if (isUniProject) {
    try {
      uniResult = parseUniappProject(root);
      allNodes.push(...uniResult.pages);
      allNodes.push(...uniResult.elements);
    } catch (e) {
      console.warn(`[graph-builder] uni-app 解析失败: ${(e as Error).message}`);
    }
  }

  // --- contain 边：L1 ⊃ L2 ⊃ L3 ---
  buildContainEdges(edgeBuilder, parsedModules, fileNodes, elemNodes);
  // Pinia 从属边
  buildPiniaContainEdges(edgeBuilder, parseResults, fileNodes, piniaStoreNodes, piniaElemByStore);
  // Vuex 从属边
  buildVuexContainEdges(edgeBuilder, parseResults, fileNodes, vuexStoreNodes, vuexElemByStore);
  // Redux 从属边
  buildReduxContainEdges(edgeBuilder, parseResults, fileNodes, reduxSliceNodes, reduxElemBySlice);

  // 小程序从属边及其它边
  if (mpResult) {
    for (const edge of mpResult.containEdges) edgeBuilder.addRawEdge(edge);
    for (const edge of mpResult.navigateEdges) edgeBuilder.addRawEdge(edge);
    for (const edge of mpResult.useComponentEdges) edgeBuilder.addRawEdge(edge);
    for (const edge of mpResult.bindEventEdges) edgeBuilder.addRawEdge(edge);
    for (const edge of mpResult.bindDataEdges) edgeBuilder.addRawEdge(edge);
    // L1 (mp-app) contain L2 (pages/components)
    if (mpResult.appNode) {
      for (const page of mpResult.pages) {
        edgeBuilder.addEdge({
          from: mpResult.appNode.id,
          to: page.id,
          type: EDGE_TYPE_CONTAIN,
          weight: 1.0,
          source: 'structure',
        });
      }
      for (const comp of mpResult.components) {
        edgeBuilder.addEdge({
          from: mpResult.appNode.id,
          to: comp.id,
          type: EDGE_TYPE_CONTAIN,
          weight: 1.0,
          source: 'structure',
        });
      }
    }
  }

  // uni-app 边
  if (uniResult) {
    for (const edge of uniResult.containEdges) edgeBuilder.addRawEdge(edge);
    for (const edge of uniResult.navigateEdges) edgeBuilder.addRawEdge(edge);
    // 注意：uni-page 节点和已有 file 节点是同一页面的两个视角
    // file 节点由 source-parser 生成（Vue 文件），uni-page 由这里生成
    // 两者通过 same-page 关系关联？这里先简单处理：只加 uni-page 节点和 navigate 边
    // contain 边由模块 L1 → uni-page 在 buildContainEdges 里处理？
    // 暂时保持简洁，uni-page 作为独立的 L2 节点存在
  }

  // --- import 边 ---
  buildImportEdges(edgeBuilder, parseResults, fileNodes, root);

  // --- Pinia call 边（组件 → action 调用） ---
  buildPiniaCallEdges(edgeBuilder, parseResults, root, piniaStoreNodes, piniaElemByStore);
  // --- Vuex call 边（组件 → action/mutation 调用） ---
  buildVuexCallEdges(edgeBuilder, parseResults, root, vuexStoreNodes, vuexElemByStore);
  // --- Redux call 边（组件 → action/selector 调用） ---
  buildReduxCallEdges(edgeBuilder, parseResults, root, reduxSliceNodes, reduxElemBySlice);
  mark('edges', t3);
  report('edges', 1, `${edgeBuilder.size()} 条边`);

  // 6. 向量索引（在 business_map 之前构建，供语义回填使用）
  report('vectors', 0);
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
        (done, total) => {
          report('vectors', done / total, `${done}/${total} 个节点`);
        },
      );
      vectors = result.vectors;
      vectorDimensions = result.dimensions;
      vectorMapping = result.mapping;
      vectorCount = result.mapping.indexToNodeId.length;
      report('vectors', 1, `${vectorCount} 个向量`);
    } catch (e) {
      console.warn(
        `[graph-builder] 向量构建失败，跳过（语义检索/语义映射将不可用）: ${(e as Error).message}`,
      );
      vectors = null;
      report('vectors', 1, '已跳过');
    }
  } else {
    report('vectors', 1, '未启用');
  }
  mark('vectors', tVec);

  // 7. business_map 边（C → L1/L2/L3，四源证据融合：doc / semantic / git / name）
  report('business-map', 0);
  const tBiz = Date.now();
  buildBusinessMapEdges(edgeBuilder, {
    caps: parsedCaps,
    modules: parsedModules,
    fileNodes,
    root,
    config,
    vectors,
    dimensions: vectorDimensions,
    mapping: vectorMapping,
  });
  mark('business-map', tBiz);
  report('business-map', 1);

  // 8. 完整性校验
  report('validation', 0);
  const t4 = Date.now();
  const graphData: GraphData = {
    nodes: allNodes,
    edges: edgeBuilder.getEdges(),
  };
  const validation = validateGraph(graphData);
  mark('validation', t4);
  report('validation', 1, validation.passed ? '通过' : `${validation.errors.length} 个错误`);

  // 9. 持久化（图谱 + 向量索引 + 元数据）
  report('save', 0, '保存图谱...');
  const t5 = Date.now();
  const wpfPath = path.join(root, WPF_DIR);
  const graphStore = new JsonlGraphStore(wpfPath);
  graphStore.save(graphData);

  if (vectors && vectorMapping && vectors.length > 0) {
    report('save', 0.4, '保存向量索引...');
    const vectorStore = new BinaryVectorStore(wpfPath);
    vectorStore.save(vectors, vectorDimensions);

    report('save', 0.7, '保存向量映射...');
    const mappingStore = new VectorMappingStore(wpfPath);
    mappingStore.save(vectorMapping);
  }

  report('save', 0.9, '保存元数据...');
  const metaStore = new JsonMetaStore(wpfPath);
  const fileHashes = buildFileHashSnapshot(parseResults);
  const meta: GraphMeta = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    builtAt: Date.now(),
    totalNodes: allNodes.length,
    totalEdges: edgeBuilder.size(),
    totalVectors: vectorCount,
    fileHashes,
    configVersion: configHash(config),
  };
  metaStore.save(meta);
  mark('save', t5);
  report('save', 1);

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
  modules: ParsedModule[],
  fileNodes: Map<string, GraphNode>,
  elemNodes: Map<string, GraphNode[]>,
): void {
  // 模块 → 文件 contain 边（L1 ⊃ L2）
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

  // 文件 → 元素 contain 边（L2 ⊃ L3）
  for (const [filePath, elems] of elemNodes) {
    const fileNode = fileNodes.get(filePath);
    if (!fileNode) continue;
    for (const elem of elems) {
      eb.addContain(fileNode.id, elem.id);
    }
  }
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
  for (const pr of parseResults) {
    if (!pr.piniaStores || pr.piniaStores.length === 0) continue;
    const fileNode = pr.fileNode;
    for (const store of pr.piniaStores) {
      eb.addContain(fileNode.id, store.id);
    }
  }

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
 */
function buildPiniaCallEdges(
  eb: EdgeBuilder,
  parseResults: ParseResult[],
  root: string,
  piniaStores: Map<string, GraphNode>,
  piniaElemByStore: Map<string, GraphNode[]>,
): void {
  for (const pr of parseResults) {
    const fileNode = pr.fileNode;
    const filePath = fileNode.attrs.filePath;
    if (!filePath) continue;

    let source: string;
    try {
      source = require('fs').readFileSync(path.join(root, filePath), 'utf-8');
    } catch {
      continue;
    }

    // 从 import 语句中识别引入了哪些 store hook
    const storeHookNames: string[] = [];
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*stores?\/[^'"]+['"]/g;
    let match;
    while ((match = importRegex.exec(source)) !== null) {
      const specifiers = match[1].split(',').map((s: string) => s.trim());
      for (const spec of specifiers) {
        const aliasMatch = spec.match(/^(\w+)\s+as\s+(\w+)$/);
        if (aliasMatch) {
          storeHookNames.push(aliasMatch[2]);
        } else if (/^use\w+Store$/.test(spec)) {
          storeHookNames.push(spec);
        }
      }
    }

    if (storeHookNames.length === 0) continue;

    const storeVarToHook = new Map<string, string>();
    for (const hookName of storeHookNames) {
      const varRegex = new RegExp(
        `(?:const|let|var)\\s+(\\w+)\\s*=\\s*${hookName}\\s*\\(`,
        'g',
      );
      let varMatch;
      while ((varMatch = varRegex.exec(source)) !== null) {
        storeVarToHook.set(varMatch[1], hookName);
      }
    }

    for (const [storeVar, hookName] of storeVarToHook) {
      const storeId = hookName;
      const storeNode = piniaStores.get(storeId);
      if (!storeNode) continue;

      const storeElems = piniaElemByStore.get(storeId) || [];
      const actionNames = new Set(
        storeElems.filter((e) => e.type === 'pinia-action').map((e) => e.name),
      );
      if (actionNames.size === 0) continue;

      const callRegex = new RegExp(
        `${storeVar}\\.(${Array.from(actionNames).join('|')})\\s*\\(`,
        'g',
      );
      const calledActions = new Set<string>();
      let callMatch;
      while ((callMatch = callRegex.exec(source)) !== null) {
        calledActions.add(callMatch[1]);
      }

      for (const actionName of calledActions) {
        const actionNode = storeElems.find(
          (e) => e.type === 'pinia-action' && e.name === actionName,
        );
        if (actionNode) {
          eb.addCall(fileNode.id, actionNode.id);
        }
      }
    }

    // mapActions 模式
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

// ==================== Vuex contain 边 ====================

/**
 * 构建 Vuex 相关的 contain 边：
 *   file → vuex-store（文件包含 store 定义）
 *   vuex-store → state/mutation/action/getter（store 包含子元素）
 */
function buildVuexContainEdges(
  eb: EdgeBuilder,
  parseResults: ParseResult[],
  fileNodes: Map<string, GraphNode>,
  vuexStores: Map<string, GraphNode>,
  vuexElemByStore: Map<string, GraphNode[]>,
): void {
  for (const pr of parseResults) {
    if (!pr.vuexStores || pr.vuexStores.length === 0) continue;
    const fileNode = pr.fileNode;
    for (const store of pr.vuexStores) {
      eb.addContain(fileNode.id, store.id);
    }
  }

  for (const [storeName, elems] of vuexElemByStore) {
    const storeNode = vuexStores.get(storeName);
    if (!storeNode) continue;
    for (const elem of elems) {
      eb.addContain(storeNode.id, elem.id);
    }
  }
}

// ==================== Vuex call 边 ====================

/**
 * 构建组件/文件 → Vuex action/mutation 的调用边。
 *
 * 识别模式（启发式）：
 *   1. this.$store.dispatch('xxx/yyy', payload) → action 调用
 *   2. this.$store.commit('xxx/yyy', payload) → mutation 调用
 *   3. useStore().dispatch('xxx/yyy') → Vue 3 风格
 *   4. mapActions / mapMutations / mapState / mapGetters 辅助函数
 */
function buildVuexCallEdges(
  eb: EdgeBuilder,
  parseResults: ParseResult[],
  root: string,
  vuexStores: Map<string, GraphNode>,
  vuexElemByStore: Map<string, GraphNode[]>,
): void {
  for (const pr of parseResults) {
    const fileNode = pr.fileNode;
    const filePath = fileNode.attrs.filePath;
    if (!filePath) continue;

    let source: string;
    try {
      source = fs.readFileSync(path.join(root, filePath), 'utf-8');
    } catch {
      continue;
    }

    // 1. dispatch 调用：$store.dispatch('module/action', ...) 或 store.dispatch(...)
    const dispatchRegex = /(?:\$store|store)\.dispatch\s*\(\s*['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = dispatchRegex.exec(source)) !== null) {
      const actionPath = match[1];
      const { storeName, elemName } = splitVuexPath(actionPath);
      const actionNode = findVuexElem(vuexStores, vuexElemByStore, storeName, elemName, 'vuex-action');
      if (actionNode) {
        eb.addCall(fileNode.id, actionNode.id);
      }
    }

    // 2. commit 调用：$store.commit('module/MUTATION', ...)
    const commitRegex = /(?:\$store|store)\.commit\s*\(\s*['"]([^'"]+)['"]/g;
    while ((match = commitRegex.exec(source)) !== null) {
      const mutationPath = match[1];
      const { storeName, elemName } = splitVuexPath(mutationPath);
      const mutationNode = findVuexElem(vuexStores, vuexElemByStore, storeName, elemName, 'vuex-mutation');
      if (mutationNode) {
        eb.addCall(fileNode.id, mutationNode.id);
      }
    }

    // 3. mapActions 辅助函数
    const mapActionsRegex = /mapActions\s*\(\s*['"](\w+)['"]\s*,\s*\[([^\]]+)\]/g;
    while ((match = mapActionsRegex.exec(source)) !== null) {
      const storeName = match[1];
      const actionsStr = match[2];
      const actionNames = actionsStr
        .split(',')
        .map((s) => s.trim().replace(/['"]/g, ''))
        .filter(Boolean);
      for (const actionName of actionNames) {
        const actionNode = findVuexElem(vuexStores, vuexElemByStore, storeName, actionName, 'vuex-action');
        if (actionNode) {
          eb.addCall(fileNode.id, actionNode.id);
        }
      }
    }

    // 4. mapMutations 辅助函数
    const mapMutationsRegex = /mapMutations\s*\(\s*['"](\w+)['"]\s*,\s*\[([^\]]+)\]/g;
    while ((match = mapMutationsRegex.exec(source)) !== null) {
      const storeName = match[1];
      const mutStr = match[2];
      const mutNames = mutStr
        .split(',')
        .map((s) => s.trim().replace(/['"]/g, ''))
        .filter(Boolean);
      for (const mutName of mutNames) {
        const mutNode = findVuexElem(vuexStores, vuexElemByStore, storeName, mutName, 'vuex-mutation');
        if (mutNode) {
          eb.addCall(fileNode.id, mutNode.id);
        }
      }
    }

    // 5. mapState / mapGetters（只建引用边，不计为 call，这里先跳过）
    //    语义上是数据读取，用 call 边不太准确。后续可新增 use-selector 边类型。
  }
}

/** 拆分 'module/action' 或 'action' 为 storeName 和 elemName */
function splitVuexPath(actionPath: string): { storeName: string; elemName: string } {
  const parts = actionPath.split('/');
  if (parts.length === 1) {
    return { storeName: 'root', elemName: parts[0] };
  }
  const elemName = parts.pop()!;
  return { storeName: parts.join('/'), elemName };
}

/** 在 Vuex store 中查找指定类型的元素节点 */
function findVuexElem(
  vuexStores: Map<string, GraphNode>,
  vuexElemByStore: Map<string, GraphNode[]>,
  storeName: string,
  elemName: string,
  elemType: string,
): GraphNode | undefined {
  const storeNode = vuexStores.get(storeName);
  if (!storeNode) return undefined;
  const elems = vuexElemByStore.get(storeName) || [];
  return elems.find((e) => e.type === elemType && e.name === elemName);
}

// ==================== Redux contain 边 ====================

/**
 * 构建 Redux 相关的 contain 边：
 *   file → redux-slice（文件包含 slice 定义）
 *   redux-slice → state/reducer/action/selector（slice 包含子元素）
 */
function buildReduxContainEdges(
  eb: EdgeBuilder,
  parseResults: ParseResult[],
  fileNodes: Map<string, GraphNode>,
  reduxSlices: Map<string, GraphNode>,
  reduxElemBySlice: Map<string, GraphNode[]>,
): void {
  for (const pr of parseResults) {
    if (!pr.reduxSlices || pr.reduxSlices.length === 0) continue;
    const fileNode = pr.fileNode;
    for (const slice of pr.reduxSlices) {
      eb.addContain(fileNode.id, slice.id);
    }
  }

  for (const [sliceName, elems] of reduxElemBySlice) {
    const sliceNode = reduxSlices.get(sliceName);
    if (!sliceNode) continue;
    for (const elem of elems) {
      eb.addContain(sliceNode.id, elem.id);
    }
  }
}

// ==================== Redux call 边 ====================

/**
 * 构建组件/文件 → Redux action/selector 的调用边。
 *
 * 识别模式（启发式）：
 *   1. useSelector(selectXxx) → selector 调用
 *   2. useDispatch() + dispatch(someAction()) → action 调用
 *   3. connect(mapState, mapDispatch)(Component) → selector + action
 */
function buildReduxCallEdges(
  eb: EdgeBuilder,
  parseResults: ParseResult[],
  root: string,
  reduxSlices: Map<string, GraphNode>,
  reduxElemBySlice: Map<string, GraphNode[]>,
): void {
  for (const pr of parseResults) {
    const fileNode = pr.fileNode;
    const filePath = fileNode.attrs.filePath;
    if (!filePath) continue;

    let source: string;
    try {
      source = fs.readFileSync(path.join(root, filePath), 'utf-8');
    } catch {
      continue;
    }

    // 1. useSelector(selectXxx) 调用
    const selectorRegex = /useSelector\s*\(\s*(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = selectorRegex.exec(source)) !== null) {
      const selectorName = match[1];
      const selectorNode = findReduxElemGlobal(
        reduxSlices, reduxElemBySlice, selectorName, 'redux-selector',
      );
      if (selectorNode) {
        eb.addCall(fileNode.id, selectorNode.id);
      }
    }

    // 2. dispatch(someAction()) 调用
    // 先找出所有从 reduxjs/toolkit 或 slice 文件导入的 action 创建函数
    const importedActions = new Set<string>();
    const actionImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"][^'"]*(?:slice|redux|store)[^'"]*['"]/g;
    while ((match = actionImportRegex.exec(source)) !== null) {
      const specifiers = match[1].split(',').map((s) => s.trim());
      for (const spec of specifiers) {
        const name = spec.replace(/^.*\sas\s+/, '').trim();
        if (name) importedActions.add(name);
      }
    }

    // dispatch(action()) 模式
    for (const actionName of importedActions) {
      const dispatchRegex = new RegExp(`dispatch\\s*\\(\\s*${actionName}\\s*\\(`, 'g');
      if (dispatchRegex.test(source)) {
        const actionNode = findReduxActionByName(
          reduxSlices, reduxElemBySlice, actionName,
        );
        if (actionNode) {
          eb.addCall(fileNode.id, actionNode.id);
        }
      }
    }

    // 3. connect 高阶组件（简单处理：识别 mapStateToProps 中的 selector 和 mapDispatch 中的 action）
    const connectRegex = /connect\s*\(\s*(\w+)\s*,\s*(\w+)/;
    const connectMatch = connectRegex.exec(source);
    if (connectMatch) {
      const mapStateFn = connectMatch[1];
      const mapDispatchFn = connectMatch[2];
      // 启发式：从函数名中提取相关 selector/action
      // 这里简化处理，暂不深入函数体
      if (mapStateFn && mapStateFn !== 'null' && mapStateFn !== 'undefined') {
        const selectorNode = findReduxElemGlobal(
          reduxSlices, reduxElemBySlice, mapStateFn, 'redux-selector',
        );
        if (selectorNode) {
          eb.addCall(fileNode.id, selectorNode.id);
        }
      }
    }
  }
}

/** 在所有 slice 中查找指定类型的元素（全局搜索） */
function findReduxElemGlobal(
  reduxSlices: Map<string, GraphNode>,
  reduxElemBySlice: Map<string, GraphNode[]>,
  elemName: string,
  elemType: string,
): GraphNode | undefined {
  for (const [, elems] of reduxElemBySlice) {
    const found = elems.find((e) => e.type === elemType && e.name === elemName);
    if (found) return found;
  }
  return undefined;
}

/** 根据 action 创建函数名查找对应的 action 节点（通过匹配 slice/actionType） */
function findReduxActionByName(
  reduxSlices: Map<string, GraphNode>,
  reduxElemBySlice: Map<string, GraphNode[]>,
  actionCreatorName: string,
): GraphNode | undefined {
  // 先按名字精确匹配
  const global = findReduxElemGlobal(reduxSlices, reduxElemBySlice, actionCreatorName, 'redux-action');
  if (global) return global;

  // 再按 actionType 后缀匹配（如 setUser 匹配 user/setUser）
  for (const [sliceName, elems] of reduxElemBySlice) {
    const found = elems.find(
      (e) => e.type === 'redux-action' && e.attrs.actionType?.endsWith('/' + actionCreatorName),
    );
    if (found) return found;
  }
  return undefined;
}

// ==================== import 边 ====================

function buildImportEdges(
  eb: EdgeBuilder,
  parseResults: ParseResult[],
  fileNodes: Map<string, GraphNode>,
  root: string,
): void {
  const pathMap = new Map<string, string>();
  for (const [fp, node] of fileNodes) {
    pathMap.set(fp.replace(/\\/g, '/'), node.id);
  }

  for (const pr of parseResults) {
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

      const targetId = resolveImportTarget(resolved, pathMap);
      if (targetId) {
        eb.addImport(fromId, targetId);
      }
    }
  }
}

function resolveImportTarget(
  importPath: string,
  pathMap: Map<string, string>,
): string | null {
  if (pathMap.has(importPath)) return pathMap.get(importPath)!;

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
  } else {
    // 没有 src/ 目录的项目（如微信小程序、HBuilderX 风格 uni-app），
    // 从根目录扫描（通过 ignore 列表过滤无关目录）
    walk(root);
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

  for (const node of data.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`节点 ID 冲突: ${node.id}`);
    }
    nodeIds.add(node.id);
  }

  for (const edge of data.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`边引用不存在的起始节点: ${edge.id} (from: ${edge.from})`);
    }
    if (!nodeIds.has(edge.to)) {
      errors.push(`边引用不存在的目标节点: ${edge.id} (to: ${edge.to})`);
    }
  }

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
  const counts: Record<string, number> = { C: 0, L1: 0, L2: 0, L3: 0 };
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
 *  7. 检测能力变更（specs 目录变更）
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
  if (!isSchemaCompatible(meta.schemaVersion, CURRENT_SCHEMA_VERSION)) {
    console.warn(
      `[graph-builder] 图谱 schema 版本不兼容（当前: ${meta.schemaVersion}, 需要: ${CURRENT_SCHEMA_VERSION}），正在全量重建...`,
    );
    console.warn('[graph-builder] 原因：图谱架构升级至 C+L1/L2/L3 三层结构，需重建以保证数据一致性。');
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

  const oldHashes = new Map(Object.entries(meta.fileHashes));
  const changedFiles: string[] = [];
  const deletedFiles: string[] = [];

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

  // 3. 检测能力 spec 变更
  const tCap = Date.now();
  const capChanges = detectCapabilityChanges(root, oldData.nodes);
  const hasCapChanges = capChanges.length > 0;
  mark('cap-detect', tCap);

  // 如果既没有文件变更，也没有能力变更，直接返回
  if (!hasFileChanges && !hasCapChanges) {
    return null;
  }

  // 4. 删除变更相关的节点和边
  const t2 = Date.now();
  const nodesToRemove = new Set<string>();
  const edgesToRemove = new Set<string>();

  for (const fp of [...changedFiles, ...deletedFiles]) {
    const fileNodeId = findFileNodeByPath(oldData.nodes, fp);
    if (!fileNodeId) continue;

    nodesToRemove.add(fileNodeId);

    const containEdges = oldIdx.outEdges.get(fileNodeId) ?? [];
    for (const e of containEdges) {
      if (e.type === EDGE_TYPE_CONTAIN) {
        nodesToRemove.add(e.to);
      }
    }

    const outE = oldIdx.outEdges.get(fileNodeId) ?? [];
    const inE = oldIdx.inEdges.get(fileNodeId) ?? [];
    for (const e of [...outE, ...inE]) {
      edgesToRemove.add(e.id);
    }
  }

  // 删除变更的能力节点及其所有关联边
  const capsToRebuild = capChanges.filter(
    (c) => c.type === 'added' || c.type === 'modified' || c.type === 'deleted',
  );
  for (const cc of capsToRebuild) {
    const capNode = oldData.nodes.find(
      (n) => n.type === NODE_TYPE_CAPABILITY && n.name === cc.name,
    );
    if (capNode) {
      nodesToRemove.add(capNode.id);
      const outE = oldIdx.outEdges.get(capNode.id) ?? [];
      const inE = oldIdx.inEdges.get(capNode.id) ?? [];
      for (const e of [...outE, ...inE]) {
        edgesToRemove.add(e.id);
      }
    }
  }

  const newNodes = oldData.nodes.filter((n) => !nodesToRemove.has(n.id));
  const newEdges = oldData.edges.filter((e) => !edgesToRemove.has(e.id));
  mark('delete', t2);

  // 5. 重新解析变更文件
  const t3 = Date.now();
  const changedAbsFiles = changedFiles
    .map((fp) => path.join(root, fp))
    .filter((fp) => fs.existsSync(fp));

  const newParseResults = await parseSourceFiles(changedAbsFiles, root);

  const edgeBuilder = new EdgeBuilder();

  for (const e of newEdges) {
    edgeBuilder.addEdge({
      from: e.from,
      to: e.to,
      type: e.type,
      weight: e.weight,
      source: e.source,
    });
  }

  // 处理能力变更：添加新增/修改的能力节点
  const addedOrModifiedCaps = capChanges.filter(
    (c) => (c.type === 'added' || c.type === 'modified') && c.parsed,
  );
  for (const cc of addedOrModifiedCaps) {
    if (cc.parsed) {
      newNodes.push(cc.parsed.node);
    }
  }

  // 添加新解析的文件节点和元素节点
  const fileNodes = new Map<string, GraphNode>();
  const elemNodes = new Map<string, GraphNode[]>();
  const piniaStoreMap = new Map<string, GraphNode>();
  const piniaElemByStore = new Map<string, GraphNode[]>();
  const vuexStoreMap = new Map<string, GraphNode>();
  const vuexElemByStore = new Map<string, GraphNode[]>();
  const reduxSliceMap = new Map<string, GraphNode>();
  const reduxElemBySlice = new Map<string, GraphNode[]>();
  for (const pr of newParseResults) {
    newNodes.push(pr.fileNode);
    const fp = pr.fileNode.attrs.filePath!;
    fileNodes.set(fp, pr.fileNode);
    // 过滤掉 pinia 元素——它们由 pinia-store contain，不直接挂在 file 下
    const nonPiniaElems = pr.elements.filter(
      (el) => el.type !== 'pinia-action' && el.type !== 'pinia-getter' && el.type !== 'pinia-state',
    );
    elemNodes.set(fp, nonPiniaElems);
    newNodes.push(...pr.elements);

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

    if (pr.vuexStores && pr.vuexStores.length > 0) {
      for (const store of pr.vuexStores) {
        newNodes.push(store);
        vuexStoreMap.set(store.name, store);
        const storeElems = pr.elements.filter(
          (el) => el.attrs.parentName === store.name &&
            (el.type === 'vuex-state' || el.type === 'vuex-mutation' ||
              el.type === 'vuex-action' || el.type === 'vuex-getter'),
        );
        vuexElemByStore.set(store.name, storeElems);
      }
    }

    if (pr.reduxSlices && pr.reduxSlices.length > 0) {
      for (const slice of pr.reduxSlices) {
        newNodes.push(slice);
        reduxSliceMap.set(slice.name, slice);
        const sliceElems = pr.elements.filter(
          (el) => el.attrs.parentName === slice.name &&
            (el.type === 'redux-state' || el.type === 'redux-reducer' ||
              el.type === 'redux-action' || el.type === 'redux-selector'),
        );
        reduxElemBySlice.set(slice.name, sliceElems);
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

  // 重建 Pinia contain 边
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

  // 重建 Vuex contain 边
  for (const pr of newParseResults) {
    if (!pr.vuexStores || pr.vuexStores.length === 0) continue;
    const fNode = pr.fileNode;
    for (const store of pr.vuexStores) {
      edgeBuilder.addContain(fNode.id, store.id);
    }
  }
  for (const [storeName, elems] of vuexElemByStore) {
    const storeNode = vuexStoreMap.get(storeName);
    if (!storeNode) continue;
    for (const elem of elems) {
      edgeBuilder.addContain(storeNode.id, elem.id);
    }
  }

  // 重建 Redux contain 边
  for (const pr of newParseResults) {
    if (!pr.reduxSlices || pr.reduxSlices.length === 0) continue;
    const fNode = pr.fileNode;
    for (const slice of pr.reduxSlices) {
      edgeBuilder.addContain(fNode.id, slice.id);
    }
  }
  for (const [sliceName, elems] of reduxElemBySlice) {
    const sliceNode = reduxSliceMap.get(sliceName);
    if (!sliceNode) continue;
    for (const elem of elems) {
      edgeBuilder.addContain(sliceNode.id, elem.id);
    }
  }

  // 重建模块 contain 边（模块⊃文件）
  const modules = parseModules(root, config, projectType);
  for (const mod of modules) {
    const modDir = mod.node.attrs.dir?.replace(/\\/g, '/');
    if (!modDir) continue;

    for (const [fp, fNode] of fileNodes) {
      const normPath = fp.replace(/\\/g, '/');
      if (normPath.startsWith(modDir + '/') || normPath === modDir) {
        const existingModNode = newNodes.find(
          (n) => n.level === 'L1' && n.name === mod.node.name,
        );
        const modId = existingModNode ? existingModNode.id : mod.node.id;
        if (!existingModNode) {
          newNodes.push(mod.node);
        }
        edgeBuilder.addContain(modId, fNode.id);
      }
    }
  }

  // 重建 import 边
  const allFileNodes = new Map<string, GraphNode>();
  for (const n of newNodes) {
    if (n.type === NODE_TYPE_FILE && n.attrs.filePath) {
      allFileNodes.set(n.attrs.filePath.replace(/\\/g, '/'), n);
    }
  }

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

  mark('rebuild', t3);

  // 6. 组装最终数据
  const t4 = Date.now();
  const finalData: GraphData = {
    nodes: newNodes,
    edges: edgeBuilder.getEdges(),
  };

  const validation = validateGraph(finalData);
  mark('validate', t4);

  // 7. 保存图谱
  const t5 = Date.now();
  graphStore.save(finalData);

  // 8. 重建向量索引（首版简化：增量更新也全量重建向量）
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

  // 9. 元数据
  const newMeta: GraphMeta = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
export async function rebuildGraph(root: string, onProgress?: BuildProgressCallback): Promise<BuildResult> {
  const wpfPath = path.join(root, WPF_DIR);

  if (fs.existsSync(wpfPath)) {
    fs.rmSync(wpfPath, { recursive: true, force: true });
  }

  return buildGraph(root, onProgress);
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

// ==================== 能力变更检测 ====================

/** 能力变更类型 */
interface CapabilityChange {
  name: string;
  type: 'added' | 'modified' | 'deleted';
  parsed?: ParsedCapability;
}

/**
 * 检测能力层面的变更（新增、修改、删除）
 *
 * 通过全量重解析当前所有能力 specs，与旧图谱对比。
 */
function detectCapabilityChanges(
  root: string,
  oldNodes: GraphNode[],
): CapabilityChange[] {
  const changes: CapabilityChange[] = [];

  const currentCaps = parseAllCapabilities(root);
  const currentMap = new Map(currentCaps.map((c) => [c.node.name, c]));

  const oldCapNodes = oldNodes.filter((n) => n.type === NODE_TYPE_CAPABILITY);
  const oldMap = new Map(oldCapNodes.map((n) => [n.name, n]));

  // 检测新增和修改
  for (const [name, current] of currentMap) {
    const old = oldMap.get(name);
    if (!old) {
      changes.push({ name, type: 'added', parsed: current });
    } else {
      // 检查 description 和 features 是否变化
      const oldDesc = old.attrs.description;
      const newDesc = current.node.attrs.description;
      const oldFeatures = JSON.stringify(old.attrs.features || []);
      const newFeatures = JSON.stringify(current.node.attrs.features || []);

      if (oldDesc !== newDesc || oldFeatures !== newFeatures) {
        changes.push({ name, type: 'modified', parsed: current });
      }
    }
  }

  // 检测删除
  for (const [name] of oldMap) {
    if (!currentMap.has(name)) {
      changes.push({ name, type: 'deleted' });
    }
  }

  return changes;
}
