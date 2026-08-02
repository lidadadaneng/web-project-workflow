/**
 * 语义检索引擎
 *
 * 基于向量相似度的自然语言检索，支持多条件组合过滤。
 * 支持置信度衰减加权锚点选择（Confidence Decay Weighting）：
 *   根据 C 层最高相似度动态调整 L1 层得分权重。
 */
import type { GraphNode, VectorMapping, GraphSearchConfig } from '../types';
import { buildVectors, cosineSimilarity, setEmbeddingModel } from '../builders/vector-builder';
import { expandQueryToEnglish } from '../parsers/mapping-sources';
import { GraphQuerier } from './graph-query';

/** 检索结果项 */
export interface SearchResult {
  node: GraphNode;
  /** 相似度得分（0~1） */
  score: number;
  /** 有效得分（置信度衰减后的得分，仅锚点选择时使用） */
  effectiveScore?: number;
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
  /** 是否启用置信度衰减加权（默认 false，仅锚点选择时启用） */
  decay?: boolean;
}

/** 词汇加分分级（取最大值，不累加） */
const LEX_BOOST_EXACT = 0.35;
const LEX_BOOST_PREFIX = 0.25;
const LEX_BOOST_CONTAINS = 0.15;
const LEX_BOOST_PARENT_FILE = 0.10;
const LEX_BOOST_COMMENT = 0.08;

/**
 * 计算词汇加分（lexBoost）
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

  if (
    nameLower === queryLower ||
    (nameLower && queryLower.includes(nameLower)) ||
    nameLower.includes(queryLower)
  ) {
    boost = Math.max(boost, LEX_BOOST_EXACT);
  }

  if (jsDoc.includes(queryLower) || description.includes(queryLower)) {
    boost = Math.max(boost, LEX_BOOST_COMMENT);
  }

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
 * 置信度衰减加权函数
 *
 * w_L1 = exp(-α * Conf_C)
 *
 * Conf_C 为 C 层最高相似度，α 为衰减系数。
 * 高 C 置信 → 低 L1 权重（减少粗粒度模块的子图膨胀）
 * 低 C 置信 → 高 L1 权重（兜底，靠模块级检索保证召回）
 *
 * 仅 L1 层受衰减影响，L2/L3 保持原分。
 * C 层为空时 Conf_C = 0，w_L1 = 1.0（完全兜底）。
 */
export function computeL1DecayWeight(confC: number, alpha: number): number {
  return Math.exp(-alpha * confC);
}

/**
 * 语义检索器
 *
 * 用法：
 *   const searcher = new SemanticSearcher(querier, vectors, dimensions, mapping, decayAlpha);
 *   const results = await searcher.search("user login", { limit: 10 });
 */
export class SemanticSearcher {
  private querier: GraphQuerier;
  private vectors: Float32Array;
  private dimensions: number;
  private mapping: VectorMapping;
  private decayAlpha: number;
  private queryVectorCache: Map<string, Float32Array> = new Map();

  constructor(
    querier: GraphQuerier,
    vectors: Float32Array,
    dimensions: number,
    mapping: VectorMapping,
    decayAlpha: number = 3.0,
  ) {
    this.querier = querier;
    this.vectors = vectors;
    this.dimensions = dimensions;
    this.mapping = mapping;
    this.decayAlpha = decayAlpha;
  }

  /**
   * 语义检索
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 10;
    const threshold = options.threshold ?? 0.5;
    const enableDecay = options.decay ?? false;

    const queryVec = await this.getQueryVector(query);
    const enEquivalents = expandQueryToEnglish(query);

    const totalVectors = this.mapping.indexToNodeId.length;
    const scores: Array<{ node: GraphNode; score: number }> = [];

    let confC = 0; // C 层最高相似度

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

      // 跟踪 C 层最高置信度
      if (enableDecay && node.level === 'C' && finalScore > confC) {
        confC = finalScore;
      }
    }

    // 应用层级/类型过滤（先过滤再排序，支持衰减）
    const levelFilter = this.toArray(options.level);
    const typeFilter = this.toArray(options.type);

    let filtered = scores.filter(({ node }) => {
      if (levelFilter.length > 0 && !levelFilter.includes(node.level)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(node.type)) return false;
      return true;
    });

    // 如果启用衰减，计算有效得分并排序
    if (enableDecay) {
      const l1Weight = computeL1DecayWeight(confC, this.decayAlpha);

      const withEffective = filtered.map(({ node, score }) => {
        let effectiveScore = score;
        // 仅 L1 层受衰减影响
        if (node.level === 'L1') {
          effectiveScore = score * l1Weight;
        }
        // C 层、L2、L3 保持原分
        return { node, score, effectiveScore };
      });

      withEffective.sort((a, b) => b.effectiveScore - a.effectiveScore);
      return withEffective.slice(0, limit);
    }

    // 普通模式：按原始得分排序
    filtered.sort((a, b) => b.score - a.score);
    return filtered.slice(0, limit).map(({ node, score }) => ({ node, score }));
  }

  /**
   * 获取 C 层最高置信度（用于外部调用方获取衰减信息）
   */
  async getCConfidence(query: string, threshold: number = 0.5): Promise<number> {
    const queryVec = await this.getQueryVector(query);
    let confC = 0;
    const totalVectors = this.mapping.indexToNodeId.length;

    for (let i = 0; i < totalVectors; i++) {
      const nodeId = this.mapping.indexToNodeId[i];
      const node = this.querier.getNode(nodeId);
      if (!node || node.level !== 'C') continue;

      const vecOffset = i * this.dimensions;
      const vec = this.vectors.subarray(vecOffset, vecOffset + this.dimensions);
      const sim = cosineSimilarity(queryVec, vec);
      if (sim > confC) confC = sim;
    }

    return confC;
  }

  private async getQueryVector(query: string): Promise<Float32Array> {
    if (this.queryVectorCache.has(query)) {
      return this.queryVectorCache.get(query)!;
    }

    const { vectors } = await buildVectors([query]);
    const vec = vectors.subarray(0, this.dimensions);

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
