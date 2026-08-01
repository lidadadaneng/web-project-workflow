/**
 * 需求文档解析器
 *
 * 从 wpw/ 目录和 .wpw.yaml 状态文件生成 L1 需求节点。
 * 对接现有 ChangeState 类型，提取需求名称、状态等基础属性。
 * 从 BRD/PRD 等文档中提取纯文本用于向量化。
 * 从 PRD"依赖模块"、Design"模块划分/接口设计"中提取模块名和接口名。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  loadState,
  loadArchivedState,
  getActiveDir,
  getArchivedDir,
  listChanges,
  listArchivedChanges,
  findArchivedChangeDir,
} from '../../lib/state';
import type {
  GraphNode,
  NodeAttributes,
  RequirementStatus,
  RequirementFeature,
} from '../types';
import { NODE_TYPE_REQUIREMENT } from '../types';
import { generateNodeId } from '../builders/node-builder';

/** 解析出的需求信息 */
export interface ParsedRequirement {
  /** 需求节点 */
  node: GraphNode;
  /** 需求目录路径（绝对路径） */
  dirPath: string;
  /** 用于向量化的文本（BRD + PRD 纯文本） */
  vectorText: string;
  /** 从文档中提取的模块名列表 */
  extractedModules: string[];
  /** 从文档中提取的接口名列表 */
  extractedInterfaces: string[];
}

/**
 * 解析项目中所有需求
 *
 * @param root 项目根目录
 * @returns 解析出的需求列表
 */
export function parseAllRequirements(root: string): ParsedRequirement[] {
  const result: ParsedRequirement[] = [];

  // 解析 active 需求
  const activeNames = listChanges(root);
  for (const name of activeNames) {
    const parsed = parseRequirement(root, name, false);
    if (parsed) result.push(parsed);
  }

  // 解析 archived 需求（遍历所有月份子目录）
  const archivedNames = listArchivedChanges(root);
  for (const name of archivedNames) {
    const parsed = parseRequirement(root, name, true);
    if (parsed) result.push(parsed);
  }

  return result;
}

/**
 * 解析单个需求
 */
export function parseRequirement(
  root: string,
  name: string,
  archived: boolean,
): ParsedRequirement | null {
  // 根据是否归档，从不同目录读取状态
  const state = archived ? loadArchivedState(root, name) : loadState(root, name);
  if (!state) return null;

  // 计算需求目录路径
  let dirPath: string;
  if (archived) {
    const found = findArchivedChangeDir(root, name);
    if (!found) return null;
    dirPath = found;
  } else {
    dirPath = path.join(getActiveDir(root), name);
  }

  // 需求状态
  const reqStatus: RequirementStatus = {
    archived,
    artifacts: state.status as Record<string, string>,
    schema: state.schema,
  };

  const attrs: NodeAttributes = {
    status: reqStatus,
    docPath: path.relative(root, dirPath),
    projectType: state.config?.projectType,
    description: state.name,
  };

  // 生成需求节点
  // ID 仅基于 name 生成，保证归档后 ID 稳定，关联边不丢失
  // （需求名全局唯一，创建时已做重名检查）
  const node: GraphNode = {
    id: generateNodeId('req', [name]),
    level: 'L1',
    type: NODE_TYPE_REQUIREMENT,
    name,
    attrs,
    createdAt: new Date(state.createdAt).getTime() || Date.now(),
    updatedAt: Date.now(),
  };

  // 提取文档文本和信息
  const { vectorText, extractedModules, extractedInterfaces, features } =
    extractDocContent(dirPath);

  // 将功能条目存入节点属性
  if (features.length > 0) {
    attrs.features = features;
  }

  return {
    node,
    dirPath,
    vectorText,
    extractedModules,
    extractedInterfaces,
  };
}

// ==================== 文档内容提取 ====================

/** 从需求文档中提取向量化文本和结构化信息 */
function extractDocContent(dirPath: string): {
  vectorText: string;
  extractedModules: string[];
  extractedInterfaces: string[];
  features: RequirementFeature[];
} {
  const files = safeReadDir(dirPath);
  let brdText = '';
  let prdText = '';
  let designText = '';

  for (const file of files) {
    const lower = file.toLowerCase();
    const fullPath = path.join(dirPath, file);

    if (lower.startsWith('brd')) {
      brdText = safeReadText(fullPath);
    } else if (lower.startsWith('prd')) {
      prdText = safeReadText(fullPath);
    } else if (lower.startsWith('design')) {
      designText = safeReadText(fullPath);
    }
  }

  // 提取功能条目（从 PRD 的功能清单 + 详细功能说明）
  const features = extractFeaturesFromPRD(prdText);

  // 向量化文本：BRD + PRD + 功能条目（剔除 Markdown 格式标记）
  const baseVectorText = `${stripMarkdown(brdText)}\n${stripMarkdown(prdText)}`.trim();
  const featuresText = features
    .map((f) => `${f.id} ${f.name}${f.description ? '：' + f.description : ''}`)
    .join('\n');
  const vectorText = features.length > 0
    ? `${baseVectorText}\n${featuresText}`.trim()
    : baseVectorText;

  // 提取模块名
  const extractedModules = extractModulesFromDocs(prdText, designText);

  // 提取接口名
  const extractedInterfaces = extractInterfacesFromDocs(designText);

  return { vectorText, extractedModules, extractedInterfaces, features };
}

// ==================== 功能条目提取 ====================

/**
 * 从 PRD 文档中提取结构化功能条目
 *
 * 解析两个部分：
 *   1. 「功能清单」表格 — 提取编号、功能名、优先级、描述
 *   2. 「详细功能说明」章节 — 提取每个功能的详细描述，补充到对应条目中
 */
function extractFeaturesFromPRD(prdText: string): RequirementFeature[] {
  if (!prdText) return [];

  // 1. 从功能清单表格提取
  const features = extractFeatureListTable(prdText);

  // 2. 从详细功能说明补充描述
  if (features.length > 0) {
    enrichFeaturesWithDetails(prdText, features);
  }

  return features;
}

/**
 * 从「功能清单」Markdown 表格中提取功能条目
 *
 * 支持的表格格式（表头列顺序不敏感）：
 *   | 编号 | 功能 | 优先级 | 描述 |
 *   |------|------|--------|------|
 *   | F1   | xxx  | P0     | ...  |
 */
function extractFeatureListTable(prdText: string): RequirementFeature[] {
  const features: RequirementFeature[] = [];

  // 找到「功能清单」章节
  const sectionMatch = prdText.match(
    /##\s*功能清单[\s\S]*?(?=\n## |\n### |$)/i,
  );
  if (!sectionMatch) return features;

  const section = sectionMatch[0];

  // 找到表格（通过表格分隔行识别）
  const tableMatch = section.match(
    /\|.*\|\n\|[-:| ]+\|\n([\s\S]*?)(?=\n\n|\n[^|]|$)/,
  );
  if (!tableMatch) return features;

  const tableBody = tableMatch[1];
  const headerMatch = section.match(/\|.*\|\n/);
  if (!headerMatch) return features;

  // 解析表头，确定各列位置
  const headers = parseTableRow(headerMatch[0]).map((h) => h.trim().toLowerCase());
  const idIdx = findColumnIndex(headers, ['编号', 'id', 'no', '序号']);
  const nameIdx = findColumnIndex(headers, ['功能', '名称', '功能名', 'name']);
  const priorityIdx = findColumnIndex(headers, ['优先级', 'priority', '级别']);
  const descIdx = findColumnIndex(headers, ['描述', '说明', '简介', 'description', 'desc']);

  if (idIdx === -1 || nameIdx === -1) {
    // 至少要有编号和功能名列
    return features;
  }

  // 解析表格行
  const lines = tableBody.split('\n').filter((l) => l.trim().startsWith('|'));
  for (const line of lines) {
    const cells = parseTableRow(line);
    if (cells.length <= Math.max(idIdx, nameIdx)) continue;

    const id = cells[idIdx]?.trim();
    const name = cells[nameIdx]?.trim();
    if (!id || !name) continue;

    const feature: RequirementFeature = { id, name };

    if (priorityIdx !== -1 && cells[priorityIdx]) {
      feature.priority = cells[priorityIdx].trim();
    }
    if (descIdx !== -1 && cells[descIdx]) {
      feature.description = cells[descIdx].trim();
    }

    features.push(feature);
  }

  return features;
}

/**
 * 从「详细功能说明」章节提取详细描述，补充到已有功能条目
 *
 * 匹配格式：
 *   ### F1: <功能名>
 *   - 输入：...
 *   - 处理：...
 *   - 输出：...
 *   - 验收标准：
 *     - [ ] ...
 */
function enrichFeaturesWithDetails(prdText: string, features: RequirementFeature[]): void {
  // 找到「详细功能说明」章节
  const sectionMatch = prdText.match(
    /##\s*详细功能说明[\s\S]*?(?=\n## |$)/i,
  );
  if (!sectionMatch) return;

  const section = sectionMatch[0];

  // 匹配每个功能的子章节：### F1: 功能名
  const detailRegex = /###\s+(\w+)\s*[:：]\s*(.+)/g;
  let match: RegExpExecArray | null;

  while ((match = detailRegex.exec(section)) !== null) {
    const featureId = match[1].trim(); // F1
    const featureTitle = match[2].trim();

    // 找到对应功能条目
    const feature = features.find(
      (f) => f.id.toLowerCase() === featureId.toLowerCase() || f.name === featureTitle,
    );
    if (!feature) continue;

    // 提取该子章节的内容（从当前位置到下一个 ### 或 ##）
    const startIdx = match.index + match[0].length;
    const restSection = section.slice(startIdx);
    const endMatch = restSection.match(/\n### |\n## /);
    const endIdx = endMatch ? endMatch.index : restSection.length;
    const detailContent = restSection.slice(0, endIdx).trim();

    // 如果没有已有描述，就用详细内容填充
    // 如果已有描述，把详细内容追加在后面
    const cleanDetail = stripMarkdown(detailContent).trim();
    if (cleanDetail) {
      feature.description = feature.description
        ? `${feature.description}\n${cleanDetail}`
        : cleanDetail;
    }
  }
}

/** 解析 Markdown 表格行，返回单元格数组 */
function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** 在表头列表中找到匹配的列索引 */
function findColumnIndex(headers: string[], keywords: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase();
    if (keywords.some((kw) => h.includes(kw.toLowerCase()))) {
      return i;
    }
  }
  return -1;
}

/** 从 PRD 和 Design 文档中提取模块名 */
function extractModulesFromDocs(prdText: string, designText: string): string[] {
  const modules = new Set<string>();

  // PRD: "依赖模块：" 或 "依赖模块\n- xxx"
  const prdMatch = prdText.match(/依赖模块[：:][\s\S]*?(?=\n##|\n$)/);
  if (prdMatch) {
    const lines = prdMatch[0].split('\n');
    for (const line of lines) {
      const clean = line.replace(/^[-*\d.、\s]+/, '').trim();
      if (clean && !clean.startsWith('依赖模块') && clean.length < 50) {
        modules.add(clean);
      }
    }
  }

  // Design: "模块划分"表格
  const designMatch = designText.match(/模块划分[^\n]*\n[\s\S]*?(?=\n##|\n$)/i);
  if (designMatch) {
    const lines = designMatch[0].split('\n');
    for (const line of lines) {
      // 表格行：| 模块 | ... |
      const cells = line.split('|').map((c) => c.trim());
      if (cells.length >= 2 && cells[1] && !cells[1].match(/^[-—]+$/)) {
        const name = cells[1];
        if (name !== '模块' && name && name.length < 30) {
          modules.add(name);
        }
      }
    }
  }

  return Array.from(modules);
}

/** 从 Design 文档中提取接口名 */
function extractInterfacesFromDocs(designText: string): string[] {
  const interfaces = new Set<string>();

  // Design: "接口设计"章节下的 ### <接口名>
  const sectionMatch = designText.match(
    /##\s*接口设计[\s\S]*?(?=\n## |\n### |$)/i,
  );
  if (sectionMatch) {
    const section = sectionMatch[0];
    const headingMatches = section.matchAll(/###\s+(.+)/g);
    for (const m of headingMatches) {
      const name = m[1].trim();
      if (name && name.length < 50) {
        interfaces.add(name);
      }
    }
  }

  return Array.from(interfaces);
}

/** 去除 Markdown 格式标记，保留纯文本 */
function stripMarkdown(text: string): string {
  return (
    text
      // 去除代码块
      .replace(/```[\s\S]*?```/g, ' ')
      // 去除标题标记
      .replace(/^#{1,6}\s+/gm, '')
      // 去除粗体斜体
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/__(.+?)__/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      // 去除行内代码
      .replace(/`([^`]+)`/g, '$1')
      // 去除链接
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // 去除列表标记
      .replace(/^[-*]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      // 去除表格分隔行
      .replace(/^\|[-:| ]+\|$/gm, '')
      // 去除表格竖线（保留内容）
      .replace(/^\|/gm, '')
      .replace(/\|$/gm, '')
      .replace(/\|/g, ' ')
      // 去除 HTML 注释
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // 去除引用标记
      .replace(/^>\s*/gm, '')
      // 合并空白
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ +/g, ' ')
      .trim()
  );
}

// ==================== 工具函数 ====================

function safeReadDir(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function safeReadText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

