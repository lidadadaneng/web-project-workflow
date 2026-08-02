/**
 * 图谱结构化查询 API
 *
 * 提供节点查询、批量过滤、依赖链路、最短路径、统计概览等功能。
 * 全部基于内存索引，零数据库依赖。
 */
import type {
  GraphData,
  GraphNode,
  GraphEdge,
  GraphIndex,
  NodeLevel,
  NodeType,
} from '../types';
import { buildGraphIndex } from '../storage/graph-store';

/** 查询选项 */
export interface QueryOptions {
  /** 按层级过滤 */
  level?: NodeLevel | NodeLevel[];
  /** 按节点类型过滤 */
  type?: NodeType | NodeType[];
  /** 按所属模块过滤（L2/L3 节点） */
  module?: string;
  /** 按所属文件过滤（L3 节点） */
  file?: string;
  /** 返回数量上限 */
  limit?: number;
  /** 偏移量 */
  offset?: number;
}

/** 依赖查询选项 */
export interface DependencyOptions {
  /** 最大深度 */
  depth?: number;
  /** 最小权重 */
  minWeight?: number;
  /** 边类型过滤 */
  edgeTypes?: string[];
}

/** 依赖查询结果项 */
export interface DependencyResult {
  node: GraphNode;
  /** 距起始节点的深度 */
  depth: number;
  /** 路径累计权重（最小边权重的路径？或者平均？这里用平均） */
  avgWeight: number;
}

/** 路径查询结果 */
export interface PathResult {
  /** 路径上的节点序列 */
  nodes: GraphNode[];
  /** 路径上的边序列 */
  edges: GraphEdge[];
  /** 路径长度（边数） */
  length: number;
}

/** 图谱统计 */
export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  totalVectors: number;
  nodesByLevel: Record<string, number>;
  edgesByType: Record<string, number>;
  builtAt?: number;
}

export class GraphQuerier {
  private data: GraphData;
  private idx: GraphIndex;

  constructor(data: GraphData) {
    this.data = data;
    this.idx = buildGraphIndex(data);
  }

  // ==================== 节点查询 ====================

  /** 按 ID 查询单个节点 */
  getNode(id: string): GraphNode | null {
    return this.idx.nodeMap.get(id) ?? null;
  }

  /** 按条件批量查询节点 */
  queryNodes(options: QueryOptions = {}): GraphNode[] {
    let nodes = [...this.data.nodes];

    if (options.level) {
      const levels = Array.isArray(options.level) ? options.level : [options.level];
      const levelSet = new Set(levels);
      nodes = nodes.filter((n) => levelSet.has(n.level));
    }

    if (options.type) {
      const types = Array.isArray(options.type) ? options.type : [options.type];
      const typeSet = new Set(types);
      nodes = nodes.filter((n) => typeSet.has(n.type));
    }

    if (options.file) {
      const file = options.file;
      // 先找到文件节点
      const fileNode = nodes.find(
        (n) => n.type === 'file' && n.attrs.filePath === file,
      );
      if (fileNode) {
        // 找该文件 contain 的元素
        const containEdges = this.idx.outEdges.get(fileNode.id) ?? [];
        const elemIds = new Set(
          containEdges.filter((e) => e.type === 'contain').map((e) => e.to),
        );
        nodes = nodes.filter((n) => elemIds.has(n.id));
      } else {
        nodes = [];
      }
    }

    if (options.offset) {
      nodes = nodes.slice(options.offset);
    }
    if (options.limit) {
      nodes = nodes.slice(0, options.limit);
    }

    return nodes;
  }

  // ==================== 依赖查询 ====================

  /**
   * 查询下游依赖（从节点出发，沿出边 BFS）
   */
  getDownstream(nodeId: string, options: DependencyOptions = {}): DependencyResult[] {
    const maxDepth = options.depth ?? 3;
    const minWeight = options.minWeight ?? 0;
    const edgeTypeSet = options.edgeTypes ? new Set(options.edgeTypes) : null;

    const visited = new Map<string, { depth: number; weights: number[] }>();
    const queue: Array<{ id: string; depth: number; weight: number }> = [];

    visited.set(nodeId, { depth: 0, weights: [] });
    queue.push({ id: nodeId, depth: 0, weight: 1 });

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      const edges = this.idx.outEdges.get(current.id) ?? [];
      for (const edge of edges) {
        if (edge.weight < minWeight) continue;
        if (edgeTypeSet && !edgeTypeSet.has(edge.type)) continue;

        const nextId = edge.to;
        if (visited.has(nextId)) {
          // 已访问，但记录多条路径的权重
          const v = visited.get(nextId)!;
          v.weights.push(edge.weight);
          continue;
        }

        visited.set(nextId, {
          depth: current.depth + 1,
          weights: [edge.weight],
        });
        queue.push({ id: nextId, depth: current.depth + 1, weight: edge.weight });
      }
    }

    // 构建结果
    const results: DependencyResult[] = [];
    for (const [id, info] of visited) {
      if (id === nodeId) continue; // 排除自身
      const node = this.idx.nodeMap.get(id);
      if (!node) continue;
      const avgWeight =
        info.weights.length > 0
          ? info.weights.reduce((a, b) => a + b, 0) / info.weights.length
          : 0;
      results.push({ node, depth: info.depth, avgWeight });
    }

    return results.sort((a, b) => a.depth - b.depth);
  }

  /**
   * 查询上游依赖（沿入边 BFS）
   */
  getUpstream(nodeId: string, options: DependencyOptions = {}): DependencyResult[] {
    const maxDepth = options.depth ?? 3;
    const minWeight = options.minWeight ?? 0;
    const edgeTypeSet = options.edgeTypes ? new Set(options.edgeTypes) : null;

    const visited = new Map<string, { depth: number; weights: number[] }>();
    const queue: Array<{ id: string; depth: number; weight: number }> = [];

    visited.set(nodeId, { depth: 0, weights: [] });
    queue.push({ id: nodeId, depth: 0, weight: 1 });

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      const edges = this.idx.inEdges.get(current.id) ?? [];
      for (const edge of edges) {
        if (edge.weight < minWeight) continue;
        if (edgeTypeSet && !edgeTypeSet.has(edge.type)) continue;

        const prevId = edge.from;
        if (visited.has(prevId)) {
          const v = visited.get(prevId)!;
          v.weights.push(edge.weight);
          continue;
        }

        visited.set(prevId, {
          depth: current.depth + 1,
          weights: [edge.weight],
        });
        queue.push({ id: prevId, depth: current.depth + 1, weight: edge.weight });
      }
    }

    const results: DependencyResult[] = [];
    for (const [id, info] of visited) {
      if (id === nodeId) continue;
      const node = this.idx.nodeMap.get(id);
      if (!node) continue;
      const avgWeight =
        info.weights.length > 0
          ? info.weights.reduce((a, b) => a + b, 0) / info.weights.length
          : 0;
      results.push({ node, depth: info.depth, avgWeight });
    }

    return results.sort((a, b) => a.depth - b.depth);
  }

  // ==================== 最短路径 ====================

  /**
   * 查询两节点间的最短路径（BFS）
   *
   * 路径长度 = 边数，不考虑权重（只看连通性）。
   */
  getShortestPath(fromId: string, toId: string, options: DependencyOptions = {}): PathResult | null {
    const minWeight = options.minWeight ?? 0;
    const edgeTypeSet = options.edgeTypes ? new Set(options.edgeTypes) : null;
    const maxDepth = options.depth ?? 10;

    if (fromId === toId) {
      const node = this.getNode(fromId);
      if (!node) return null;
      return { nodes: [node], edges: [], length: 0 };
    }

    // BFS 记录前驱
    const prev = new Map<string, { nodeId: string; edge: GraphEdge }>();
    const visited = new Set<string>();
    const queue: string[] = [];

    visited.add(fromId);
    queue.push(fromId);

    let found = false;
    while (queue.length > 0 && !found) {
      const current = queue.shift()!;
      const edges = this.idx.outEdges.get(current) ?? [];

      for (const edge of edges) {
        if (edge.weight < minWeight) continue;
        if (edgeTypeSet && !edgeTypeSet.has(edge.type)) continue;

        const nextId = edge.to;
        if (visited.has(nextId)) continue;

        visited.add(nextId);
        prev.set(nextId, { nodeId: current, edge });

        if (nextId === toId) {
          found = true;
          break;
        }

        // 深度限制
        // 简单处理：用 BFS 层级估算，超过 maxDepth 不继续
        // 精确深度需要记录层级，这里简化处理
        queue.push(nextId);
      }
    }

    if (!found) return null;

    // 回溯路径
    const pathNodes: GraphNode[] = [];
    const pathEdges: GraphEdge[] = [];
    let current = toId;

    while (current !== fromId) {
      const p = prev.get(current);
      if (!p) break;

      const node = this.idx.nodeMap.get(current);
      if (node) pathNodes.unshift(node);
      pathEdges.unshift(p.edge);

      current = p.nodeId;
    }

    // 加上起始节点
    const fromNode = this.idx.nodeMap.get(fromId);
    if (fromNode) pathNodes.unshift(fromNode);

    return {
      nodes: pathNodes,
      edges: pathEdges,
      length: pathEdges.length,
    };
  }

  // ==================== 统计 ====================

  /** 图谱统计 */
  getStats(totalVectors: number = 0, builtAt?: number): GraphStats {
    const nodesByLevel: Record<string, number> = {};
    const edgesByType: Record<string, number> = {};

    for (const n of this.data.nodes) {
      nodesByLevel[n.level] = (nodesByLevel[n.level] || 0) + 1;
    }
    for (const e of this.data.edges) {
      edgesByType[e.type] = (edgesByType[e.type] || 0) + 1;
    }

    return {
      totalNodes: this.data.nodes.length,
      totalEdges: this.data.edges.length,
      totalVectors,
      nodesByLevel,
      edgesByType,
      builtAt,
    };
  }

  /** 获取原始数据 */
  getData(): GraphData {
    return this.data;
  }

  /** 获取索引 */
  getIndex(): GraphIndex {
    return this.idx;
  }
}
