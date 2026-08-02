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

  /**
   * 直接添加一条完整边（保留所有扩展属性，如 method / eventName / bindPath 等）
   *
   * 用于小程序/uni-app 等场景生成的带扩展属性的边。
   * 同 from-to-type 去重：已存在则保留权重更高的。
   */
  addRawEdge(edge: GraphEdge): void {
    const id = this.edgeId(edge.from, edge.to, edge.type);
    const existing = this.edges.get(id);
    if (existing) {
      if (edge.weight > existing.weight) {
        this.edges.set(id, edge);
      }
      return;
    }
    this.edges.set(id, { ...edge, id });
  }

  /**
   * 权重叠加（同一对节点同类型边，多来源命中则权重递增）
   *
   * 定位：增量场景专用。当 `updateGraph` 对已存在的边追加新证据（如增量文件
   * 触发的新 semantic/git 证据）时，用本方法叠加权重而非重建整条边。
   *
   * 注意：全量构建（buildGraph）的多源聚合统一走 `aggregateWeights`，
   * 一次性收集所有证据并计算 noisy-OR 权重后，通过 `addEdge` 写入。
   * 本方法仅供增量更新场景使用，故全量构建流程中不会被调用（非死代码）。
   */
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

/** 聚合后的证据结果（noisy-OR 权重 + 最权威溯源） */
export interface AggregatedEvidence {
  /** 聚合权重（noisy-OR：1 − ∏(1 − wᵢ)，上限 0.95） */
  weight: number;
  /** 支撑该权重的最权威证据来源（用于 business_map 边 source 字段溯源） */
  source: EdgeSource;
}

/**
 * 多层证据权重叠加
 *
 * 同一目标被多层证据命中时，权重递增。
 * 公式：最终权重 = 1 - ∏(1 - 每层权重)
 * （直观理解：每层证据都有一定把握，多层同时命中把握更大，最高 0.95）
 *
 * 返回每个目标的聚合权重与最权威证据来源。调用方应据此设置 business_map 边的
 * source 字段，而非依赖证据数组的 push 顺序（多源场景下顺序无关性由此保证）。
 */
export function aggregateWeights(evidences: MappingEvidence[]): Map<string, AggregatedEvidence> {
  const result = new Map<string, AggregatedEvidence>();

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
    result.set(targetId, { weight: finalWeight, source: bestSrc });
  }

  return result;
}
