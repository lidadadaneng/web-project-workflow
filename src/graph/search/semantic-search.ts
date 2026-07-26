/**
 * 语义检索引擎
 *
 * 基于向量相似度的自然语言检索，支持多条件组合过滤。
 */
import type { GraphNode, VectorMapping } from '../types';
import { buildVectors, cosineSimilarity, setEmbeddingModel } from '../builders/vector-builder';
import { expandQueryToEnglish } from '../parsers/mapping-sources';
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

/** 词汇加分分级（取最大值，不累加） */
const LEX_BOOST_EXACT = 0.35; // 查询词与节点名精确/互含匹配
const LEX_BOOST_PREFIX = 0.25; // 英文等价词为节点名前缀
const LEX_BOOST_CONTAINS = 0.15; // 英文等价词包含于节点名
const LEX_BOOST_PARENT_FILE = 0.10; // 英文等价词命中 parentName/filePath
const LEX_BOOST_COMMENT = 0.08; // 英文等价词命中 JSDoc/注释/描述

/**
 * 计算词汇加分（lexBoost）：跨语言桥接"中文查询 ↔ 英文代码标识符"
 *
 * 分级（取最大值）：
 *   - 查询词与节点名精确/互含 +0.35
 *   - 英文等价词为节点名前缀 +0.25
 *   - 英文等价词包含于节点名 +0.15
 *   - 英文等价词命中 parentName/filePath +0.10
 *
 * 无命中返回 0（纯语义场景不受影响）。
 */
export function computeLexBoost(query: string, enEquivalents: string[], node: GraphNode): number {
  const queryLower = query.toLowerCase();
  if (!queryLower) return 0;

  const nameLower = node.name.toLowerCase();
  const parentName = (node.attrs.parentName ?? '').toLowerCase();
  const filePath = (node.attrs.filePath ?? '').toLowerCase();
  const jsDoc = (node.attrs.jsDoc ?? '').toLowerCase();
  const description = (node.attrs.description ?? '').toLowerCase();

  let boost = 0;

  // 精确/互含名称匹配（查询词本身）
  if (
    nameLower === queryLower ||
    (nameLower && queryLower.includes(nameLower)) ||
    nameLower.includes(queryLower)
  ) {
    boost = Math.max(boost, LEX_BOOST_EXACT);
  }

  // 查询词本身命中注释/JSDoc/描述
  if (jsDoc.includes(queryLower) || description.includes(queryLower)) {
    boost = Math.max(boost, LEX_BOOST_COMMENT);
  }

  // 英文等价词分级匹配（跳过原词，原词已在精确匹配处理）
  for (const en of enEquivalents) {
    if (!en || en === query) continue;
    const enLower = en.toLowerCase();
    if (!enLower || !nameLower) continue;

    if (nameLower.startsWith(enLower)) {
      boost = Math.max(boost, LEX_BOOST_PREFIX);
    } else if (nameLower.includes(enLower)) {
      boost = Math.max(boost, LEX_BOOST_CONTAINS);
    } else if (parentName.includes(enLower) || filePath.includes(enLower)) {
      boost = Math.max(boost, LEX_BOOST_PARENT_FILE);
    } else if (jsDoc.includes(enLower) || description.includes(enLower)) {
      boost = Math.max(boost, LEX_BOOST_COMMENT);
    }
  }

  return boost;
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

    // 跨语言词汇等价词（供 lexBoost 桥接中文查询 <-> 英文标识符）
    const enEquivalents = expandQueryToEnglish(query);

    // 计算所有向量的相似度 + 词汇加分
    const totalVectors = this.mapping.indexToNodeId.length;
    const scores: Array<{ node: GraphNode; score: number }> = [];

    for (let i = 0; i < totalVectors; i++) {
      const nodeId = this.mapping.indexToNodeId[i];
      const node = this.querier.getNode(nodeId);
      if (!node) continue;

      const vecOffset = i * this.dimensions;
      const vec = this.vectors.subarray(vecOffset, vecOffset + this.dimensions);
      const sim = cosineSimilarity(queryVec, vec);
      const lexBoost = computeLexBoost(query, enEquivalents, node);
      const finalScore = Math.min(1.0, sim + lexBoost);

      if (finalScore >= threshold) {
        scores.push({ node, score: finalScore });
      }
    }

    // 按最终得分降序排序
    scores.sort((a, b) => b.score - a.score);

    // 应用过滤条件
    let results: SearchResult[] = [];
    const levelFilter = this.toArray(options.level);
    const typeFilter = this.toArray(options.type);
    const excludeArchived = options.excludeArchived ?? true;

    for (const { node, score } of scores) {
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
