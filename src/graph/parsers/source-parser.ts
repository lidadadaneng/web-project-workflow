/**
 * 源码文件解析调度器
 *
 * 根据文件类型分发到对应语言的解析器，生成文件节点和元素节点。
 *
 * 支持的格式：
 *   .ts         → typescript
 *   .tsx        → tsx（独立 WASM，支持 JSX 语法）
 *   .js/.mjs/.cjs → javascript
 *   .jsx        → javascript（tree-sitter-javascript 原生支持 JSX）
 *   .vue        → vue（提取 script 块后分发到 JS/TS）
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GraphNode } from '../types';
import { generateNodeId } from '../builders/node-builder';
import {
  parseTypeScriptFile,
  ParseResult,
} from './ts-parser';
import { parseVueFile } from './vue-parser';
import { isPiniaStoreFile, parsePiniaStores } from './pinia-parser';

/** 支持的语言 */
export type SupportedLanguage = 'typescript' | 'tsx' | 'javascript' | 'vue';

/**
 * 判断文件是否为支持的源码文件
 *
 * 注意：语言配置中的 'typescript' 同时包含 .ts 和 .tsx，
 * 'javascript' 同时包含 .js/.jsx/.mjs/.cjs，'vue' 对应 .vue。
 */
export function isSupportedFile(
  filePath: string,
  languages: string[],
): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const lang = extToLanguage(ext);
  if (!lang) return false;

  // 配置语言 → 实际解析语言的映射
  // typescript 配置包含 .ts 和 .tsx
  // javascript 配置包含 .js/.jsx/.mjs/.cjs
  if (lang === 'tsx') return languages.includes('typescript');
  if (lang === 'vue') return languages.includes('vue');
  // typescript 和 javascript 直接匹配
  return languages.includes(lang);
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

  let result: ParseResult;

  switch (lang) {
    case 'typescript':
    case 'tsx':
    case 'javascript':
      result = await parseTypeScriptFile(filePath, root, source, lang);
      break;

    case 'vue':
      result = await parseVueFile(filePath, root, source);
      break;

    default:
      return { fileNode: createFileNode(filePath, root, lang), elements: [], imports: [] };
  }

  // Pinia store 解析（仅当文件疑似 store 时）
  if (isPiniaStoreFile(filePath, source)) {
    try {
      const piniaLang = lang === 'vue' ? 'javascript' : lang;
      const piniaResult = await parsePiniaStores(
        filePath,
        root,
        source,
        piniaLang as 'typescript' | 'javascript',
      );
      if (piniaResult.stores.length > 0) {
        result.piniaStores = piniaResult.stores;
        // Pinia 的 L4 元素（action/getter/state）并入 elements
        result.elements.push(...piniaResult.elements);
      }
    } catch (e) {
      console.warn(
        `[source-parser] Pinia 解析失败: ${path.relative(root, filePath)} - ${(e as Error).message}`,
      );
    }
  }

  return result;
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
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.vue':
      return 'vue';
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
