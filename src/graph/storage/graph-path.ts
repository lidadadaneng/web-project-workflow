/**
 * 图谱目录路径解析
 *
 * 多图谱存储布局：
 *   wpw/knowledge/graph/<stack>/
 *     ├── graph.jsonl
 *     ├── meta.json
 *     └── index/
 *         ├── vector.index
 *         └── vector-mapping.json
 *
 * 默认图谱名为 "default"，保证向后兼容。
 */
import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_GRAPH_NAME } from '../types';

const GRAPH_BASE_DIR = path.join('wpw', 'knowledge', 'graph');

/**
 * 解析图谱目录路径
 *
 * @param root 工作根目录
 * @param stack 图谱名（缺省为 default）
 * @returns 图谱目录绝对路径
 */
export function resolveGraphDir(root: string, stack?: string): string {
  const graphName = stack && stack.length > 0 ? stack : DEFAULT_GRAPH_NAME;
  return path.join(root, GRAPH_BASE_DIR, graphName);
}

/**
 * 获取图谱基础目录（wpw/knowledge/graph/）
 */
export function getGraphBaseDir(root: string): string {
  return path.join(root, GRAPH_BASE_DIR);
}

/**
 * 校验图谱名格式：kebab-case、非空
 *
 * 规则：
 * - 非空
 * - 只允许小写字母、数字和连字符
 * - 必须以字母开头
 * - 不能以连字符开头或结尾
 * - 不能有连续连字符
 */
export function isValidGraphName(name: string): boolean {
  if (!name || name.length === 0) return false;
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}

/**
 * 判断是否为保留名（default 保留用于向后兼容）
 */
export function isReservedGraphName(name: string): boolean {
  return name === DEFAULT_GRAPH_NAME;
}

/**
 * 判断指定图谱是否存在（通过检查 meta.json 是否存在）
 */
export function graphExists(root: string, stack: string): boolean {
  const graphDir = resolveGraphDir(root, stack);
  return fs.existsSync(path.join(graphDir, 'meta.json'));
}

/**
 * 图谱命名格式错误提示
 */
export const GRAPH_NAME_RULES =
  '图谱名需为 kebab-case 格式：以小写字母开头，仅含小写字母、数字和连字符，不能以连字符开头/结尾，不能有连续连字符。';
