/**
 * 关系边生成器
 *
 * 生成五类边：
 * - contain: 从属边（需求⊃模块、模块⊃文件、文件⊃元素）
 * - import: 文件间导入
 * - call: 文件内函数调用
 * - inherit: 文件内类继承/接口实现
 * - business_map: 业务映射（需求 ↔ 模块/文件/元素）
 */
import type {
  GraphEdge,
  GraphNode,
  EdgeType,
  EdgeSource,
} from '../types';
import {
  EDGE_TYPE_CONTAIN,
  EDGE_TYPE_IMPORT,
  EDGE_TYPE_CALL,
  EDGE_TYPE_INHERIT,
  EDGE_TYPE_BUSINESS_MAP,
} from '../types';

/** 边构建器 */
export class EdgeBuilder {
  private edges: Map<string, GraphEdge> = new Map();

  /** 添加一条边（去重，同类型同起止点只保留一条） */
  addEdge(params: {
    from: string;
    to: string;
    type: EdgeType;
    weight: number;
    source: EdgeSource;
  }): void {
    const id = this.edgeId(params.from, params.to, params.type);

    const existing = this.edges.get(id);
    if (existing) {
      // 已存在：取权重更高的、来源更权威的
      if (params.weight > existing.weight) {
        existing.weight = params.weight;
        existing.source = params.source;
      }
      return;
    }

    this.edges.set(id, {
      id,
      from: params.from,
      to: params.to,
      type: params.type,
      weight: Math.max(0, Math.min(1, params.weight)),
      source: params.source,
    });
  }

  /** 权重叠加（同一对节点同类型边，多来源命中则权重递增） */
  boostEdge(params: {
    from: string;
    to: string;
    type: EdgeType;
    weightBoost: number;
    source: EdgeSource;
  }): void {
    const id = this.edgeId(params.from, params.to, params.type);
    const existing = this.edges.get(id);

    if (existing) {
      // 叠加权重，上限 0.95
      existing.weight = Math.min(0.95, existing.weight + params.weightBoost);
      // 保留权重来源中最权威的
      const sourceRank: Record<EdgeSource, number> = {
        'structure': 10,
        'doc-extract': 8,
        'ai-refine': 7,
        'git-history': 5,
        'semantic': 4,
        'name-match': 2,
      };
      if (sourceRank[params.source] > sourceRank[existing.source]) {
        existing.source = params.source;
      }
    } else {
      this.addEdge({
        ...params,
        weight: params.weightBoost,
      });
    }
  }

  /** 添加 contain 边 */
  addContain(from: string, to: string, source: EdgeSource = 'structure'): void {
    this.addEdge({ from, to, type: EDGE_TYPE_CONTAIN, weight: 0.9, source });
  }

  /** 添加 import 边 */
  addImport(from: string, to: string, source: EdgeSource = 'structure'): void {
    this.addEdge({ from, to, type: EDGE_TYPE_IMPORT, weight: 0.75, source });
  }

  /** 添加 call 边 */
  addCall(from: string, to: string, source: EdgeSource = 'structure'): void {
    this.addEdge({ from, to, type: EDGE_TYPE_CALL, weight: 0.95, source });
  }

  /** 添加 inherit 边 */
  addInherit(from: string, to: string, source: EdgeSource = 'structure'): void {
    this.addEdge({ from, to, type: EDGE_TYPE_INHERIT, weight: 0.85, source });
  }

  /** 添加 business_map 边 */
  addBusinessMap(from: string, to: string, weight: number, source: EdgeSource): void {
    this.addEdge({ from, to, type: EDGE_TYPE_BUSINESS_MAP, weight, source });
  }

  /** 获取所有边 */
  getEdges(): GraphEdge[] {
    return Array.from(this.edges.values());
  }

  /** 获取边数量 */
  size(): number {
    return this.edges.size;
  }

  private edgeId(from: string, to: string, type: EdgeType): string {
    return `${from}->${type}->${to}`;
  }
}

// ==================== 业务映射：五层混合策略 ====================

export interface MappingEvidence {
  /** 目标节点 ID */
  targetId: string;
  /** 证据来源 */
  source: EdgeSource;
  /** 该证据的基础权重（0~1） */
  baseWeight: number;
}

/**
 * 多层证据权重叠加
 *
 * 同一目标被多层证据命中时，权重递增。
 * 公式：最终权重 = 1 - ∏(1 - 每层权重)
 * （直观理解：每层证据都有一定把握，多层同时命中把握更大，最高 0.95）
 */
export function aggregateWeights(evidences: MappingEvidence[]): Map<string, number> {
  const weights = new Map<string, number>();
  const bestSource = new Map<string, EdgeSource>();

  const sourceRank: Record<EdgeSource, number> = {
    'structure': 10,
    'doc-extract': 8,
    'ai-refine': 7,
    'git-history': 5,
    'semantic': 4,
    'name-match': 2,
  };

  // 按目标分组，收集所有证据
  const byTarget = new Map<string, MappingEvidence[]>();
  for (const ev of evidences) {
    const arr = byTarget.get(ev.targetId) ?? [];
    arr.push(ev);
    byTarget.set(ev.targetId, arr);
  }

  // 对每个目标计算叠加权重
  for (const [targetId, evs] of byTarget) {
    let product = 1;
    let bestSrc: EdgeSource = 'name-match';
    let bestRank = 0;

    for (const ev of evs) {
      product *= 1 - Math.max(0, Math.min(1, ev.baseWeight));
      const rank = sourceRank[ev.source] ?? 0;
      if (rank > bestRank) {
        bestRank = rank;
        bestSrc = ev.source;
      }
    }

    const finalWeight = Math.min(0.95, 1 - product);
    weights.set(targetId, finalWeight);
    bestSource.set(targetId, bestSrc);
  }

  return weights;
}
