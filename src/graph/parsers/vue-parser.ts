/**
 * Vue 单文件组件（SFC）解析器
 *
 * 解析 .vue 文件，提取 `<script>` / `<script setup>` 块内容，
 * 然后分发到 TypeScript 或 JavaScript 解析器进行 AST 解析。
 *
 * 首版策略：
 *   - 用正则提取 script 块（简单可靠，Vue SFC 格式规范）
 *   - 根据 lang 属性选择解析器（默认 javascript）
 *   - 模板和样式不解析
 *   - 组件名从文件名推断（PascalCase）
 *
 * 后续可优化：
 *   - 用 tree-sitter-html 解析外层结构
 *   - 解析 template 中的组件引用关系
 */
import * as path from 'path';
import type { GraphNode, NodeAttributes } from '../types';
import { NODE_TYPE_COMPONENT, NODE_TYPE_FILE } from '../types';
import { parseTypeScriptFile, type ParseResult } from './ts-parser';
import { generateNodeId } from '../builders/node-builder';

/**
 * 解析 Vue SFC 文件
 */
export async function parseVueFile(
  filePath: string,
  root: string,
  source: string,
): Promise<ParseResult> {
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath);

  // 提取 script 块
  const scriptInfo = extractScriptBlock(source);

  // 推断组件名（文件名转 PascalCase，去掉 .vue 后缀）
  const componentName = toPascalCase(fileName.replace(/\.vue$/i, ''));

  // 如果没有 script 块，只返回文件节点（标记为 Vue 组件）
  if (!scriptInfo) {
    const fileNode = createVueFileNode(filePath, root, componentName);
    return { fileNode, elements: [], imports: [] };
  }

  // 根据 lang 选择解析器
  const lang = scriptInfo.lang === 'ts' ? 'tsx' : 'javascript';

  // 用 JS/TS 解析器解析 script 内容
  const innerResult = await parseTypeScriptFile(
    filePath,
    root,
    scriptInfo.content,
    lang as 'tsx' | 'javascript',
  );

  // 替换文件节点为 Vue 专用的（标记为组件）
  const fileNode = createVueFileNode(filePath, root, componentName, scriptInfo.lang);

  // 元素节点沿用内部解析结果
  const elements = innerResult.elements;

  // Vue 组件内的函数/方法 parentName 统一为组件名（去重名歧义）
  for (const el of elements) {
    // 组件节点自身保持原来的 parentName（文件名）
    if (el.type !== NODE_TYPE_COMPONENT) {
      el.attrs.parentName = componentName;
    }
  }

  // 如果文件是一个默认导出的组件，添加一个组件节点
  // （这里简单处理：所有 .vue 文件都视为一个组件）
  const hasDefaultExport = elements.some(
    (el) => el.attrs.isExported && (el.type === 'class' || el.type === 'function'),
  );

  // 始终添加一个文件级组件节点（代表整个 Vue 组件）
  const componentNode = createVueComponentNode(filePath, root, componentName);
  elements.unshift(componentNode);

  return {
    fileNode,
    elements,
    imports: innerResult.imports,
  };
}

// ==================== Script 块提取 ====================

interface ScriptBlock {
  content: string;
  lang?: string;
  isSetup: boolean;
}

/**
 * 从 Vue SFC 文本中提取 script 块
 *
 * 支持：
 *   <script>
 *   <script setup>
 *   <script lang="ts">
 *   <script setup lang="ts">
 */
function extractScriptBlock(source: string): ScriptBlock | null {
  // 匹配 <script ...> 到 </script>
  // 注意：用非贪婪匹配，支持属性
  const regex = /<script\b([^>]*)>([\s\S]*?)<\/script>/i;
  const match = source.match(regex);

  if (!match) return null;

  const attrs = match[1];
  const content = match[2];

  // 解析 lang 属性
  const langMatch = attrs.match(/\blang\s*=\s*["']([^"']+)["']/i);
  const lang = langMatch ? langMatch[1].toLowerCase() : undefined;

  // 是否为 setup script
  const isSetup = /\bsetup\b/i.test(attrs);

  // 计算内容在原始文件中的偏移（用于行号修正，首版暂不处理）
  // 简单起见，直接返回内容

  return {
    content: content.trim(),
    lang,
    isSetup,
  };
}

// ==================== 节点生成 ====================

function createVueFileNode(
  filePath: string,
  root: string,
  componentName: string,
  scriptLang?: string,
): GraphNode {
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath);

  const crypto = require('crypto');
  const fileHash = crypto
    .createHash('sha256')
    .update(require('fs').readFileSync(filePath, 'utf-8'))
    .digest('hex')
    .slice(0, 16);

  const attrs: NodeAttributes = {
    filePath: relPath,
    language: 'vue',
    fileHash,
    description: `Vue 组件: ${componentName}`,
  };

  if (scriptLang) {
    attrs.tags = [`script-lang:${scriptLang}`];
  }

  return {
    id: generateNodeId('file', [relPath]),
    level: 'L3',
    type: NODE_TYPE_FILE,
    name: fileName,
    attrs,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function createVueComponentNode(
  filePath: string,
  root: string,
  componentName: string,
): GraphNode {
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');

  return {
    id: generateNodeId('component', [relPath, componentName]),
    level: 'L3',
    type: NODE_TYPE_COMPONENT,
    name: componentName,
    attrs: {
      filePath: relPath,
      parentName: path.basename(filePath),
      isExported: true,
      description: 'Vue 单文件组件',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ==================== 工具函数 ====================

/**
 * 转换为 PascalCase
 *
 * 支持多种输入格式：
 *   app-input → AppInput
 *   user_profile → UserProfile
 *   hello world → HelloWorld
 *   AppInput → AppInput（已经是 PascalCase 保持不变）
 *   index → Index
 */
function toPascalCase(name: string): string {
  // 如果已经是 PascalCase（首字母大写且后续有大写字母），直接返回
  if (/^[A-Z][a-zA-Z0-9]*$/.test(name)) {
    return name;
  }

  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}
