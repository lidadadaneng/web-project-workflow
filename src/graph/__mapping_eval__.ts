/**
 * 业务-代码映射质量评估脚手架（论文创新点六消融实验素材）
 *
 * 功能：
 *   1. evaluateMapping: 纯函数，计算 predicted vs ground-truth 的 P/R/F1
 *   2. loadGroundTruth: 加载人工标注的「需求 -> 目标」关联对
 *   3. runAblation: 对 2 源 / 3 源 / 4 源配置分别跑 buildBusinessMapEdges，输出对比表
 *
 * 用法：
 *   npx ts-node src/graph/__mapping_eval__.ts [ground-truth.json]
 *
 *   不传参数时跑内置合成样例，演示消融对比表。
 *   传 ground-truth.json 时，对内置合成图按标注计算各配置的 P/R/F1。
 *
 * ground-truth 格式（JSON）：
 *   [
 *     { "requirement": "用户认证", "targets": ["auth", "login.ts"] },
 *     ...
 *   ]
 *
 * 注：本项目当前无活跃需求（wpw/active 为空），故内置合成图用于演示。
 *     真实评估需在接入真实项目后，标注 ≥20 条 ground-truth 再运行。
 */
import { EdgeBuilder } from './builders/edge-builder';
import {
  buildBusinessMapEdges,
  type BusinessMapContext,
  type MappingSourceSwitch,
} from './builders/business-mapper';
import type { GraphNode, VectorMapping, GraphEdge } from './types';
import type { ParsedRequirement } from './parsers/requirement-parser';
import type { ParsedModule } from './parsers/module-parser';
import { getDefaultGraphConfig } from './config';
import * as fs from 'fs';

// ==================== 核心评估函数 ====================

/** ground-truth 标注项 */
export interface GroundTruthEntry {
  requirement: string;
  targets: string[];
}

/** 评估结果 */
export interface MappingMetrics {
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
  edgeCount: number;
  avgWeight: number;
}

/**
 * 计算 predicted vs ground-truth 的 P/R/F1（micro 平均）
 *
 * @param predicted 预测关联：reqName -> Set<targetName>
 * @param truth     真实关联：reqName -> Set<targetName>
 */
export function evaluateMapping(
  predicted: Map<string, Set<string>>,
  truth: Map<string, Set<string>>,
): MappingMetrics {
  let tp = 0;
  let fp = 0;
  let fn = 0;

  const allReqs = new Set<string>([...predicted.keys(), ...truth.keys()]);
  for (const req of allReqs) {
    const pred = predicted.get(req) ?? new Set<string>();
    const tr = truth.get(req) ?? new Set<string>();
    for (const t of pred) {
      if (tr.has(t)) tp++;
      else fp++;
    }
    for (const t of tr) {
      if (!pred.has(t)) fn++;
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { precision, recall, f1, tp, fp, fn, edgeCount: 0, avgWeight: 0 };
}

/** 加载 ground-truth JSON */
export function loadGroundTruth(p: string): GroundTruthEntry[] {
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw) as GroundTruthEntry[];
}

/** 将 ground-truth 列表转为 Map<reqName, Set<targetName>> */
export function truthToMap(entries: GroundTruthEntry[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const e of entries) m.set(e.requirement, new Set(e.targets));
  return m;
}

/** 将 business_map 边转为预测关联：reqName -> Set<targetName> */
export function edgesToPredictions(
  edges: GraphEdge[],
  nodeById: Map<string, GraphNode>,
): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const e of edges) {
    if (e.type !== 'business_map') continue;
    const from = nodeById.get(e.from);
    const to = nodeById.get(e.to);
    if (!from || !to) continue;
    const set = m.get(from.name) ?? new Set<string>();
    set.add(to.name);
    m.set(from.name, set);
  }
  return m;
}

// ==================== 消融实验 ====================

/** 消融配置 */
export interface AblationConfig {
  name: string;
  sources: MappingSourceSwitch;
}

/** 单次消融运行结果 */
export interface AblationResult extends MappingMetrics {
  name: string;
}

/**
 * 对一组消融配置分别跑 buildBusinessMapEdges，计算 P/R/F1 与边统计
 */
export function runAblation(
  baseCtx: Omit<BusinessMapContext, 'sources'>,
  truth: Map<string, Set<string>>,
  configs: AblationConfig[],
): AblationResult[] {
  const nodeById = new Map<string, GraphNode>();
  for (const m of baseCtx.modules) nodeById.set(m.node.id, m.node);
  for (const [, n] of baseCtx.fileNodes) nodeById.set(n.id, n);
  for (const r of baseCtx.reqs) nodeById.set(r.node.id, r.node);

  const results: AblationResult[] = [];
  for (const cfg of configs) {
    const eb = new EdgeBuilder();
    buildBusinessMapEdges(eb, { ...baseCtx, sources: cfg.sources });
    const edges = eb.getEdges().filter((e) => e.type === 'business_map');
    const predicted = edgesToPredictions(edges, nodeById);
    const metrics = evaluateMapping(predicted, truth);
    const avgWeight =
      edges.length > 0 ? edges.reduce((s, e) => s + e.weight, 0) / edges.length : 0;
    results.push({
      name: cfg.name,
      ...metrics,
      edgeCount: edges.length,
      avgWeight: Math.round(avgWeight * 1000) / 1000,
    });
  }
  return results;
}

/** 打印消融对比表 */
export function printAblationTable(results: AblationResult[]): void {
  console.log('\n=== 业务-代码映射消融实验 ===\n');
  const header = ['配置', 'Precision', 'Recall', 'F1', '边数', '平均权重', 'TP', 'FP', 'FN'];
  console.log(header.join('\t'));
  for (const r of results) {
    console.log(
      [
        r.name,
        r.precision.toFixed(3),
        r.recall.toFixed(3),
        r.f1.toFixed(3),
        String(r.edgeCount),
        String(r.avgWeight),
        String(r.tp),
        String(r.fp),
        String(r.fn),
      ].join('\t'),
    );
  }
}

// ==================== 合成样例（演示用） ====================

function mkNode(id: string, level: GraphNode['level'], type: GraphNode['type'], name: string): GraphNode {
  return { id, level, type, name, attrs: {}, createdAt: 0, updatedAt: 0 };
}

function mkReq(id: string, name: string, extractedModules: string[] = []): ParsedRequirement {
  return {
    node: mkNode(id, 'L1', 'requirement', name),
    dirPath: '/tmp',
    vectorText: name,
    extractedModules,
    extractedInterfaces: [],
  };
}

function mkMod(id: string, name: string): ParsedModule {
  return { node: mkNode(id, 'L2', 'module', name), dir: `src/${name}` };
}

/** 构造合成图上下文（含四源证据） */
function buildSyntheticCtx(): Omit<BusinessMapContext, 'sources'> {
  const reqs = [
    mkReq('req:auth', '用户认证', ['auth']),
    mkReq('req:order', '订单管理', ['order']),
  ];
  const modules = [
    mkMod('mod:auth', 'auth'),
    mkMod('mod:order', 'order'),
    mkMod('mod:pay', 'pay'),
  ];
  const fileNodes = new Map<string, GraphNode>([
    ['src/auth/login.ts', mkNode('file:login', 'L3', 'file', 'login.ts')],
    ['src/order/list.ts', mkNode('file:orderlist', 'L3', 'file', 'list.ts')],
  ]);

  // 向量：req 与对应模块高相似
  const dimensions = 2;
  const vectors = new Float32Array([
    1, 0, // req:auth
    1, 0, // mod:auth
    0, 1, // mod:order
    1, 0, // mod:pay (与 auth 相似，制造少量噪声)
    1, 0, // file:login
    0, 1, // file:orderlist
  ]);
  const mapping: VectorMapping = {
    indexToNodeId: ['req:auth', 'mod:auth', 'mod:order', 'mod:pay', 'file:login', 'file:orderlist'],
    nodeIdToIndex: new Map([
      ['req:auth', 0], ['mod:auth', 1], ['mod:order', 2],
      ['mod:pay', 3], ['file:login', 4], ['file:orderlist', 5],
    ]),
  };

  return {
    reqs,
    modules,
    fileNodes,
    root: '/tmp/synthetic',
    config: getDefaultGraphConfig(),
    vectors,
    dimensions,
    mapping,
    isGit: () => true,
    traceGit: (_root: string, keywords: string[]) => {
      // 合成 Git 频次：认证 -> login.ts，订单 -> list.ts
      if (keywords.some((k) => k.includes('认证') || k.includes('auth'))) {
        return { fileCounts: new Map([['src/auth/login.ts', 5]]), totalCommits: 1 };
      }
      if (keywords.some((k) => k.includes('订单') || k.includes('order'))) {
        return { fileCounts: new Map([['src/order/list.ts', 4]]), totalCommits: 1 };
      }
      return { fileCounts: new Map(), totalCommits: 0 };
    },
  };
}

// ==================== 主入口 ====================

async function main(): Promise<void> {
  const truthPath = process.argv[2];
  const ctx = buildSyntheticCtx();

  // ground-truth：合成标注（真实场景从文件加载）
  let truth: Map<string, Set<string>>;
  if (truthPath && fs.existsSync(truthPath)) {
    truth = truthToMap(loadGroundTruth(truthPath));
    console.log(`已加载 ground-truth: ${truthPath}（${truth.size} 条需求）`);
  } else {
    // 合成 ground-truth
    truth = truthToMap([
      { requirement: '用户认证', targets: ['auth', 'login.ts'] },
      { requirement: '订单管理', targets: ['order', 'list.ts'] },
    ]);
    console.log('未提供 ground-truth 文件，使用合成标注（2 条需求）');
  }

  const configs: AblationConfig[] = [
    { name: '2源(doc+name)', sources: { semantic: false, git: false } },
    { name: '3源(+git)', sources: { semantic: false } },
    { name: '4源(+semantic)', sources: {} },
    { name: '仅doc', sources: { semantic: false, git: false, name: false } },
    { name: '仅semantic', sources: { doc: false, git: false, name: false } },
  ];

  const results = runAblation(ctx, truth, configs);
  printAblationTable(results);
}

// 仅在直接运行时执行 main（被 import 时不执行）
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
