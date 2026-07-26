/**
 * 语法骨架抽取
 *
 * 对代码类节点（函数/类/接口/文件）抽取语法骨架：
 *   - 保留：名称、签名、入参出参类型、核心注解、继承关系
 *   - 剔除：函数实现体、内部变量、循环、条件分支、日志、冗余注释
 *
 * 注意：我们的节点本身已经是 AST 解析后的结构化数据，
 * 所以骨架抽取本质是按粒度选择输出哪些字段，而不是再次解析源码。
 */
import type { GraphNode } from '../types';

/** 骨架抽取等级 */
export type SkeletonLevel =
  /** 完整：名称 + 签名 + JSDoc + 注解 + 父类 */
  | 'full'
  /** 标准：名称 + 签名 + 类型 */
  | 'standard'
  /** 精简：仅名称 + 类型 */
  | 'minimal';

/** 骨架抽取结果 */
export interface SkeletonResult {
  /** 节点类型标签（如 [函数]、[类]） */
  typeLabel: string;
  /** 节点名称 */
  name: string;
  /** 签名（函数签名、类签名等） */
  signature?: string;
  /** 参数列表 */
  params?: Array<{ name: string; type?: string }>;
  /** 返回值类型 */
  returnType?: string;
  /** JSDoc 核心摘要 */
  jsDoc?: string;
  /** 注解/装饰器 */
  annotations?: string[];
  /** 所属父类/接口名 */
  parentName?: string;
  /** 是否导出 */
  isExported?: boolean;
}

/**
 * 抽取节点的语法骨架
 *
 * @param node 图谱节点
 * @param level 抽取等级
 */
export function extractSkeleton(node: GraphNode, level: SkeletonLevel = 'standard'): SkeletonResult {
  const typeLabel = getTypeLabel(node.type);
  const result: SkeletonResult = {
    typeLabel,
    name: node.name,
  };

  switch (level) {
    case 'full':
      return extractFull(node, result);
    case 'standard':
      return extractStandard(node, result);
    case 'minimal':
    default:
      return result; // 仅名称 + 类型标签
  }
}

// ==================== 各等级抽取 ====================

function extractFull(node: GraphNode, base: SkeletonResult): SkeletonResult {
  const result = { ...base };
  const attrs = node.attrs;

  if (attrs.signature) result.signature = attrs.signature;
  if (attrs.params?.length) result.params = attrs.params;
  if (attrs.returnType) result.returnType = attrs.returnType;
  if (attrs.jsDoc) result.jsDoc = attrs.jsDoc;
  if (attrs.annotations?.length) result.annotations = attrs.annotations;
  if (attrs.parentName) result.parentName = attrs.parentName;
  if (attrs.isExported !== undefined) result.isExported = attrs.isExported;

  return result;
}

function extractStandard(node: GraphNode, base: SkeletonResult): SkeletonResult {
  const result = { ...base };
  const attrs = node.attrs;

  if (attrs.signature) result.signature = attrs.signature;
  if (attrs.params?.length) result.params = attrs.params;
  if (attrs.returnType) result.returnType = attrs.returnType;
  if (attrs.parentName) result.parentName = attrs.parentName;

  return result;
}

// ==================== 辅助函数 ====================

function getTypeLabel(nodeType: string): string {
  const map: Record<string, string> = {
    requirement: '需求',
    module: '模块',
    file: '文件',
    function: '函数',
    class: '类',
    interface: '接口',
    constant: '常量',
    component: '组件',
  };
  return map[nodeType] ?? nodeType;
}

/**
 * 将骨架结果格式化为单行文本（用于层级序列化）
 */
export function formatSkeletonLine(skeleton: SkeletonResult): string {
  const parts: string[] = [];

  parts.push(`[${skeleton.typeLabel}]`);

  if (skeleton.isExported) parts.push('export');

  parts.push(skeleton.name);

  if (skeleton.signature) {
    // 用签名代替名称后的详情
    parts.pop(); // 移除 name
    parts.push(skeleton.signature);
  } else if (skeleton.params?.length) {
    const paramStr = skeleton.params
      .map((p) => (p.type ? `${p.name}: ${p.type}` : p.name))
      .join(', ');
    parts.push(`(${paramStr})`);
    if (skeleton.returnType) {
      parts.push(`: ${skeleton.returnType}`);
    }
  } else if (skeleton.returnType) {
    parts.push(`: ${skeleton.returnType}`);
  }

  if (skeleton.parentName) {
    parts.push(`extends ${skeleton.parentName}`);
  }

  if (skeleton.annotations?.length) {
    parts.push(`@(${skeleton.annotations.join(', ')})`);
  }

  return parts.join(' ');
}

/**
 * 根据节点到锚点的距离决定骨架抽取等级
 *
 *   距离 0（锚点）→ full
 *   距离 1 → standard
 *   距离 ≥2 → minimal
 */
export function distanceToSkeletonLevel(distance: number): SkeletonLevel {
  if (distance <= 0) return 'full';
  if (distance === 1) return 'standard';
  return 'minimal';
}
