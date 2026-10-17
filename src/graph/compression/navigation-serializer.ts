/**
 * 导航式序列化
 *
 * 与 HierarchicalSerializer 的区别在于输出的是什么：
 *   HierarchicalSerializer — 把子图组织成一段「上下文正文」（层级树 + 元素名 + 依赖），
 *                            当作可直接使用的材料交给下游；
 *   NavigationSerializer   — 只输出「往哪里看」的导航（锚点、候选文件路径、够到它的
 *                            那条边、还能换哪个关键词），不含任何代码内容。
 *
 * 后者的用法是：图谱负责把搜索空间缩小到若干条路径，由调用方（人或智能体）自己决定
 * 打开哪些文件、读多少；导航本身很小，可以反复取、也可以放进提示前缀而不挤压预算。
 *
 * 输出内容：
 *   1. 锚点（按相关度），标注层级与类型；
 *   2. 候选文件（按相关度降序，带「如何够到」：锚点所在 / 包含 / 导入 / 调用 / 业务映射）；
 *   3. 子图里其余相关能力（换关键词继续查的入口）；
 *   4. 一句用法提示。
 */
import type { Subgraph, GraphNode, NavCandidate, NavVia } from '../types';
import {
  EDGE_TYPE_CONTAIN,
  EDGE_TYPE_CALL,
  EDGE_TYPE_IMPORT,
  EDGE_TYPE_INHERIT,
  EDGE_TYPE_BUSINESS_MAP,
  EDGE_TYPE_SIBLING,
} from '../types';
import { estimateTokens } from './hierarchical-serializer';

export type { NavCandidate, NavVia };

/** 导航序列化选项 */
export interface NavigateOptions {
  /**
   * 最多列出多少个候选位置（0 或省略 = 全部）
   *
   * 导航是搜索辅助件，漏掉路径就等于没搜到，所以默认不截断；真正约束体积的是
   * 下面那个「详细列出多少个」，其余位置只给路径。
   */
  maxFiles?: number;
  /** 前多少个候选位置附上「是怎么够到的」（默认 25） */
  maxDetailFiles?: number;
  /** 最多列出的锚点数（默认 5） */
  maxAnchors?: number;
  /** 是否输出用法提示行（默认输出） */
  showHint?: boolean;
}

/** 候选文件条目（结构定义见 types.ts 的 NavCandidate，此处仅作文档索引） */

const EDGE_LABEL: Record<string, string> = {
  [EDGE_TYPE_CONTAIN]: '包含',
  [EDGE_TYPE_IMPORT]: '导入',
  [EDGE_TYPE_CALL]: '调用',
  [EDGE_TYPE_INHERIT]: '继承',
  [EDGE_TYPE_BUSINESS_MAP]: '业务映射',
  [EDGE_TYPE_SIBLING]: '共能力',
};

/** 节点所在位置：文件优先，其次模块目录 */
function locationOf(node: GraphNode): { path: string; isDir: boolean } | null {
  if (node.attrs.filePath) return { path: node.attrs.filePath, isDir: false };
  if (node.attrs.dir) return { path: node.attrs.dir, isDir: true };
  return null;
}

export class NavigationSerializer {
  private subgraph: Subgraph;
  private nodeMap: Map<string, GraphNode>;

  constructor(subgraph: Subgraph) {
    this.subgraph = subgraph;
    this.nodeMap = new Map(subgraph.nodes.map((n) => [n.id, n]));
  }

  serialize(options: NavigateOptions = {}): { text: string; estimatedTokens: number; candidates: NavCandidate[] } {
    const maxFiles = options.maxFiles && options.maxFiles > 0 ? options.maxFiles : Infinity;
    const maxDetailFiles = options.maxDetailFiles ?? 25;
    const maxAnchors = options.maxAnchors ?? 5;
    const showHint = options.showHint ?? true;

    const anchorSet = new Set(this.subgraph.anchors);
    const lines: string[] = [];
    lines.push('=== 项目导航（图谱检索结果，不含代码内容）===');
    lines.push('');

    // ---- 锚点 ----
    const anchors = this.subgraph.anchors
      .map((id) => this.nodeMap.get(id))
      .filter((n): n is GraphNode => !!n)
      .sort((a, b) => (this.subgraph.scores.get(b.id) ?? 0) - (this.subgraph.scores.get(a.id) ?? 0));

    lines.push(`锚点（${anchors.length} 个，按相关度降序）：`);
    if (anchors.length === 0) {
      lines.push('  （无）');
    }
    for (const a of anchors.slice(0, maxAnchors)) {
      const score = (this.subgraph.scores.get(a.id) ?? 1).toFixed(2);
      const where = locationOf(a);
      const loc = where ? `  ${where.path}` : '';
      lines.push(`  ◉ [${a.level}] ${a.name}  (相关度 ${score})${loc}`);
    }
    if (anchors.length > maxAnchors) {
      lines.push(`  ... 另有 ${anchors.length - maxAnchors} 个锚点`);
    }
    lines.push('');

    // ---- 候选文件 ----
    const candidates = this.collectCandidates(anchorSet);
    const shown = candidates.slice(0, maxFiles);

    const detailCount = Math.min(shown.length, maxDetailFiles);
    lines.push(`候选位置（${candidates.length} 个，按「相关度 + 关系支持度」降序；前 ${detailCount} 个标出够到它的关系）：`);
    if (shown.length === 0) {
      lines.push('  （无：子图里没有带路径的节点）');
    }
    shown.slice(0, detailCount).forEach((c, i) => {
      const kind = c.isDir ? '目录' : '文件';
      const anchorMark = c.isAnchorSite ? '  ◉ 锚点所在' : '';
      lines.push(`  ${i + 1}. ${c.path}  [${kind}｜${c.elementCount} 个相关元素]${anchorMark}`);
      if (c.via) {
        const label = EDGE_LABEL[c.via.type] ?? c.via.type;
        // 多证据的候选另列其余关系（最多 2 条）：一条弱关系可能是噪声，几条独立关系
        // 指向同一位置则不是——这正是「同一份路径被越多独立关系支持越可能是正解」的依据。
        const rest = c.vias.slice(1, 3)
          .map((v) => `${EDGE_LABEL[v.type] ?? v.type} ${v.weight.toFixed(2)} ← ${v.from}`)
          .join(' ／ ');
        const more = c.evidenceCount > 1
          ? `　（证据 ${c.evidenceCount} 条${rest ? `，另有 ${rest}` : ''}）`
          : '';
        lines.push(`       ← ${label} ${c.via.weight.toFixed(2)} ← ${c.via.from}${more}`);
      } else if (!c.isAnchorSite) {
        lines.push('       ← 与锚点直接相连');
      }
    });

    // 其余位置只列路径：导航漏掉路径就等于没搜到，但给每条都配关系说明会浪费体积
    const rest = shown.slice(detailCount);
    if (rest.length > 0) {
      lines.push('');
      lines.push(`其余 ${rest.length} 个位置（仅路径，相关度在后者）：`);
      for (const c of rest) lines.push(`  ${c.path}`);
    }
    if (candidates.length > shown.length) {
      lines.push(`  ... 另有 ${candidates.length - shown.length} 个位置超出上限未列出`);
    }
    lines.push('');

    // ---- 其余相关能力 ----
    const otherCaps = this.subgraph.nodes
      .filter((n) => n.level === 'C' && !anchorSet.has(n.id))
      .sort((a, b) => (this.subgraph.scores.get(b.id) ?? 0) - (this.subgraph.scores.get(a.id) ?? 0))
      .slice(0, 8);
    if (otherCaps.length > 0) {
      lines.push(`同一子图里的其他能力（换关键词可继续查）：${otherCaps.map((c) => c.name).join(', ')}`);
      lines.push('');
    }

    if (showHint) {
      lines.push('用法：以上是导航而非内容——不含任何代码正文。按需读取上面的路径；');
      lines.push('      候选不足时换一组关键词再取一次，或用 `wpw graph search <词>` 直接检索节点。');
    }

    const text = lines.join('\n');
    return { text, estimatedTokens: estimateTokens(text), candidates };
  }

  /**
   * 汇总候选位置
   *
   * 一个文件里的多个元素（类、它的方法、常量）合成一条路径；目录节点单独成条。
   * 排序：锚点所在位置优先，其次按 rankScore（相关度与关系支持度的 noisy-OR）。
   *
   * 每个位置收集**全部**够到它的关系（vias），并据此算出两种分：
   *   score     位置自身有多相关（该位置内节点的最高子图得分）
   *   support   从已知相关的位置出发有多容易走到这里（最强的 `来源得分 × 边权重`）
   *
   * 只看 score 会漏掉一类候选：自身语义分不高、却与高相关文件同属一个能力的文件
   * （典型是横跨 controller / service / entity 的改动集里那个「不起眼」的实体类）。
   * 这类候选的可达性证据在边上而不在节点上，所以排序要把 support 算进来。两种分用
   * noisy-OR 融合：有其一即可抬升，两者都强时最高。
   *
   * 注意 support 与 vias 用同一个「来源更靠近锚点」的判定，因此界面上列出的关系
   * 就是排序的依据，不会出现「排前面但看不出为什么」的情况。
   */
  private collectCandidates(anchorSet: Set<string>): NavCandidate[] {
    const groups = new Map<string, NavCandidate>();

    for (const node of this.subgraph.nodes) {
      const loc = locationOf(node);
      if (!loc) continue;

      const key = loc.path;
      const score = this.subgraph.scores.get(node.id) ?? 0;
      const isAnchorSite = anchorSet.has(node.id);

      let g = groups.get(key);
      if (!g) {
        g = {
          path: loc.path, isDir: loc.isDir, score, support: 0, rankScore: score,
          isAnchorSite, elementCount: 0, via: null, vias: [], evidenceCount: 0,
          capability: null, packageId: null,
        };
        groups.set(key, g);
      }
      g.elementCount += 1;
      if (isAnchorSite) g.isAnchorSite = true;
      if (score > g.score) g.score = score;
    }

    // 补「如何够到」：在子图内找所有指向该位置、且来源更靠近锚点的边
    for (const [key, g] of groups) {
      const members = this.subgraph.nodes.filter((n) => locationOf(n)?.path === key);
      const memberIds = new Set(members.map((n) => n.id));
      const bestDist = Math.min(...members.map((n) => this.subgraph.distances.get(n.id) ?? Infinity));

      const seen = new Set<string>();
      const vias: NavVia[] = [];
      let capability: string | null = null;
      let capabilityWeight = -1;
      let support = 0;

      for (const e of this.subgraph.edges) {
        if (!memberIds.has(e.to)) continue;
        const fromNode = this.nodeMap.get(e.from);
        if (!fromNode) continue;

        // 业务映射来源另记：候选归属哪个能力，用于按能力聚合候选
        if (e.type === EDGE_TYPE_BUSINESS_MAP && fromNode.level === 'C' && e.weight > capabilityWeight) {
          capability = fromNode.name;
          capabilityWeight = e.weight;
        }

        if (g.isAnchorSite) continue; // 锚点所在位置不需要「如何够到」
        const fromDist = this.subgraph.distances.get(e.from) ?? Infinity;
        if (fromDist >= bestDist) continue; // 只取「更靠近锚点」的那一端作为来源

        // 共能力边的「来源」是那个共享能力，不是另一端文件：a、b 同属能力 X 与 b、c 同属
// 能力 X 是**同一条**证据，写成「← 某文件」会让 k 个文件的团显示成 k−1 条独立证据。
        const label = e.type === EDGE_TYPE_SIBLING
          ? `C:${e.capability ?? '?'}`
          : locationOf(fromNode)?.path ?? (fromNode.level === 'C' ? `${fromNode.level}:${fromNode.name}` : fromNode.name);
        const fromScore = this.subgraph.scores.get(e.from) ?? 0;
        if (fromScore * e.weight > support) support = fromScore * e.weight;

        const dedupKey = `${e.type}|${label}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
        // 每条独立关系取自己的权重上限（同一对节点间可能有多条同类型边）
        const prev = vias.find((v) => v.type === e.type && v.from === label);
        if (prev) {
          if (e.weight > prev.weight) prev.weight = e.weight;
        } else {
          vias.push({ type: e.type, weight: e.weight, from: label });
        }
      }

      vias.sort((a, b) => b.weight - a.weight);
      g.vias = vias;
      g.evidenceCount = vias.length;
      g.via = vias[0] ?? null;
      g.capability = capability;
      g.support = support;
      // 锚点所在位置 score 已是满分，融合后仍是满分，不用特判
      g.rankScore = 1 - (1 - g.score) * (1 - support);
    }

    return [...groups.values()].sort((a, b) => {
      if (a.isAnchorSite !== b.isAnchorSite) return a.isAnchorSite ? -1 : 1;
      // 文件优先于目录：这份清单回答的是「打开哪个文件」，目录项打开不了；而模块目录
      // 常常只是与关键词部分同名的噪声（如检索 "config layer" 命中 com/config）。
      if (a.isDir !== b.isDir) return a.isDir ? 1 : -1;
      if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
      if (b.score !== a.score) return b.score - a.score;
      return a.path.localeCompare(b.path);
    });
  }
}