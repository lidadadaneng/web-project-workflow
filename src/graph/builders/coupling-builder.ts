/**
 * 文件间耦合边构建：共能力边（sibling）
 *
 * 为什么需要这一类边
 * ------------------
 * 图谱原有的边分两类：
 *   结构边（contain / import / call / inherit）—— 「A 依赖 B」，描述编译期事实；
 *   业务映射边（business_map）—— 「能力 C 落在文件 F 上」，描述需求与实现的对应。
 *
 * 两者都无法回答一类常见问题：**改这个文件时，还有哪些文件该一起改**。
 * 例如一个能力在实现上横跨 controller / service / entity / 前端页面，它们之间可能
 * 没有直接 import（分属不同工程），也不在同一个目录；从任一文件出发做双向 BFS，
 * 只能沿「向上回到能力节点」再「向下散开」，而能力节点常常因为权重阈值或深度上限
 * 落在子图之外——于是同属于一个能力的其他文件就够不着。
 *
 * 共能力边直接把这些文件连起来：同被一个 C 层能力够到的两个文件之间加一条无向的
 * 弱边。它不声称两者互相调用，只声称「同属一个能力」，这恰是改动集划分的依据。
 *
 * 权重：取两侧 business_map 权重中较弱的一侧（min）。理由与串联可靠度一致——
 * 这条边的依据是「两个文件都属于该能力」这个合取式，两侧都成立才算数，
 * 因此下限由较弱的一侧决定。两侧都强（如都被高置信度语义命中）时这条边才强。
 *
 * 为什么不直接用 git 共变
 * -----------------------
 * 按提交历史统计「常一起改动的文件对」本来是更直接的依据，但本项目的实验仓库
 * 没有可用的提交历史（少数几次批量初始化提交，每次上千个文件），统计不出有效的
 * 文件对。共能力边是同一意图的可计算替代，且不依赖版本库。
 */
import type { GraphNode } from '../types';
import { EDGE_TYPE_BUSINESS_MAP, EDGE_TYPE_SIBLING } from '../types';
import type { EdgeBuilder } from './edge-builder';

/** 共能力边构建选项 */
export interface CouplingOptions {
  /**
   * 每个能力下参与两两连边的文件数上限（按 business_map 权重取前 K）
   *
   * 一个能力可能被语义映射到上百个文件，两两连边是 O(K²)。取前 K 是取舍：
   * 排在前面的文件是该能力的主要落点，把它们连成团已经能覆盖「改动集」的主体；
   * 排在后面的多是语义噪声，连进来只会把噪声也变成彼此的「证据」。
   */
  maxFilesPerCapability?: number;
  /** 权重折减系数（默认 1，即直接取两侧较弱值） */
  factor?: number;
  /** 权重上限（默认 0.95，与 business_map 一致） */
  maxWeight?: number;
}

/** 构建统计 */
export interface CouplingStats {
  /** 参与的 C 层能力数 */
  capabilities: number;
  /** 参与连边的文件数（去重） */
  files: number;
  /** 生成的共能力边数（两个方向各算一条） */
  edges: number;
  /** 因超过上限而未参与连边的文件数 */
  truncated: number;
}

/**
 * 依据已有的 business_map 边生成共能力边
 *
 * 必须在 business_map 边构建完成后调用：本函数读的是边构建器里已落盘的
 * business_map 边，而不是重新算一遍语义检索——这样图谱里能看到的「同能力」
 * 与边本身严格一致，不会出现「边说有、检索说没有」的两套口径。
 */
export function buildSiblingEdges(
  edgeBuilder: EdgeBuilder,
  nodeById: Map<string, GraphNode>,
  options: CouplingOptions = {},
): CouplingStats {
  const maxFiles = options.maxFilesPerCapability ?? 12;
  const factor = options.factor ?? 1;
  const maxWeight = options.maxWeight ?? 0.95;

  const stats: CouplingStats = { capabilities: 0, files: 0, edges: 0, truncated: 0 };

  // 1. 把 business_map 边按能力分组，目标归并到「文件」这一粒度
  //
  //    映射边可能指向 L1 模块、L2 文件或 L3 元素；共能力边要连的是文件，
  //    所以统一用 filePath 归属，并取该文件上最强的那条映射权重。
  const byCapability = new Map<string, Map<string, { nodeId: string; weight: number }>>();

  for (const e of edgeBuilder.getEdges()) {
    if (e.type !== EDGE_TYPE_BUSINESS_MAP) continue;
    const target = nodeById.get(e.to);
    if (!target) continue;
    const filePath = target.attrs.filePath;
    if (!filePath) continue; // 无文件归属的目标（能力节点之间等）不参与

    let files = byCapability.get(e.from);
    if (!files) {
      files = new Map();
      byCapability.set(e.from, files);
    }
    const prev = files.get(filePath);
    if (!prev) {
      files.set(filePath, { nodeId: target.id, weight: e.weight });
    } else {
      if (e.weight > prev.weight) prev.weight = e.weight;
      // 同一文件可能同时由 L2 文件节点和它的 L3 元素命中；保留层级较高（文件）的那个
      const prevNode = nodeById.get(prev.nodeId);
      if (prevNode && prevNode.level === 'L3' && target.level !== 'L3') prev.nodeId = target.id;
    }
  }

  // 2. 每个能力内部按权重排序、截断、两两连边
  const allFiles = new Set<string>();

  for (const [capNodeId, files] of byCapability) {
    const capName = nodeById.get(capNodeId)?.name ?? capNodeId;
    const ranked = [...files.values()].sort((a, b) => b.weight - a.weight);
    const kept = ranked.slice(0, maxFiles);
    stats.truncated += ranked.length - kept.length;
    if (kept.length < 2) continue;

    stats.capabilities += 1;
    for (const f of kept) allFiles.add(f.nodeId);

    for (let i = 0; i < kept.length; i += 1) {
      for (let k = i + 1; k < kept.length; k += 1) {
        const weight = Math.min(kept[i].weight, kept[k].weight, maxWeight) * factor;
        // 双向各加一条：共能力是对称关系，但子图遍历与「如何够到」的判定都按边的方向走，
        // 只加一个方向会让另一半候选拿不到这条证据。
        edgeBuilder.addEdge({
          from: kept[i].nodeId,
          to: kept[k].nodeId,
          type: EDGE_TYPE_SIBLING,
          weight,
          source: 'semantic',
          capability: capName,
        });
        edgeBuilder.addEdge({
          from: kept[k].nodeId,
          to: kept[i].nodeId,
          type: EDGE_TYPE_SIBLING,
          weight,
          source: 'semantic',
          capability: capName,
        });
        stats.edges += 2;
      }
    }
  }

  stats.files = allFiles.size;
  return stats;
}