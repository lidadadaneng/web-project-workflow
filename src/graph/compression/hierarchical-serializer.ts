/**
 * 层级符号化序列化
 *
 * 将子图按 C→L1→L2→L3 层级顺序，以缩进格式输出。
 * 使用标准化符号表达从属与依赖关系：
 *   ⊃  包含关系（contain）
 *   →  调用/导入/继承 等依赖关系（call/import/inherit）
 *   ⇄  业务映射关系（business_map）
 *
 * 支持三档压缩等级：
 *   loose    — 完整注释 + 完整签名 + 依赖展开
 *   standard — 标准签名 + 核心依赖
 *   extreme  — 仅名称 + 类型标签 + 关键依赖
 */
import type { Subgraph, GraphNode, GraphEdge, GraphCompressionConfig } from '../types';
import {
  EDGE_TYPE_CONTAIN,
  EDGE_TYPE_CALL,
  EDGE_TYPE_IMPORT,
  EDGE_TYPE_INHERIT,
  EDGE_TYPE_BUSINESS_MAP,
  EDGE_TYPE_SIBLING,
} from '../types';
import {
  extractSkeleton,
  formatSkeletonLine,
  distanceToSkeletonLevel,
  type SkeletonLevel,
} from './skeleton-extractor';

/** 压缩等级 */
export type CompressionLevel = 'loose' | 'standard' | 'extreme';

/** 序列化选项 */
export interface SerializeOptions {
  /** 压缩等级 */
  level?: CompressionLevel;
  /** 是否显示符号速查表 */
  showLegend?: boolean;
  /** 是否显示统计信息 */
  showStats?: boolean;
  /** 缩进字符 */
  indent?: string;
}

/** 序列化结果 */
export interface SerializeResult {
  /** 压缩后的文本 */
  text: string;
  /** 预估 Token 数 */
  estimatedTokens: number;
  /** 节点数 */
  nodeCount: number;
  /** 边数 */
  edgeCount: number;
}

// ==================== 符号常量 ====================

const SYMBOL_CONTAIN = '⊃';
const SYMBOL_DEPEND = '→';
const SYMBOL_BIZ_MAP = '⇄';
// 共能力边不是依赖（两个文件不一定互相调用），用一个表示「同组」的符号区分开，
// 否则会被当成 import/call 读成编译期依赖。
const SYMBOL_SIBLING = '∼';

const LEGEND_TEXT = `符号说明:
  ${SYMBOL_CONTAIN}  包含关系 (contain)
  ${SYMBOL_DEPEND}  依赖关系 (call/import/inherit)
  ${SYMBOL_BIZ_MAP}  业务映射 (business_map)
  ${SYMBOL_SIBLING}  同能力文件 (sibling)
`;

// ==================== 主类 ====================

export class HierarchicalSerializer {
  private subgraph: Subgraph;
  private level: CompressionLevel;
  private indent: string;

  constructor(subgraph: Subgraph, options: SerializeOptions = {}) {
    this.subgraph = subgraph;
    this.level = options.level ?? 'standard';
    this.indent = options.indent ?? '  ';
  }

  /**
   * 序列化子图为层级文本
   */
  serialize(options: SerializeOptions = {}): SerializeResult {
    const level = options.level ?? this.level;
    const showLegend = options.showLegend ?? this.shouldShowLegend(level);
    const showStats = options.showStats ?? true;

    const lines: string[] = [];

    // 头部：标题
    lines.push('=== 知识图谱上下文 ===');
    lines.push('');

    // 符号速查表
    if (showLegend) {
      lines.push(LEGEND_TEXT);
    }

    // 构建层级树
    const nodeMap = new Map<string, GraphNode>();
    for (const node of this.subgraph.nodes) {
      nodeMap.set(node.id, node);
    }

    // 按层级分组
    const byLevel: Record<string, GraphNode[]> = { C: [], L1: [], L2: [], L3: [] };
    for (const node of this.subgraph.nodes) {
      if (byLevel[node.level]) {
        byLevel[node.level].push(node);
      } else {
        // 兼容旧层级值（L4 → L3）
        if ((node.level as string) === 'L4') byLevel['L3'].push(node);
      }
    }

    // 按包含关系构建树
    const containEdges = this.subgraph.edges.filter((e) => e.type === EDGE_TYPE_CONTAIN);
    const childrenMap = new Map<string, string[]>(); // parentId -> childIds
    const parentMap = new Map<string, string>(); // childId -> parentId

    for (const edge of containEdges) {
      const children = childrenMap.get(edge.from) ?? [];
      children.push(edge.to);
      childrenMap.set(edge.from, children);
      parentMap.set(edge.to, edge.from);
    }

    // 找出各层顶级节点（没有父节点在子图内的）
    const topLevelL1 = byLevel.L1.filter((n) => !parentMap.has(n.id));

    // 输出 C 层能力节点（通过 business_map 关联结构层）
    const depthMap = this.subgraph.distances;

    if (byLevel.C.length > 0) {
      lines.push('--- 能力层 (C) ---');
      for (const capNode of byLevel.C) {
        this.serializeCapabilityNode(capNode, lines, nodeMap, depthMap, level);
      }
      lines.push('');
      lines.push('--- 结构层 (L1/L2/L3) ---');
    }

    // 输出 L1 → L2 → L3 树状结构（C 层已在上面逐条输出，先计入已输出集合）
    const printed = new Set<string>(byLevel.C.map((n) => n.id));
    for (const l1Node of topLevelL1) {
      this.serializeTreeNode(l1Node, 0, lines, nodeMap, childrenMap, depthMap, level, printed);
    }

    // 如果 L1 都挂在包含树下，补漏 L2 级顶级节点
    const topLevelL2 = byLevel.L2.filter(
      (n) => !parentMap.has(n.id) || !nodeMap.has(parentMap.get(n.id)!),
    );
    for (const l2Node of topLevelL2) {
      // 排除已经作为 L1 子节点输出的
      if (parentMap.has(l2Node.id) && byLevel.L1.some((n) => n.id === parentMap.get(l2Node.id))) {
        continue;
      }
      this.serializeTreeNode(l2Node, 0, lines, nodeMap, childrenMap, depthMap, level, printed);
    }

    // 补漏：树只走包含关系，父节点不在子图里的节点（元素所属文件被节点上限裁掉、
    // 或元素是靠调用/业务映射边单独够到的）会留在树外，整条信息就在上下文里消失。
    // 按所属文件归并成一段，带完整路径——定位任务要的正是路径。
    this.serializeOrphanNodes(lines, printed, depthMap, level);

    // 输出跨节点依赖（非 contain 边）
    lines.push('');
    lines.push('--- 依赖关系 ---');
    this.serializeDependencies(lines, nodeMap, level);

    lines.push('');

    // 统计
    const text = lines.join('\n');
    const tokenCount = estimateTokens(text);

    if (showStats) {
      lines.push('--- 统计 ---');
      lines.push(`节点数: ${this.subgraph.nodes.length}`);
      lines.push(`边数: ${this.subgraph.edges.length}`);
      lines.push(`预估 Token: ${tokenCount}`);
      lines.push(`压缩等级: ${level}`);
    }

    return {
      text: lines.join('\n'),
      estimatedTokens: tokenCount,
      nodeCount: this.subgraph.nodes.length,
      edgeCount: this.subgraph.edges.length,
    };
  }

  // ==================== C 层能力节点输出 ====================

  private serializeCapabilityNode(
    capNode: GraphNode,
    lines: string[],
    nodeMap: Map<string, GraphNode>,
    distanceMap: Map<string, number>,
    level: CompressionLevel,
  ): void {
    const dist = distanceMap.get(capNode.id) ?? 0;
    const skeletonLevel = this.getSkeletonLevel(dist, level);
    const skeleton = extractSkeleton(capNode, skeletonLevel);
    const line = formatSkeletonLine(skeleton);

    const isAnchor = this.subgraph.anchors.includes(capNode.id);
    const anchorMark = isAnchor ? ' ◉' : '';

    lines.push(`${SYMBOL_BIZ_MAP} ${line}${anchorMark}`);

    // 输出该能力节点的 business_map 关联（在子图内的目标）
    const bizEdges = this.subgraph.edges.filter(
      (e) => e.type === EDGE_TYPE_BUSINESS_MAP && e.from === capNode.id,
    );

    if (bizEdges.length > 0 && level !== 'extreme') {
      // 关联目标按所在文件归档后输出：能力层这一块要回答的是「这个能力落在哪些文件里」，
      // 而定位任务的答案格式就是文件路径。只列裸元素名（如 AuthorizationInterceptor）
      // 时，下游拿不到路径、只能按包名猜，反而比不过一次普通搜索。
      const grouped = this.groupTargetsByFile(bizEdges, nodeMap);
      const shown = grouped.slice(0, level === 'loose' ? 20 : 10);

      for (const g of shown) {
        const weightStr = level === 'loose' && g.weight !== undefined ? ` [${g.weight.toFixed(2)}]` : '';
        // 没有文件归属的目标（如指向模块的边）退回显示名称，不能凭空丢信息
        const label = g.path ?? g.names[0] ?? '(未知目标)';
        const namesStr = g.path && level === 'loose' && g.names.length ? ` (${g.names.slice(0, 6).join(', ')})` : '';
        lines.push(`  ${SYMBOL_BIZ_MAP} ${label}${weightStr}${namesStr}`);
      }
      if (grouped.length > shown.length) {
        lines.push(`  ... 还有 ${grouped.length - shown.length} 个关联文件`);
      }
    }

    // Features（仅 loose 且有 features）
    if (level === 'loose' && capNode.attrs.features && capNode.attrs.features.length > 0) {
      const features = capNode.attrs.features.slice(0, 5);
      for (const f of features) {
        lines.push(`  • ${f.id}: ${f.name}${f.priority ? ` [${f.priority}]` : ''}`);
      }
      if (capNode.attrs.features.length > 5) {
        lines.push(`  ... 共 ${capNode.attrs.features.length} 个功能`);
      }
    }
  }

  // ==================== 树状输出 ====================

  private serializeTreeNode(
    node: GraphNode,
    depth: number,
    lines: string[],
    nodeMap: Map<string, GraphNode>,
    childrenMap: Map<string, string[]>,
    distanceMap: Map<string, number>,
    level: CompressionLevel,
    printed: Set<string>,
  ): void {
    printed.add(node.id);
    const prefix = this.indent.repeat(depth);
    const dist = distanceMap.get(node.id) ?? 0;
    const skeletonLevel = this.getSkeletonLevel(dist, level);
    const skeleton = extractSkeleton(node, skeletonLevel);
    const line = formatSkeletonLine(skeleton);

    // 锚点标记
    const isAnchor = this.subgraph.anchors.includes(node.id);
    const anchorMark = isAnchor ? ' ◉' : '';

    lines.push(`${prefix}${SYMBOL_CONTAIN} ${line}${anchorMark}`);

    // JSDoc（仅 loose 模式且距离近）
    if (level === 'loose' && skeleton.jsDoc && dist <= 1) {
      const docLines = skeleton.jsDoc.split('\n').slice(0, 5); // 最多 5 行
      for (const dl of docLines) {
        lines.push(`${prefix}${this.indent}// ${dl.trim()}`);
      }
    }

    // 递归输出子节点
    const children = childrenMap.get(node.id) ?? [];
    // 按层级和名称排序
    const childNodes = children
      .map((id) => nodeMap.get(id))
      .filter((n): n is GraphNode => !!n)
      .sort((a, b) => {
        if (a.level !== b.level) return a.level.localeCompare(b.level);
        return a.name.localeCompare(b.name);
      });

    // 同名叶节点合并输出（重载函数、多个 getter 会被解析成同名节点）。
    // 它们重复占行却不增加信息，合并后既省预算也降噪；有子节点的同名节点不合并，
    // 避免把树结构压平。
    let i = 0;
    while (i < childNodes.length) {
      const child = childNodes[i];
      const isLeaf = !(childrenMap.get(child.id)?.length);
      let j = i + 1;
      if (isLeaf) {
        while (j < childNodes.length
          && childNodes[j].name === child.name
          && childNodes[j].level === child.level
          && !(childrenMap.get(childNodes[j].id)?.length)) {
          j += 1;
        }
      }
      if (j - i > 1) {
        const skeleton = extractSkeleton(child, this.getSkeletonLevel(distanceMap.get(child.id) ?? 0, level));
        lines.push(`${prefix}${this.indent}${SYMBOL_CONTAIN} ${formatSkeletonLine(skeleton)} ×${j - i}`);
        for (let k = i; k < j; k++) printed.add(childNodes[k].id);
      } else {
        this.serializeTreeNode(child, depth + 1, lines, nodeMap, childrenMap, distanceMap, level, printed);
      }
      i = j;
    }
  }

  // ==================== 树外节点补漏 ====================

  /**
   * 输出没有进入树状结构的节点
   *
   * 这些节点确实在子图里（够得着），但包含链的父节点不在子图中，树遍历走不到它们。
   * 按所属文件归并成一行路径 + 若干元素名，既不丢信息也不重复占行。
   */
  private serializeOrphanNodes(
    lines: string[],
    printed: Set<string>,
    distanceMap: Map<string, number>,
    level: CompressionLevel,
  ): void {
    const orphans = this.subgraph.nodes.filter((n) => !printed.has(n.id));
    if (orphans.length === 0) return;

    const anchorSet = new Set(this.subgraph.anchors);
    const groups = new Map<string, GraphNode[]>();
    for (const node of orphans) {
      const key = node.attrs.filePath || node.attrs.dir || `#${node.id}`;
      const g = groups.get(key);
      if (g) g.push(node);
      else groups.set(key, [node]);
    }

    lines.push('');
    lines.push('--- 其他可达节点（按所属文件） ---');

    const MAX_PER_GROUP = level === 'loose' ? 12 : 6;
    for (const [key, nodesInGroup] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const label = key.startsWith('#') ? nodesInGroup[0].name : key;
      const mark = nodesInGroup.some((n) => anchorSet.has(n.id)) ? ' ◉' : '';
      lines.push(`${SYMBOL_CONTAIN} [文件] ${label}${mark}`);

      const shown = [...nodesInGroup].sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_PER_GROUP);
      for (const node of shown) {
        const skeleton = extractSkeleton(node, this.getSkeletonLevel(distanceMap.get(node.id) ?? 0, level));
        lines.push(`${this.indent}${SYMBOL_CONTAIN} ${formatSkeletonLine(skeleton)}`);
      }
      if (nodesInGroup.length > shown.length) {
        lines.push(`${this.indent}... 还有 ${nodesInGroup.length - shown.length} 个`);
      }
    }
  }

  // ==================== 依赖输出 ====================

  private serializeDependencies(
    lines: string[],
    nodeMap: Map<string, GraphNode>,
    level: CompressionLevel,
  ): void {
    // 收集非 contain 边
    const depEdges = this.subgraph.edges.filter((e) => e.type !== EDGE_TYPE_CONTAIN);

    if (depEdges.length === 0) {
      lines.push('（无跨模块依赖）');
      return;
    }

    // 重名的文件（不同模块下的 list.vue、多个同名类）必须带上目录，否则这一行
    // 指不出到底是哪一个；不重名的仍只写名称，避免整段变成路径的堆叠。
    const nameCount = new Map<string, number>();
    for (const node of this.subgraph.nodes) {
      nameCount.set(node.name, (nameCount.get(node.name) ?? 0) + 1);
    }
    const labelOf = (node: GraphNode): string => {
      if ((nameCount.get(node.name) ?? 0) > 1) {
        const p = node.attrs.filePath || node.attrs.dir;
        if (p) return p;
      }
      return node.name;
    };

    // 根据压缩等级限制输出数量
    let edgesToShow = depEdges;
    if (level === 'extreme') {
      // 极致模式：只输出 business_map 和高权重边
      edgesToShow = depEdges
        .filter((e) => e.type === EDGE_TYPE_BUSINESS_MAP || e.weight >= 0.8)
        .slice(0, 20);
    } else if (level === 'standard') {
      // 标准模式：按权重排序，取前 50 条
      edgesToShow = [...depEdges].sort((a, b) => b.weight - a.weight).slice(0, 50);
    } else {
      // loose：全部输出，按权重排序
      edgesToShow = [...depEdges].sort((a, b) => b.weight - a.weight);
    }

    for (const edge of edgesToShow) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) continue;

      const symbol = this.getEdgeSymbol(edge.type);
      const weightStr = level === 'loose' ? ` [${edge.weight.toFixed(2)}]` : '';
      const edgeTypeLabel = level === 'loose' ? ` ${this.getEdgeTypeLabel(edge.type)}` : '';

      lines.push(
        `  ${labelOf(fromNode)} ${symbol} ${labelOf(toNode)}${weightStr}${edgeTypeLabel}`,
      );
    }
  }

  // ==================== 辅助函数 ====================

  /**
   * 把能力节点的 business_map 目标按所在文件归并
   *
   * 同一文件里的多个元素（一个类加它的若干方法）合成一条，既省 Token 又去掉
   * 「R.error 出现三次」这类重复。没有文件归属的目标按模块目录或名称单独成条。
   */
  private groupTargetsByFile(
    bizEdges: GraphEdge[],
    nodeMap: Map<string, GraphNode>,
  ): Array<{ path?: string; names: string[]; weight?: number }> {
    const groups = new Map<string, { path?: string; names: string[]; weight?: number }>();

    for (const edge of bizEdges) {
      const target = nodeMap.get(edge.to);
      if (!target) continue;
      const path = target.attrs.filePath || target.attrs.dir || undefined;
      const key = path ?? `#${target.id}`;
      const g = groups.get(key) ?? { path, names: [], weight: edge.weight };
      if (!g.names.includes(target.name)) g.names.push(target.name);
      if (edge.weight !== undefined && (g.weight === undefined || edge.weight > g.weight)) {
        g.weight = edge.weight;
      }
      groups.set(key, g);
    }

    return [...groups.values()]
      .map((g) => ({ ...g, names: g.names.sort() }))
      .sort((a, b) => (a.path ?? '').localeCompare(b.path ?? ''));
  }

  private getEdgeSymbol(edgeType: string): string {
    switch (edgeType) {
      case EDGE_TYPE_BUSINESS_MAP:
        return SYMBOL_BIZ_MAP;
      case EDGE_TYPE_SIBLING:
        return SYMBOL_SIBLING;
      case EDGE_TYPE_CALL:
      case EDGE_TYPE_IMPORT:
      case EDGE_TYPE_INHERIT:
      default:
        return SYMBOL_DEPEND;
    }
  }

  private getEdgeTypeLabel(edgeType: string): string {
    const map: Record<string, string> = {
      call: '调用',
      import: '导入',
      inherit: '继承',
      business_map: '业务映射',
      sibling: '共能力',
    };
    return map[edgeType] ?? edgeType;
  }

  private getSkeletonLevel(distance: number, compressionLevel: CompressionLevel): SkeletonLevel {
    // 基础距离对应等级
    const baseLevel = distanceToSkeletonLevel(distance);

    // 压缩等级调整
    if (compressionLevel === 'loose') {
      // loose 提高一级详细度
      if (baseLevel === 'minimal') return 'standard';
      if (baseLevel === 'standard') return 'full';
      return 'full';
    } else if (compressionLevel === 'extreme') {
      // extreme 降低一级详细度，且锚点也只给 standard
      if (distance === 0) return 'standard';
      return 'minimal';
    }

    return baseLevel;
  }

  private shouldShowLegend(level: CompressionLevel): boolean {
    return level !== 'extreme';
  }
}

// ==================== Token 估算 ====================

/**
 * 估算文本的 Token 数
 *
 * 采用经验公式：
 *   - 中文字符：约 1.5 字 / token
 *   - 英文单词：约 0.75 词 / token
 *   - 标点符号和空格：单独计数
 *
 * 这是一个粗略估算，用于 Token 预算控制的迭代调整。
 * 精确值需要实际 tokenizer，但对于预算控制足够。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let chineseChars = 0;
  let englishWords = 0;
  let otherChars = 0;

  // 统计中文字符
  const chineseRegex = /[一-龥]/g;
  const chineseMatches = text.match(chineseRegex);
  if (chineseMatches) chineseChars = chineseMatches.length;

  // 统计英文单词（连续字母序列）
  const englishRegex = /[a-zA-Z]+/g;
  const englishMatches = text.match(englishRegex);
  if (englishMatches) englishWords = englishMatches.length;

  // 其他字符（数字、标点、空格等）
  const remaining = text.length - chineseChars - (englishMatches ? englishMatches.join('').length : 0);
  otherChars = Math.max(0, remaining);

  // 估算：中文 1.5 字/token，英文 0.75 词/token，其他 4 字符/token
  const tokens =
    chineseChars / 1.5 + englishWords * 0.75 + otherChars / 4;

  return Math.ceil(tokens);
}

/**
 * 从 GraphCompressionConfig 获取压缩等级
 */
export function getCompressionLevel(
  config: GraphCompressionConfig,
): CompressionLevel {
  return config.level;
}
