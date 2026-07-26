/**
 * Context Pipeline — 端到端上下文生成
 *
 * 完整流程：
 *   语义检索（可选） → 子图裁剪 → 骨架抽取 → 层级序列化
 *
 * 支持 Token 预算迭代调整：
 *   如果输出超过 Token 预算，依次尝试：
 *     1. 降低压缩等级（loose → standard → extreme）
 *     2. 减少节点上限
 *     3. 减少扩展深度
 *     4. 提升最小权重阈值
 *     5. 最终降级为仅锚点节点
 */
import type {
  GraphData,
  GraphConfig,
  GraphNode,
  Subgraph,
  ContextResult,
  ContextStats,
  VectorMapping,
} from '../types';
import { GraphQuerier } from '../search/graph-query';
import { SemanticSearcher } from '../search/semantic-search';
import { SubgraphTrimmer } from '../trimming/subgraph-trimmer';
import { setEmbeddingModel, setEmbeddingMirror } from '../builders/vector-builder';
import {
  HierarchicalSerializer,
  type CompressionLevel,
  estimateTokens,
} from '../compression/hierarchical-serializer';
import { buildGraphIndex } from '../storage/graph-store';

/** 上下文生成选项 */
export interface ContextOptions {
  /** 自然语言查询（用于语义检索找锚点） */
  query?: string;
  /** 直接指定锚点节点 ID 列表（跳过语义检索） */
  anchors?: string[];
  /** 多查询支持（query 用逗号分隔，分别检索再合并） */
  multi?: boolean;
  /** 最大 Token 预算 */
  tokenBudget?: number;
  /** 子图扩展深度 */
  depth?: number;
  /** 最小边权重 */
  minWeight?: number;
  /** 节点上限 */
  maxNodes?: number;
  /** 压缩等级 */
  compression?: CompressionLevel;
  /** 按层级过滤 */
  level?: string | string[];
  /** 按节点类型过滤 */
  type?: string | string[];
  /** 是否包含归档需求 */
  includeArchived?: boolean;
  /** 每个查询召回的锚点数量 */
  anchorLimit?: number;
  /** 语义检索相似度阈值（覆盖配置） */
  threshold?: number;
}

/**
 * Context Pipeline 执行器
 *
 * 用法：
 *   const pipeline = new ContextPipeline(graphData, vectors, dimensions, mapping, config);
 *   const result = await pipeline.generate({ query: "用户登录", tokenBudget: 8000 });
 */
export class ContextPipeline {
  private querier: GraphQuerier;
  private searcher: SemanticSearcher | null;
  private config: GraphConfig;
  private data: GraphData;

  constructor(
    data: GraphData,
    vectors: Float32Array | null,
    dimensions: number,
    mapping: VectorMapping | null,
    config: GraphConfig,
  ) {
    this.data = data;
    this.querier = new GraphQuerier(data);
    this.config = config;

    // 设置 embedding 模型和镜像，确保查询向量和构建时使用同一个模型
    setEmbeddingModel(config.embedding.model);
    if (config.embedding.mirror) {
      setEmbeddingMirror(config.embedding.mirror);
    }

    if (vectors && mapping && mapping.indexToNodeId.length > 0) {
      this.searcher = new SemanticSearcher(this.querier, vectors, dimensions, mapping);
    } else {
      this.searcher = null;
    }
  }

  /**
   * 生成上下文
   */
  async generate(options: ContextOptions = {}): Promise<ContextResult> {
    const startTime = Date.now();

    // 1. 确定锚点
    const searchStart = Date.now();
    const anchorIds = await this.resolveAnchors(options);
    const searchTime = Date.now() - searchStart;

    if (anchorIds.length === 0) {
      const emptyResult = this.buildEmptyResult(options);
      emptyResult.stats.searchTimeMs = searchTime;
      emptyResult.stats.totalTimeMs = Date.now() - startTime;
      return emptyResult;
    }

    // 2. Token 预算迭代调整
    const tokenBudget = options.tokenBudget ?? 0;

    if (tokenBudget > 0) {
      return this.generateWithBudget(anchorIds, options, tokenBudget, startTime, searchTime);
    }

    // 3. 无预算模式：直接生成
    return this.generateOnce(anchorIds, options, startTime, searchTime);
  }

  // ==================== 锚点解析 ====================

  private async resolveAnchors(options: ContextOptions): Promise<string[]> {
    // 直接指定锚点
    if (options.anchors && options.anchors.length > 0) {
      // 过滤掉不存在的节点
      return options.anchors.filter((id) => this.querier.getNode(id) !== null);
    }

    // 语义检索
    if (options.query && this.searcher) {
      const queries = options.multi
        ? options.query.split(/[,，]/).map((q) => q.trim()).filter(Boolean)
        : [options.query];

      const allAnchors: string[] = [];
      const limit = options.anchorLimit ?? 5;

      for (const q of queries) {
        const results = await this.searcher.search(q, {
          limit,
          threshold: options.threshold ?? this.config.search.threshold,
          excludeArchived: !options.includeArchived,
          level: options.level,
          type: options.type,
        });
        for (const r of results) {
          if (!allAnchors.includes(r.node.id)) {
            allAnchors.push(r.node.id);
          }
        }
      }

      return allAnchors;
    }

    return [];
  }

  // ==================== 单次生成 ====================

  private generateOnce(
    anchorIds: string[],
    options: ContextOptions,
    startTime: number,
    searchTime: number,
  ): ContextResult {
    const config = this.config;
    const depth = options.depth ?? config.trimming.defaultDepth;
    const minWeight = options.minWeight ?? config.trimming.minWeight;
    const maxNodes = options.maxNodes ?? config.trimming.maxNodes;
    const compression = options.compression ?? config.compression.level;

    // 子图裁剪
    const trimStart = Date.now();
    const trimmer = new SubgraphTrimmer(this.data);
    const subgraph = trimmer.buildSubgraph(anchorIds, {
      depth,
      minWeight,
      maxNodes,
      semanticWeight: config.trimming.semanticWeight,
      structuralWeight: config.trimming.structuralWeight,
    });
    const trimTime = Date.now() - trimStart;

    // 层级过滤（后处理）
    const filteredSubgraph = this.filterSubgraphByLevel(subgraph, options);

    // 压缩序列化
    const compStart = Date.now();
    const serializer = new HierarchicalSerializer(filteredSubgraph, { level: compression });
    const serialized = serializer.serialize({ showStats: false });
    const compTime = Date.now() - compStart;

    // 锚点节点列表
    const anchorNodes = anchorIds
      .map((id) => this.querier.getNode(id))
      .filter((n): n is GraphNode => !!n);

    const totalTime = Date.now() - startTime;

    // 统计
    const stats: ContextStats = {
      anchorCount: anchorIds.length,
      nodeCount: filteredSubgraph.nodes.length,
      edgeCount: filteredSubgraph.edges.length,
      estimatedTokens: serialized.estimatedTokens,
      compressionRatio: this.calcCompressionRatio(filteredSubgraph, serialized.estimatedTokens),
      searchTimeMs: searchTime,
      trimmingTimeMs: trimTime,
      compressionTimeMs: compTime,
      totalTimeMs: totalTime,
    };

    return {
      anchors: anchorNodes,
      subgraph: filteredSubgraph,
      compressedText: serialized.text,
      stats,
    };
  }

  // ==================== Token 预算迭代 ====================

  /**
   * 带 Token 预算的迭代生成
   *
   * 迭代策略（由宽松到严格）：
   *   1. 初始参数 + 当前压缩等级
   *   2. 降低压缩等级（→ standard → extreme）
   *   3. 节点上限减半
   *   4. 深度减 1
   *   5. 提升权重阈值（+0.1）
   *   6. 最终降级：仅锚点 + extreme 压缩
   */
  private async generateWithBudget(
    anchorIds: string[],
    options: ContextOptions,
    tokenBudget: number,
    startTime: number,
    searchTime: number,
  ): Promise<ContextResult> {
    const config = this.config;

    // 迭代参数
    let depth = options.depth ?? config.trimming.defaultDepth;
    let minWeight = options.minWeight ?? config.trimming.minWeight;
    let maxNodes = options.maxNodes ?? config.trimming.maxNodes;
    let compression: CompressionLevel = options.compression ?? config.compression.level;
    let budgetExceeded = false;

    // 迭代次数上限
    const MAX_ITERATIONS = 8;
    let lastResult: ContextResult | null = null;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const result = this.generateOnce(
        anchorIds,
        {
          ...options,
          depth,
          minWeight,
          maxNodes,
          compression,
        },
        startTime,
        searchTime,
      );

      lastResult = result;

      if (result.stats.estimatedTokens <= tokenBudget) {
        // 满足预算
        return result;
      }

      budgetExceeded = true;

      // 调整参数
      if (compression === 'loose') {
        compression = 'standard';
      } else if (compression === 'standard') {
        compression = 'extreme';
      } else if (maxNodes > 10) {
        maxNodes = Math.max(10, Math.floor(maxNodes / 2));
      } else if (depth > 0) {
        depth -= 1;
      } else if (minWeight < 0.9) {
        minWeight = Math.min(0.9, minWeight + 0.1);
      } else {
        // 已经到底了，退出循环
        break;
      }
    }

    // 最后降级：仅锚点节点
    if (lastResult && lastResult.stats.estimatedTokens > tokenBudget) {
      const anchorResult = this.generateAnchorOnly(
        anchorIds,
        options,
        startTime,
        searchTime,
      );

      // 加上预算警告
      if (anchorResult.stats.estimatedTokens > tokenBudget) {
        // 真的太小了，在文本前加警告
        const warning = `[警告] Token 预算 (${tokenBudget}) 不足，仅输出核心锚点。\n\n`;
        anchorResult.compressedText = warning + anchorResult.compressedText;
        anchorResult.stats.estimatedTokens += estimateTokens(warning);
      }

      return anchorResult;
    }

    return lastResult!;
  }

  /**
   * 仅锚点模式：子图中只包含锚点节点
   */
  private generateAnchorOnly(
    anchorIds: string[],
    options: ContextOptions,
    startTime: number,
    searchTime: number,
  ): ContextResult {
    const anchorNodes = anchorIds
      .map((id) => this.querier.getNode(id))
      .filter((n): n is GraphNode => !!n);

    const subgraph: Subgraph = {
      nodes: anchorNodes,
      edges: [],
      anchors: anchorIds,
      distances: new Map(anchorIds.map((id) => [id, 0])),
      scores: new Map(anchorIds.map((id) => [id, 1.0])),
    };

    const compStart = Date.now();
    const serializer = new HierarchicalSerializer(subgraph, { level: 'extreme' });
    const serialized = serializer.serialize({ showStats: false });
    const compTime = Date.now() - compStart;

    const totalTime = Date.now() - startTime;

    return {
      anchors: anchorNodes,
      subgraph,
      compressedText: serialized.text,
      stats: {
        anchorCount: anchorIds.length,
        nodeCount: anchorNodes.length,
        edgeCount: 0,
        estimatedTokens: serialized.estimatedTokens,
        compressionRatio: 1,
        searchTimeMs: searchTime,
        trimmingTimeMs: 0,
        compressionTimeMs: compTime,
        totalTimeMs: totalTime,
      },
    };
  }

  // ==================== 空结果 ====================

  private buildEmptyResult(options: ContextOptions): ContextResult {
    return {
      anchors: [],
      subgraph: {
        nodes: [],
        edges: [],
        anchors: [],
        distances: new Map(),
        scores: new Map(),
      },
      compressedText: '（未找到匹配的节点，请尝试调整查询条件或构建图谱）',
      stats: {
        anchorCount: 0,
        nodeCount: 0,
        edgeCount: 0,
        estimatedTokens: 0,
        compressionRatio: 1,
        searchTimeMs: 0,
        trimmingTimeMs: 0,
        compressionTimeMs: 0,
        totalTimeMs: 0,
      },
    };
  }

  // ==================== 工具函数 ====================

  /**
   * 按层级/类型过滤子图节点（锚点始终保留）
   */
  private filterSubgraphByLevel(subgraph: Subgraph, options: ContextOptions): Subgraph {
    const levelFilter = options.level
      ? (Array.isArray(options.level) ? options.level : [options.level])
      : null;
    const typeFilter = options.type
      ? (Array.isArray(options.type) ? options.type : [options.type])
      : null;

    if (!levelFilter && !typeFilter) return subgraph;

    const levelSet = levelFilter ? new Set(levelFilter) : null;
    const typeSet = typeFilter ? new Set(typeFilter) : null;
    const anchorSet = new Set(subgraph.anchors);

    const filteredNodes = subgraph.nodes.filter((n) => {
      // 锚点始终保留
      if (anchorSet.has(n.id)) return true;
      if (levelSet && !levelSet.has(n.level)) return false;
      if (typeSet && !typeSet.has(n.type)) return false;
      return true;
    });

    const nodeIdSet = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = subgraph.edges.filter(
      (e) => nodeIdSet.has(e.from) && nodeIdSet.has(e.to),
    );

    const filteredDistances = new Map<string, number>();
    const filteredScores = new Map<string, number>();
    for (const node of filteredNodes) {
      const d = subgraph.distances.get(node.id);
      if (d !== undefined) filteredDistances.set(node.id, d);
      const s = subgraph.scores.get(node.id);
      if (s !== undefined) filteredScores.set(node.id, s);
    }

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      anchors: subgraph.anchors,
      distances: filteredDistances,
      scores: filteredScores,
    };
  }

  /**
   * 计算压缩率（子图所有节点完整文本 token / 压缩后 token）
   */
  private calcCompressionRatio(subgraph: Subgraph, compressedTokens: number): number {
    if (compressedTokens === 0) return 1;

    // 估算原始文本大小：所有节点的名称 + 描述 + 签名 + JSDoc
    let rawChars = 0;
    for (const node of subgraph.nodes) {
      rawChars += node.name.length;
      if (node.attrs.description) rawChars += node.attrs.description.length;
      if (node.attrs.signature) rawChars += node.attrs.signature.length;
      if (node.attrs.jsDoc) rawChars += node.attrs.jsDoc.length;
    }

    const rawTokens = Math.ceil(rawChars / 2); // 粗略估算
    if (rawTokens === 0) return 1;

    return Math.round((rawTokens / compressedTokens) * 100) / 100;
  }
}
