/**
 * 子图裁剪器
 *
 * 基于锚点集合生成加权双向 BFS 子图，支持：
 *   - 单锚点 / 多锚点子图扩展
 *   - 结构重要度计算（加权入度）
 *   - 节点上限裁剪：语义分 × 语义权重 + 结构重要度 × 结构权重
 *   - Token 预算约束：迭代调整深度、权重阈值、节点上限
 */
import type {
  GraphData,
  GraphNode,
  GraphEdge,
  GraphIndex,
  Subgraph,
  GraphTrimmingConfig,
} from '../types';
import { buildGraphIndex } from '../storage/graph-store';

/** 子图扩展选项 */
export interface SubgraphOptions {
  /** 最大扩展深度（双向） */
  depth?: number;
  /** 最小边权重 */
  minWeight?: number;
  /** 节点数量上限（0 = 不限制） */
  maxNodes?: number;
  /** 语义分权重（综合得分中占比） */
  semanticWeight?: number;
  /** 结构重要度权重 */
  structuralWeight?: number;
  /** 边类型白名单（不传则全部允许） */
  edgeTypes?: string[];
  /** 节点预计算的语义得分（nodeId → score，0~1） */
  semanticScores?: Map<string, number>;
}

/**
 * 子图裁剪器
 *
 * 用法：
 *   const trimmer = new SubgraphTrimmer(graphData);
 *   const subgraph = await trimmer.buildSubgraph(anchorIds, options);
 */
export class SubgraphTrimmer {
  private data: GraphData;
  private idx: GraphIndex;

  constructor(data: GraphData) {
    this.data = data;
    this.idx = buildGraphIndex(data);
  }

  // ==================== 主入口 ====================

  /**
   * 构建子图
   *
   * 流程：双向 BFS 扩展 → 多锚点合并 → 结构重要度计算 → 节点上限裁剪
   */
  buildSubgraph(anchorIds: string[], options: SubgraphOptions = {}): Subgraph {
    const depth = options.depth ?? 3;
    const minWeight = options.minWeight ?? 0;
    const maxNodes = options.maxNodes ?? 0;
    const semanticWeight = options.semanticWeight ?? 0.6;
    const structuralWeight = options.structuralWeight ?? 0.4;
    const edgeTypeSet = options.edgeTypes ? new Set(options.edgeTypes) : null;
    const semanticScores = options.semanticScores;

    // 过滤有效锚点
    const validAnchors = anchorIds.filter((id) => this.idx.nodeMap.has(id));
    if (validAnchors.length === 0) {
      return {
        nodes: [],
        edges: [],
        anchors: [],
        distances: new Map(),
        scores: new Map(),
      };
    }

    // 1. 每个锚点独立双向 BFS 扩展
    const perAnchorResults = validAnchors.map((anchorId) =>
      this.bidirectionalBFS(anchorId, depth, minWeight, edgeTypeSet),
    );

    // 2. 多锚点合并（去重 + 取最小距离）
    const mergedDistances = this.mergeAnchorDistances(perAnchorResults);

    // 3. 收集所有节点和边
    const nodeIds = Array.from(mergedDistances.keys());
    const nodeSet = new Set(nodeIds);
    const subgraphEdges = this.collectEdges(nodeSet, minWeight, edgeTypeSet);

    // 4. 计算结构重要度
    const structuralScores = this.calcStructuralImportance(nodeSet, subgraphEdges);

    // 5. 综合得分
    const finalScores = this.calcFinalScores(
      nodeIds,
      validAnchors,
      mergedDistances,
      structuralScores,
      semanticScores,
      semanticWeight,
      structuralWeight,
    );

    // 6. 构建子图对象
    let subgraphNodes: GraphNode[] = nodeIds
      .map((id) => this.idx.nodeMap.get(id)!)
      .filter(Boolean);

    let finalEdges = subgraphEdges;
    let finalDistances = mergedDistances;
    let finalScoresMap = finalScores;

    // 7. 节点上限裁剪
    if (maxNodes > 0 && subgraphNodes.length > maxNodes) {
      const result = this.trimByNodeLimit(
        subgraphNodes,
        finalEdges,
        finalScores,
        mergedDistances,
        validAnchors,
        maxNodes,
      );
      subgraphNodes = result.nodes;
      finalEdges = result.edges;
      finalDistances = result.distances;
      finalScoresMap = result.scores;
    }

    return {
      nodes: subgraphNodes,
      edges: finalEdges,
      anchors: validAnchors,
      distances: finalDistances,
      scores: finalScoresMap,
    };
  }

  // ==================== 双向 BFS ====================

  /**
   * 加权双向 BFS：从锚点出发，同时沿出边和入边扩展
   *
   * 返回 Map<nodeId, distance>，distance 为最短距离
   */
  private bidirectionalBFS(
    anchorId: string,
    maxDepth: number,
    minWeight: number,
    edgeTypeSet: Set<string> | null,
  ): Map<string, number> {
    const distances = new Map<string, number>();
    distances.set(anchorId, 0);

    // 队列：{ nodeId, depth, direction }
    // direction: 'down' = 沿出边，'up' = 沿入边
    const queue: Array<{ id: string; depth: number; direction: 'down' | 'up' }> = [];
    queue.push({ id: anchorId, depth: 0, direction: 'down' });
    queue.push({ id: anchorId, depth: 0, direction: 'up' });

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      if (current.direction === 'down') {
        // 沿出边向下游扩展
        const edges = this.idx.outEdges.get(current.id) ?? [];
        for (const edge of edges) {
          if (edge.weight < minWeight) continue;
          if (edgeTypeSet && !edgeTypeSet.has(edge.type)) continue;

          const nextId = edge.to;
          const nextDepth = current.depth + 1;
          const existing = distances.get(nextId);
          if (existing === undefined || nextDepth < existing) {
            distances.set(nextId, nextDepth);
            queue.push({ id: nextId, depth: nextDepth, direction: 'down' });
          }
        }
      } else {
        // 沿入边向上游扩展
        const edges = this.idx.inEdges.get(current.id) ?? [];
        for (const edge of edges) {
          if (edge.weight < minWeight) continue;
          if (edgeTypeSet && !edgeTypeSet.has(edge.type)) continue;

          const prevId = edge.from;
          const prevDepth = current.depth + 1;
          const existing = distances.get(prevId);
          if (existing === undefined || prevDepth < existing) {
            distances.set(prevId, prevDepth);
            queue.push({ id: prevId, depth: prevDepth, direction: 'up' });
          }
        }
      }
    }

    return distances;
  }

  // ==================== 多锚点合并 ====================

  /**
   * 合并多个锚点的距离映射，取最小距离
   */
  private mergeAnchorDistances(perAnchor: Array<Map<string, number>>): Map<string, number> {
    const merged = new Map<string, number>();

    for (const distMap of perAnchor) {
      for (const [nodeId, dist] of distMap) {
        const existing = merged.get(nodeId);
        if (existing === undefined || dist < existing) {
          merged.set(nodeId, dist);
        }
      }
    }

    return merged;
  }

  // ==================== 边收集 ====================

  /**
   * 收集子图中节点之间的边（两端都在子图内）
   */
  private collectEdges(
    nodeSet: Set<string>,
    minWeight: number,
    edgeTypeSet: Set<string> | null,
  ): GraphEdge[] {
    const edges: GraphEdge[] = [];

    for (const edge of this.data.edges) {
      if (edge.weight < minWeight) continue;
      if (edgeTypeSet && !edgeTypeSet.has(edge.type)) continue;
      if (!nodeSet.has(edge.from)) continue;
      if (!nodeSet.has(edge.to)) continue;
      edges.push(edge);
    }

    return edges;
  }

  // ==================== 结构重要度 ====================

  /**
   * 计算节点在子图中的结构重要度
   *
   * 公式：入边权重之和 + 出边权重之和的一定比例
   * 归一化到 0~1 区间。
   *
   * 为什么入度更重要：被越多节点依赖 → 越核心 → 越不能裁
   */
  private calcStructuralImportance(
    nodeSet: Set<string>,
    edges: GraphEdge[],
  ): Map<string, number> {
    const rawScores = new Map<string, number>();

    // 初始化
    for (const nodeId of nodeSet) {
      rawScores.set(nodeId, 0);
    }

    // 累加边权重：入边权重 × 1.0 + 出边权重 × 0.5
    for (const edge of edges) {
      // 入边（被指向）更重要
      const inScore = rawScores.get(edge.to) ?? 0;
      rawScores.set(edge.to, inScore + edge.weight * 1.0);

      // 出边也有一定重要性
      const outScore = rawScores.get(edge.from) ?? 0;
      rawScores.set(edge.from, outScore + edge.weight * 0.5);
    }

    // 归一化到 0~1
    let maxScore = 0;
    for (const score of rawScores.values()) {
      if (score > maxScore) maxScore = score;
    }

    const normalized = new Map<string, number>();
    if (maxScore === 0) {
      for (const nodeId of nodeSet) {
        normalized.set(nodeId, 0.5);
      }
    } else {
      for (const [nodeId, score] of rawScores) {
        normalized.set(nodeId, score / maxScore);
      }
    }

    return normalized;
  }

  // ==================== 综合得分 ====================

  /**
   * 计算最终综合得分
   *
   * score = semanticScore × semanticWeight + structuralScore × structuralWeight
   *
   * 锚点节点强制给 1.0（确保不被裁掉）。
   * 没有语义分的节点，语义分按 0.5 兜底。
   */
  private calcFinalScores(
    nodeIds: string[],
    anchors: string[],
    distances: Map<string, number>,
    structuralScores: Map<string, number>,
    semanticScores: Map<string, number> | undefined,
    semanticWeight: number,
    structuralWeight: number,
  ): Map<string, number> {
    const anchorSet = new Set(anchors);
    const scores = new Map<string, number>();

    for (const nodeId of nodeIds) {
      // 锚点给满分
      if (anchorSet.has(nodeId)) {
        scores.set(nodeId, 1.0);
        continue;
      }

      const semScore = semanticScores?.get(nodeId) ?? 0.5;
      const structScore = structuralScores.get(nodeId) ?? 0.5;

      // 距离衰减：距离越远得分略降（防止远节点抢分）
      const dist = distances.get(nodeId) ?? 1;
      const distFactor = Math.max(0.7, 1 - dist * 0.05);

      const final = (semScore * semanticWeight + structScore * structuralWeight) * distFactor;
      scores.set(nodeId, Math.min(1.0, final));
    }

    return scores;
  }

  // ==================== 节点上限裁剪 ====================

  /**
   * 按节点上限裁剪
   *
   * 保留规则：
   *   1. 锚点必须保留
   *   2. 其余按综合得分从高到低保留
   *   3. 裁剪后重新收集边（只保留两端都在的边）
   */
  private trimByNodeLimit(
    nodes: GraphNode[],
    edges: GraphEdge[],
    scores: Map<string, number>,
    distances: Map<string, number>,
    anchors: string[],
    maxNodes: number,
  ): {
    nodes: GraphNode[];
    edges: GraphEdge[];
    distances: Map<string, number>;
    scores: Map<string, number>;
  } {
    const anchorSet = new Set(anchors);

    // 分类：锚点节点 + 非锚点节点
    const anchorNodes = nodes.filter((n) => anchorSet.has(n.id));
    const otherNodes = nodes.filter((n) => !anchorSet.has(n.id));

    // 非锚点按得分降序
    otherNodes.sort((a, b) => {
      const sa = scores.get(a.id) ?? 0;
      const sb = scores.get(b.id) ?? 0;
      return sb - sa;
    });

    // 保留前 N 个
    const remainingSlots = maxNodes - anchorNodes.length;
    const keptOthers = remainingSlots > 0 ? otherNodes.slice(0, remainingSlots) : [];

    const keptNodes = [...anchorNodes, ...keptOthers];
    const keptSet = new Set(keptNodes.map((n) => n.id));

    // 重新收集边
    const keptEdges = edges.filter((e) => keptSet.has(e.from) && keptSet.has(e.to));

    // 裁剪距离和得分映射
    const keptDistances = new Map<string, number>();
    const keptScores = new Map<string, number>();
    for (const node of keptNodes) {
      const dist = distances.get(node.id);
      if (dist !== undefined) keptDistances.set(node.id, dist);
      const score = scores.get(node.id);
      if (score !== undefined) keptScores.set(node.id, score);
    }

    return {
      nodes: keptNodes,
      edges: keptEdges,
      distances: keptDistances,
      scores: keptScores,
    };
  }

  /** 获取索引（供外部使用） */
  getIndex(): GraphIndex {
    return this.idx;
  }
}

// ==================== 配置辅助 ====================

/**
 * 从 GraphTrimmingConfig 构建 SubgraphOptions
 */
export function trimmingConfigToOptions(
  config: GraphTrimmingConfig,
): Omit<SubgraphOptions, 'semanticScores' | 'edgeTypes'> {
  return {
    depth: config.defaultDepth,
    minWeight: config.minWeight,
    maxNodes: config.maxNodes,
    semanticWeight: config.semanticWeight,
    structuralWeight: config.structuralWeight,
  };
}
