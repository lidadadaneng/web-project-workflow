/**
 * 能力节点解析器
 *
 * 从 wpw/specs/ 目录解析 OpenSpec 格式的能力规范，生成 C 层能力节点。
 *
 * 每个子目录包含 spec.md → 一个 C 层节点。
 * 提取内容：
 *   - Purpose 章节 → description
 *   - Requirements/Scenarios → features（结构化功能条目）
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GraphNode, RequirementFeature, NodeAttributes } from '../types';
import { NODE_TYPE_CAPABILITY } from '../types';
import { buildNode, generateNodeId } from '../builders/node-builder';

/** 解析出的能力信息 */
export interface ParsedCapability {
  /** 能力节点 */
  node: GraphNode;
  /** spec 文件目录路径（绝对路径） */
  dirPath: string;
  /** 用于向量化的文本（Purpose + Requirements 纯文本） */
  vectorText: string;
}

/**
 * 解析 wpw/specs/ 下所有能力规范
 *
 * @param root 项目根目录
 * @returns 解析出的能力列表
 */
export function parseAllCapabilities(root: string): ParsedCapability[] {
  const specsDir = path.join(root, 'wpw', 'specs');
  const result: ParsedCapability[] = [];

  // specs 目录不存在或为空 → 返回空列表（不报错，C 层 0 节点）
  if (!fs.existsSync(specsDir)) return result;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(specsDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const specPath = path.join(specsDir, entry.name, 'spec.md');
    if (!fs.existsSync(specPath)) continue;

    const parsed = parseCapability(specsDir, entry.name, specPath);
    if (parsed) result.push(parsed);
  }

  return result;
}

/**
 * 解析单个能力 spec
 */
function parseCapability(
  specsDir: string,
  name: string,
  specPath: string,
): ParsedCapability | null {
  let specText = '';
  try {
    specText = fs.readFileSync(specPath, 'utf8');
  } catch {
    return null;
  }

  if (!specText.trim()) return null;

  const dirPath = path.join(specsDir, name);

  // 提取 Purpose 作为 description
  const description = extractPurpose(specText) || name;

  // 提取 Requirements/Scenarios 作为 features
  const features = extractFeaturesFromSpec(specText);

  // 组装节点属性
  const attrs: NodeAttributes = {
    description,
  };
  if (features.length > 0) {
    attrs.features = features;
  }

  // 生成节点
  // ID 基于能力名生成（确定性）
  const node = buildNode({
    id: generateNodeId('cap', [name]),
    level: 'C',
    type: NODE_TYPE_CAPABILITY,
    name,
    attrs,
  });

  // 向量化文本：Purpose + Requirements 纯文本
  const vectorText = buildVectorText(specText, features);

  return {
    node,
    dirPath,
    vectorText,
  };
}

// ==================== Purpose 提取 ====================

/**
 * 从 spec 中提取 Purpose 章节内容
 */
function extractPurpose(specText: string): string {
  const match = specText.match(/##\s*Purpose\s*\n([\s\S]*?)(?=\n## |\n$|$)/i);
  if (!match) return '';

  const content = match[1].trim();
  // 限制长度，取第一段
  const firstPara = content.split('\n\n')[0]?.trim() || content;
  return firstPara.slice(0, 200);
}

// ==================== Features 提取 ====================

/**
 * 从 spec 中提取 Requirements + Scenarios 为结构化 features
 *
 * 支持的章节：
 *   - ## ADDED Requirements
 *   - ## MODIFIED Requirements
 *   - ## Requirements
 */
function extractFeaturesFromSpec(specText: string): RequirementFeature[] {
  const features: RequirementFeature[] = [];

  // 找到所有 Requirements 章节
  const reqSectionRegex = /##\s*(?:ADDED\s+|MODIFIED\s+|RENAMED\s+)?Requirements[\s\S]*?(?=\n## |\n$|$)/gi;
  let sectionMatch: RegExpExecArray | null;

  while ((sectionMatch = reqSectionRegex.exec(specText)) !== null) {
    const section = sectionMatch[0];

    // 提取每个 Requirement
    const reqRegex = /###\s+Requirement:\s*(.+)/g;
    let reqMatch: RegExpExecArray | null;
    let reqIndex = 0;

    while ((reqMatch = reqRegex.exec(section)) !== null) {
      const reqName = reqMatch[1].trim();
      reqIndex++;

      // 提取该 Requirement 下的所有 Scenarios
      const reqStart = reqMatch.index + reqMatch[0].length;
      const restSection = section.slice(reqStart);
      const nextReqMatch = restSection.match(/\n###\s+Requirement:/);
      const reqEnd = nextReqMatch ? nextReqMatch.index : restSection.length;
      const reqContent = restSection.slice(0, reqEnd);

      // 提取描述（Requirement 标题后到第一个 Scenario 之间的文本）
      const descMatch = reqContent.match(/^([\s\S]*?)(?=\n####\s+Scenario:)/);
      const description = descMatch ? descMatch[1].trim() : '';

      // 提取 Scenarios 数量作为优先级暗示
      const scenarioCount = (reqContent.match(/####\s+Scenario:/g) || []).length;

      features.push({
        id: `R${reqIndex}`,
        name: reqName,
        priority: scenarioCount >= 3 ? 'P0' : scenarioCount >= 2 ? 'P1' : 'P2',
        description: description.slice(0, 300),
      });
    }
  }

  return features;
}

// ==================== 向量文本 ====================

/**
 * 构建能力节点的向量化文本
 *
 * 包含：Purpose + 所有 Requirement 名称 + 描述 + Scenario 名称
 * 剔除 Markdown 标记，保留纯文本。
 */
function buildVectorText(specText: string, features: RequirementFeature[]): string {
  const parts: string[] = [];

  // Purpose
  const purpose = extractPurpose(specText);
  if (purpose) parts.push(purpose);

  // Features（名称 + 描述）
  for (const f of features) {
    parts.push(f.name);
    if (f.description) parts.push(f.description);
  }

  return stripMarkdown(parts.join('\n')).trim();
}

/** 去除 Markdown 格式标记，保留纯文本 */
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +/g, ' ')
    .trim();
}
