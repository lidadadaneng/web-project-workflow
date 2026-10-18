/**
 * viz 服务的数据装载层。
 *
 * 图谱 jsonl 动辄 1.4MB，每次请求重读不现实，所以按 (root, graph) 缓存，
 * 用 graph.jsonl / meta.json 的 mtime 判失效——重新 build 后自动重新装载。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GraphData, GraphMeta, GraphNode, GraphRegistryEntry } from '../graph/types';
import { JsonlGraphStore } from '../graph/storage/graph-store';
import { JsonMetaStore } from '../graph/storage/meta-store';
import { resolveGraphDir, graphExists } from '../graph/storage/graph-path';
import { listGraphs } from '../graph/storage/graph-manager';
import { DEFAULT_GRAPH_NAME } from '../graph/types';

export interface VizGraphNode {
  id: string;
  level: string;
  type: string;
  name: string;
  attrs: Record<string, unknown>;
}

/** 前端契约用 source/target，图谱内部存的是 from/to，这里做一次转换 */
export interface VizGraphEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
  evidence?: string;
}

export interface VizGraph {
  nodes: VizGraphNode[];
  edges: VizGraphEdge[];
}

interface CacheEntry {
  signature: string;
  data: GraphData;
}

const cache = new Map<string, CacheEntry>();

function signatureOf(graphDir: string): string {
  const parts: string[] = [];
  for (const f of ['graph.jsonl', 'meta.json']) {
    const p = path.join(graphDir, f);
    try {
      const st = fs.statSync(p);
      parts.push(`${f}:${st.mtimeMs}:${st.size}`);
    } catch {
      parts.push(`${f}:missing`);
    }
  }
  return parts.join('|');
}

/** 列出所有图谱（含 meta 摘要） */
export function listGraphSummaries(root: string): GraphRegistryEntry[] {
  return listGraphs(root);
}

export function hasGraph(root: string, name: string): boolean {
  return graphExists(root, name);
}

/**
 * 装载图谱（带缓存）。图谱不存在时返回空图而不是抛错——控制台应能优雅降级。
 */
export function loadGraph(root: string, name: string = DEFAULT_GRAPH_NAME): GraphData {
  const graphDir = resolveGraphDir(root, name);
  const key = graphDir;
  const signature = signatureOf(graphDir);

  const hit = cache.get(key);
  if (hit && hit.signature === signature) return hit.data;

  const data = new JsonlGraphStore(graphDir).load();
  cache.set(key, { signature, data });
  return data;
}

export function loadGraphMeta(root: string, name: string = DEFAULT_GRAPH_NAME): GraphMeta | null {
  return new JsonMetaStore(resolveGraphDir(root, name)).load();
}

/** 转成前端契约格式（from/to → source/target） */
export function toVizGraph(
  data: GraphData,
  opts: { levels?: string[]; types?: string[]; limit?: number } = {},
): VizGraph {
  const levelSet = opts.levels && opts.levels.length > 0 ? new Set(opts.levels) : null;
  const typeSet = opts.types && opts.types.length > 0 ? new Set(opts.types) : null;

  let nodes = data.nodes as GraphNode[];
  if (levelSet) nodes = nodes.filter((n) => levelSet.has(n.level));

  // 规模保护：超上限时优先裁剪最底层（L3），保留高层结构与 C 层能力
  if (opts.limit && nodes.length > opts.limit) {
    const ordered = ['C', 'L1', 'L2', 'L3'];
    const keep: GraphNode[] = [];
    for (const lvl of ordered) {
      for (const n of nodes) {
        if (n.level === lvl && keep.length < opts.limit) keep.push(n);
      }
      if (keep.length >= opts.limit) break;
    }
    nodes = keep;
  }

  const idSet = new Set(nodes.map((n) => n.id));
  const edges = data.edges.filter(
    (e) => idSet.has(e.from) && idSet.has(e.to) && (!typeSet || typeSet.has(e.type)),
  );

  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      level: n.level,
      type: n.type,
      name: n.name,
      attrs: (n.attrs ?? {}) as unknown as Record<string, unknown>,
    })),
    edges: edges.map((e) => ({
      source: e.from,
      target: e.to,
      type: e.type,
      weight: e.weight ?? 0,
    })),
  };
}

export interface VizGraphStat {
  graphName: string;
  scanRoot?: string;
  projectType?: string;
  totalNodes: number;
  totalEdges: number;
  totalVectors: number;
  nodesByLevel: Record<string, number>;
  edgesByType: Record<string, number>;
  builtAt: number;
  schemaVersion: string;
  configVersion?: string;
  evidenceSources: { source: string; count: number; avgWeight: number }[];
  coverage: {
    mappedCapabilities: number;
    totalCapabilities: number;
    mappedModules: number;
    totalModules: number;
  };
}

/**
 * 图谱统计。
 *
 * meta.json 只有总量，evidenceSources（按边来源分组）与 coverage（能力/模块被映射的比例）
 * 需要现算——这两块正是「图谱统计」页要展示的映射质量。
 */
export function computeGraphStat(root: string, name: string = DEFAULT_GRAPH_NAME): VizGraphStat {
  const data = loadGraph(root, name);
  const meta = loadGraphMeta(root, name);

  const nodesByLevel: Record<string, number> = {};
  const edgesByType: Record<string, number> = {};
  const bySource = new Map<string, { count: number; weightSum: number }>();

  for (const n of data.nodes) {
    nodesByLevel[n.level] = (nodesByLevel[n.level] ?? 0) + 1;
  }

  const mappedCapabilityIds = new Set<string>();
  const mappedModuleIds = new Set<string>();

  for (const e of data.edges) {
    edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;

    const src = e.source ?? 'structure';
    const agg = bySource.get(src) ?? { count: 0, weightSum: 0 };
    agg.count++;
    agg.weightSum += e.weight ?? 0;
    bySource.set(src, agg);

    if (e.type === 'business_map') {
      mappedCapabilityIds.add(e.from);
      mappedModuleIds.add(e.to);
    }
  }

  const capabilityNodes = data.nodes.filter((n) => n.level === 'C');
  const moduleNodes = data.nodes.filter((n) => n.level === 'L1' || n.level === 'L2');

  return {
    graphName: name,
    scanRoot: meta?.scanRoot,
    projectType: meta?.projectType,
    totalNodes: data.nodes.length,
    totalEdges: data.edges.length,
    totalVectors: meta?.totalVectors ?? 0,
    nodesByLevel,
    edgesByType,
    builtAt: meta?.builtAt ?? 0,
    schemaVersion: meta?.schemaVersion ?? '',
    configVersion: meta?.configVersion,
    evidenceSources: [...bySource.entries()]
      .map(([source, agg]) => ({
        source,
        count: agg.count,
        avgWeight: agg.count ? Math.round((agg.weightSum / agg.count) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.count - a.count),
    coverage: {
      mappedCapabilities: capabilityNodes.filter((n) => mappedCapabilityIds.has(n.id)).length,
      totalCapabilities: capabilityNodes.length,
      mappedModules: moduleNodes.filter((n) => mappedModuleIds.has(n.id)).length,
      totalModules: moduleNodes.length,
    },
  };
}