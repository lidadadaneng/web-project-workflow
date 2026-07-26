/**
 * 节点生成器
 *
 * 负责节点 ID 生成、属性组装等。
 */
import { createHash } from 'crypto';
import type { GraphNode, NodeLevel, NodeType, NodeAttributes } from '../types';

/**
 * 生成节点 ID
 *
 * 格式：<前缀>:<sha256(内容哈希)前12位>
 *
 * 确定性 ID：相同输入 → 相同 ID，保证多人协作一致性。
 * 12 位十六进制 = 48 位，万级节点冲突概率可忽略。
 */
export function generateNodeId(prefix: string, parts: string[]): string {
  const hash = createHash('sha256')
    .update(parts.join('||'))
    .digest('hex')
    .slice(0, 12);
  return `${prefix}:${hash}`;
}

/**
 * 构建一个图谱节点
 */
export function buildNode(params: {
  id: string;
  level: NodeLevel;
  type: NodeType;
  name: string;
  attrs?: NodeAttributes;
  createdAt?: number;
  updatedAt?: number;
}): GraphNode {
  const now = Date.now();
  return {
    id: params.id,
    level: params.level,
    type: params.type,
    name: params.name,
    attrs: params.attrs ?? {},
    createdAt: params.createdAt ?? now,
    updatedAt: params.updatedAt ?? now,
  };
}

/** 层级前缀映射 */
export const LEVEL_PREFIX: Record<NodeLevel, string> = {
  L1: 'req',
  L2: 'mod',
  L3: 'file',
  L4: 'elem',
};
