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
import { loadState, getActiveDir, getArchivedDir, listChanges } from '../../lib/state';
import type {
  GraphNode,
  NodeAttributes,
  RequirementStatus,
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

  // 解析 archived 需求
  const archivedDir = getArchivedDir(root);
  if (fs.existsSync(archivedDir)) {
    const archivedNames = fs
      .readdirSync(archivedDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const name of archivedNames) {
      const parsed = parseRequirement(root, name, true);
      if (parsed) result.push(parsed);
    }
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
  const state = loadState(root, name);
  if (!state) return null;

  const dirPath = archived
    ? path.join(getArchivedDir(root), name)
    : path.join(getActiveDir(root), name);

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
  const node: GraphNode = {
    id: generateNodeId('req', [dirPath, name]),
    level: 'L1',
    type: NODE_TYPE_REQUIREMENT,
    name,
    attrs,
    createdAt: new Date(state.createdAt).getTime() || Date.now(),
    updatedAt: Date.now(),
  };

  // 提取文档文本和信息
  const { vectorText, extractedModules, extractedInterfaces } =
    extractDocContent(dirPath);

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

  // 向量化文本：BRD + PRD（剔除 Markdown 格式标记）
  const vectorText = `${stripMarkdown(brdText)}\n${stripMarkdown(prdText)}`.trim();

  // 提取模块名
  const extractedModules = extractModulesFromDocs(prdText, designText);

  // 提取接口名
  const extractedInterfaces = extractInterfacesFromDocs(designText);

  return { vectorText, extractedModules, extractedInterfaces };
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

