/**
 * 真实上下文管线（供「上下文演示」与「图谱增强对话」共用）。
 *
 * 与 `wpw graph context` 走的是同一套实现：语义检索找锚点 → 加权双向 BFS 扩子图 →
 * 按压缩等级序列化，只是把结果整理成前端要的形状。
 *
 * 语义检索依赖 @xenova/transformers（首次会下载 embedding 模型，且需要向量索引）。
 * 任一环节不可用时**降级为按名称匹配锚点**并把原因回传，保证离线也能演示。
 */
import type { GraphNode } from '../graph/types';
import { ContextPipeline } from '../graph/context/context-pipeline';
import type { CompressionLevel } from '../graph/compression/hierarchical-serializer';
import { loadGraphConfig } from '../graph/config';
import { BinaryVectorStore } from '../graph/storage/vector-store';
import { VectorMappingStore } from '../graph/storage/mapping-store';
import { resolveGraphDir } from '../graph/storage/graph-path';
import type { VectorMapping } from '../graph/types';
import { loadGraph } from './store';
import { toVizGraph, type VizGraph } from './store';

export interface ContextAnchor {
  id: string;
  name: string;
  level: string;
  score: number;
}

export interface ContextResultItem {
  level: CompressionLevel;
  nodeCount: number;
  tokenEstimate: number;
  serialized: string;
}

export interface ContextDemoResult {
  query: string;
  anchors: ContextAnchor[];
  subgraph: VizGraph;
  results: ContextResultItem[];
  /**
   * 导航形态（与三档上下文正文并列）
   *
   * 图谱在任务里的用法是「辅助搜索」：把搜索空间缩小到若干条路径，由调用方自己决定
   * 读什么。这一项给的就是那张地图，不含代码内容，体积通常只有正文的三分之一上下。
   */
  nav: ContextResultItem;
  /** 非空表示发生了降级（如无向量索引 / 模型不可用），内容为原因 */
  degraded?: string;
}

export interface ContextOptions {
  graph?: string;
  budget?: number;
  depth?: number;
  maxNodes?: number;
  /** 是否尝试语义检索（关闭则直接按名称匹配锚点） */
  semantic?: boolean;
  anchorLimit?: number;
}

const LEVELS: CompressionLevel[] = ['loose', 'standard', 'extreme'];

function loadVectors(root: string, graph: string): {
  vectors: Float32Array | null;
  dimensions: number;
  mapping: VectorMapping | null;
} {
  const graphDir = resolveGraphDir(root, graph);
  const vectorStore = new BinaryVectorStore(graphDir);
  const mappingStore = new VectorMappingStore(graphDir);

  const mapping = mappingStore.load();
  if (!vectorStore.exists() || !mapping || mapping.indexToNodeId.length === 0) {
    return { vectors: null, dimensions: 0, mapping: null };
  }

  const vectors = vectorStore.load();
  const dimensions = vectorStore.getDimensions() ?? 0;
  if (!vectors || dimensions === 0) {
    return { vectors: null, dimensions: 0, mapping: null };
  }
  return { vectors, dimensions, mapping };
}

/**
 * 降级锚点：按名称/类型做朴素匹配。
 *
 * 中英文混排的项目名往往是英文（cart、order），而查询常是中文，
 * 所以这里既做子串匹配，也把查询按非字母数字切碎后逐段匹配。
 */
function fallbackAnchors(data: { nodes: GraphNode[] }, query: string, limit: number): GraphNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const tokens = q.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  const scored: { node: GraphNode; score: number }[] = [];

  for (const node of data.nodes) {
    const name = node.name.toLowerCase();
    const hay = `${name} ${String((node.attrs as Record<string, unknown>)?.description ?? '').toLowerCase()}`;

    let score = 0;
    if (name === q) score = 1;
    else if (name.includes(q) || q.includes(name)) score = 0.8;
    else if (tokens.some((t) => hay.includes(t))) score = 0.6;

    if (score > 0) {
      // 高层节点（能力/模块）更适合当锚点
      const levelBonus = node.level === 'C' ? 0.15 : node.level === 'L1' ? 0.1 : 0;
      scored.push({ node, score: Math.min(1, score + levelBonus) });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.node);
}

/**
 * 端到端生成上下文。
 *
 * 先解析锚点（语义检索，失败则降级），再用同一组锚点跑三档压缩，
 * 这样三档结果之间可比——差异只来自压缩等级。
 */
export async function generateContext(
  root: string,
  query: string,
  opts: ContextOptions = {},
): Promise<ContextDemoResult> {
  const graph = opts.graph ?? 'default';
  const data = loadGraph(root, graph);
  const config = loadGraphConfig(root);

  let degraded: string | undefined;
  const semanticWanted = opts.semantic !== false;
  const { vectors, dimensions, mapping } = semanticWanted
    ? loadVectors(root, graph)
    : { vectors: null, dimensions: 0, mapping: null };

  if (semanticWanted && !vectors) {
    degraded = '未找到向量索引，已降级为按名称匹配锚点（可执行 wpw graph build 构建向量）';
  }

  let anchors: GraphNode[] = [];
  let pipeline: ContextPipeline | null = null;

  if (vectors && mapping) {
    try {
      pipeline = new ContextPipeline(data, vectors, dimensions, mapping, config);
      const first = await pipeline.generate({
        query,
        anchorLimit: opts.anchorLimit ?? 5,
      });
      anchors = first.anchors;
    } catch (e) {
      degraded = `语义检索不可用（${(e as Error).message}），已降级为按名称匹配锚点`;
      pipeline = null;
      anchors = [];
    }
  }

  if (anchors.length === 0) {
    anchors = fallbackAnchors(data, query, opts.anchorLimit ?? 5);
    if (degraded === undefined && anchors.length > 0) {
      degraded = '语义检索未命中，已回退为按名称匹配锚点';
    }
  }

  if (anchors.length === 0) {
    return {
      query,
      anchors: [],
      subgraph: { nodes: [], edges: [] },
      results: LEVELS.map((level) => ({ level, nodeCount: 0, tokenEstimate: 0, serialized: '' })),
      nav: { level: 'standard', nodeCount: 0, tokenEstimate: 0, serialized: '' },
      degraded: degraded ?? '未找到匹配的节点，请换一个关键词',
    };
  }

  const anchorIds = anchors.map((a) => a.id);
  const scoreOf = (id: string) => {
    const idx = anchorIds.indexOf(id);
    return Math.max(0.5, 1 - idx * 0.08);
  };

  const results: ContextResultItem[] = [];
  let subgraph: VizGraph = { nodes: [], edges: [] };
  let navRunner: ContextPipeline | null = pipeline;

  if (pipeline) {
    // 带向量时：三档压缩都走真实管线（子图取中档）
    for (const level of LEVELS) {
      const r = await pipeline.generate({
        anchors: anchorIds,
        compression: level,
        depth: opts.depth,
        maxNodes: opts.maxNodes,
      });
      if (level === 'standard') {
        subgraph = toVizGraph({ nodes: r.subgraph.nodes, edges: r.subgraph.edges });
      }
      results.push({
        level,
        nodeCount: r.stats.nodeCount,
        tokenEstimate: r.stats.estimatedTokens,
        serialized: r.compressedText,
      });
    }
  } else {
    // 降级：无向量时仍可扩子图 + 三档压缩（跳过语义检索这一步）
    const querierPipeline = new ContextPipeline(data, null, 0, null, config);
    navRunner = querierPipeline;
    for (const level of LEVELS) {
      const r = await querierPipeline.generate({
        anchors: anchorIds,
        compression: level,
        depth: opts.depth,
        maxNodes: opts.maxNodes,
      });
      if (level === 'standard') {
        subgraph = toVizGraph({ nodes: r.subgraph.nodes, edges: r.subgraph.edges });
      }
      results.push({
        level,
        nodeCount: r.stats.nodeCount,
        tokenEstimate: r.stats.estimatedTokens,
        serialized: r.compressedText,
      });
    }
  }

  // 导航形态：同一批锚点、同一张子图，只换输出内容（路径与关系，不含代码）
  let nav: ContextResultItem = { level: 'standard', nodeCount: 0, tokenEstimate: 0, serialized: '' };
  if (navRunner) {
    const r = await navRunner.generate({
      anchors: anchorIds,
      mode: 'nav',
      depth: opts.depth,
      maxNodes: opts.maxNodes,
    });
    nav = {
      level: 'standard',
      nodeCount: r.stats.nodeCount,
      tokenEstimate: r.stats.estimatedTokens,
      serialized: r.compressedText,
    };
  }

  // Token 预算：若指定，则只保留不超过预算的结果（前端据此提示超支）
  if (opts.budget && opts.budget > 0) {
    for (const r of [...results, nav]) {
      if (r.tokenEstimate > opts.budget) {
        r.serialized = `[超预算] 该档约 ${r.tokenEstimate} tokens，超出预算 ${opts.budget}。\n\n${r.serialized}`;
      }
    }
  }

  return {
    query,
    anchors: anchors.map((a) => ({
      id: a.id,
      name: a.name,
      level: a.level,
      score: Math.round(scoreOf(a.id) * 100) / 100,
    })),
    subgraph,
    results,
    nav,
    degraded,
  };
}

/**
 * 供对话注入用的精简上下文：只要标准档的序列化文本与 token 估算。
 * 拿不到任何上下文时返回 null（对话退化为纯模型回答，而不是报错）。
 */
export async function buildChatContext(
  root: string,
  query: string,
  budget: number,
  graph = 'default',
): Promise<{ text: string; tokens: number; summary: string; degraded?: string } | null> {
  try {
    const result = await generateContext(root, query, { graph, budget, anchorLimit: 3 });
    const standard = result.results.find((r) => r.level === 'standard');
    if (!standard || standard.tokenEstimate === 0) return null;

    return {
      text: standard.serialized,
      tokens: standard.tokenEstimate,
      summary: `锚点 ${result.anchors.map((a) => a.name).join('、')}；子图 ${standard.nodeCount} 节点`,
      degraded: result.degraded,
    };
  } catch (e) {
    console.warn(`[viz] 生成对话上下文失败: ${(e as Error).message}`);
    return null;
  }
}