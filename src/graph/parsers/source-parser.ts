/**
 * 源码文件解析调度器
 *
 * 根据文件类型分发到对应语言的解析器，生成文件节点和元素节点。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GraphNode } from '../types';
import { generateNodeId } from '../builders/node-builder';
import {
  parseTypeScriptFile,
  ParseResult,
} from './ts-parser';

/** 支持的语言 */
export type SupportedLanguage = 'typescript' | 'javascript';

/**
 * 判断文件是否为支持的源码文件
 */
export function isSupportedFile(
  filePath: string,
  languages: string[],
): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const lang = extToLanguage(ext);
  return lang !== null && languages.includes(lang);
}

/**
 * 解析单个源码文件
 *
 * @param filePath 文件绝对路径
 * @param root 项目根目录（用于计算相对路径和生成节点 ID）
 * @returns 解析结果：文件节点 + 元素节点 + import 信息
 */
export async function parseSourceFile(
  filePath: string,
  root: string,
): Promise<ParseResult> {
  const ext = path.extname(filePath).toLowerCase();
  const lang = extToLanguage(ext);

  if (!lang) {
    return { fileNode: createFileNode(filePath, root, 'unknown'), elements: [], imports: [] };
  }

  const source = fs.readFileSync(filePath, 'utf-8');

  switch (lang) {
    case 'typescript':
    case 'javascript':
      return parseTypeScriptFile(filePath, root, source, lang);

    default:
      return { fileNode: createFileNode(filePath, root, lang), elements: [], imports: [] };
  }
}

/**
 * 批量解析文件
 */
export async function parseSourceFiles(
  filePaths: string[],
  root: string,
): Promise<ParseResult[]> {
  const results: ParseResult[] = [];
  for (const fp of filePaths) {
    try {
      const result = await parseSourceFile(fp, root);
      results.push(result);
    } catch (e) {
      console.warn(`[source-parser] 解析失败: ${path.relative(root, fp)} - ${(e as Error).message}`);
      // 解析失败也返回一个文件节点（没有元素），保证文件级图谱完整
      results.push({
        fileNode: createFileNode(fp, root, 'unknown'),
        elements: [],
        imports: [],
      });
    }
  }
  return results;
}

// ==================== 工具函数 ====================

function extToLanguage(ext: string): SupportedLanguage | null {
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    default:
      return null;
  }
}

function createFileNode(
  filePath: string,
  root: string,
  language: string,
): GraphNode {
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath);
  const fileHash = hashFileContent(fs.readFileSync(filePath, 'utf-8'));

  return {
    id: generateNodeId('file', [relPath]),
    level: 'L3',
    type: 'file',
    name: fileName,
    attrs: {
      filePath: relPath,
      language,
      fileHash,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function hashFileContent(content: string): string {
  // 延迟导入，避免在不使用时加载
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}
