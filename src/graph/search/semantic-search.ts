/**
 * 语义检索引擎
 *
 * 基于向量相似度的自然语言检索，支持多条件组合过滤。
 */
import type { GraphNode, VectorMapping } from '../types';
import { buildVectors, cosineSimilarity, setEmbeddingModel } from '../builders/vector-builder';
import { GraphQuerier } from './graph-query';

/** 检索结果项 */
export interface SearchResult {
  node: GraphNode;
  /** 相似度得分（0~1） */
  score: number;
}

/** 检索选项 */
export interface SearchOptions {
  /** 返回数量上限 */
  limit?: number;
  /** 相似度阈值 */
  threshold?: number;
  /** 按层级过滤 */
  level?: string | string[];
  /** 按节点类型过滤 */
  type?: string | string[];
  /** 是否排除归档需求 */
  excludeArchived?: boolean;
}

/**
 * 语义检索器
 *
 * 用法：
 *   const searcher = new SemanticSearcher(querier, vectors, mapping);
 *   const results = await searcher.search("用户登录", { limit: 10 });
 */
export class SemanticSearcher {
  private querier: GraphQuerier;
  private vectors: Float32Array;
  private dimensions: number;
  private mapping: VectorMapping;
  private queryVectorCache: Map<string, Float32Array> = new Map();

  constructor(
    querier: GraphQuerier,
    vectors: Float32Array,
    dimensions: number,
    mapping: VectorMapping,
  ) {
    this.querier = querier;
    this.vectors = vectors;
    this.dimensions = dimensions;
    this.mapping = mapping;
  }

  /**
   * 语义检索
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 10;
    const threshold = options.threshold ?? 0.5;

    // 生成查询向量
    const queryVec = await this.getQueryVector(query);

    // 计算所有向量的相似度
    const totalVectors = this.mapping.indexToNodeId.length;
    const scores: Array<{ nodeId: string; score: number }> = [];

    for (let i = 0; i < totalVectors; i++) {
      const vecOffset = i * this.dimensions;
      const vec = this.vectors.subarray(vecOffset, vecOffset + this.dimensions);
      const sim = cosineSimilarity(queryVec, vec);

      if (sim >= threshold) {
        const nodeId = this.mapping.indexToNodeId[i];
        scores.push({ nodeId, score: sim });
      }
    }

    // 按相似度降序排序
    scores.sort((a, b) => b.score - a.score);

    // 应用过滤条件
    let results: SearchResult[] = [];
    const levelFilter = this.toArray(options.level);
    const typeFilter = this.toArray(options.type);
    const excludeArchived = options.excludeArchived ?? true;

    for (const { nodeId, score } of scores) {
      const node = this.querier.getNode(nodeId);
      if (!node) continue;

      // 层级过滤
      if (levelFilter.length > 0 && !levelFilter.includes(node.level)) continue;

      // 类型过滤
      if (typeFilter.length > 0 && !typeFilter.includes(node.type)) continue;

      // 归档过滤（只对 L1 需求节点生效）
      if (excludeArchived && node.level === 'L1') {
        if (node.attrs.status?.archived) continue;
      }

      results.push({ node, score });

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * 获取查询向量（带缓存）
   */
  private async getQueryVector(query: string): Promise<Float32Array> {
    if (this.queryVectorCache.has(query)) {
      return this.queryVectorCache.get(query)!;
    }

    const { vectors } = await buildVectors([query]);
    const vec = vectors.subarray(0, this.dimensions);

    // 拷贝一份，避免被复用
    const copy = new Float32Array(this.dimensions);
    copy.set(vec);

    this.queryVectorCache.set(query, copy);
    return copy;
  }

  private toArray(v?: string | string[]): string[] {
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }
}

/**
 * 从文本生成查询向量（工具函数）
 */
export async function vectorizeQuery(query: string, model?: string): Promise<Float32Array> {
  if (model) setEmbeddingModel(model);
  const { vectors, dimensions } = await buildVectors([query]);
  const result = new Float32Array(dimensions);
  result.set(vectors.subarray(0, dimensions));
  return result;
}
