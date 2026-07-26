/**
 * 层级符号化序列化
 *
 * 将子图按 L1→L2→L3→L4 层级顺序，以缩进格式输出。
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

const LEGEND_TEXT = `符号说明:
  ${SYMBOL_CONTAIN}  包含关系 (contain)
  ${SYMBOL_DEPEND}  依赖关系 (call/import/inherit)
  ${SYMBOL_BIZ_MAP}  业务映射 (business_map)
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
    const byLevel: Record<string, GraphNode[]> = { L1: [], L2: [], L3: [], L4: [] };
    for (const node of this.subgraph.nodes) {
      if (byLevel[node.level]) byLevel[node.level].push(node);
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

    // 输出 L1 → L2 → L3 → L4 树状结构
    const depthMap = this.subgraph.distances;

    for (const l1Node of topLevelL1) {
      this.serializeTreeNode(l1Node, 0, lines, nodeMap, childrenMap, depthMap, level);
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
      this.serializeTreeNode(l2Node, 0, lines, nodeMap, childrenMap, depthMap, level);
    }

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

  // ==================== 树状输出 ====================

  private serializeTreeNode(
    node: GraphNode,
    depth: number,
    lines: string[],
    nodeMap: Map<string, GraphNode>,
    childrenMap: Map<string, string[]>,
    distanceMap: Map<string, number>,
    level: CompressionLevel,
  ): void {
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

    for (const child of childNodes) {
      this.serializeTreeNode(child, depth + 1, lines, nodeMap, childrenMap, distanceMap, level);
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
        `  ${fromNode.name} ${symbol} ${toNode.name}${weightStr}${edgeTypeLabel}`,
      );
    }
  }

  // ==================== 辅助函数 ====================

  private getEdgeSymbol(edgeType: string): string {
    switch (edgeType) {
      case EDGE_TYPE_BUSINESS_MAP:
        return SYMBOL_BIZ_MAP;
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
