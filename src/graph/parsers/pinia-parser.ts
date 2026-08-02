/**
 * Pinia Store 解析器
 *
 * 基于源码文本分析识别 Pinia store 定义，提取：
 * - store 节点（L2）
 * - state / getters / actions 子元素（L3）
 *
 * 支持两种定义风格：
 *   1. Options Store: defineStore('id', { state, getters, actions })
 *   2. Setup Store:   defineStore('id', () => { ... })
 */
import * as path from 'path';
import type { GraphNode } from '../types';
import {
  NODE_TYPE_PINIA_STORE,
  NODE_TYPE_PINIA_STATE,
  NODE_TYPE_PINIA_GETTER,
  NODE_TYPE_PINIA_ACTION,
} from '../types';
import { generateNodeId } from '../builders/node-builder';

/** Pinia 解析结果 */
export interface PiniaParseResult {
  /** store 节点列表 */
  stores: GraphNode[];
  /** 子元素节点（state/getter/action） */
  elements: GraphNode[];
}

/**
 * 判断文件是否为 Pinia store 文件（快速预检）
 *
 * 基于文件名和内容特征做启发式判断，避免对每个文件都做完整解析。
 */
export function isPiniaStoreFile(filePath: string, source: string): boolean {
  // 文件名特征：xxx.store.ts / useXxxStore.ts / stores/ 目录下
  const basename = path.basename(filePath).toLowerCase();
  const dirname = path.dirname(filePath).toLowerCase();
  const hasStoreInName =
    basename.includes('.store.') ||
    basename.includes('store.') ||
    basename.startsWith('use') && basename.endsWith('store.ts');
  const inStoresDir = /[/\\]stores?[/\\]/.test(filePath) || /stores?$/.test(dirname);

  // 内容特征：包含 defineStore 调用
  const hasDefineStore = /defineStore\s*\(/.test(source);

  // 两种条件都满足才认为是 store 文件，减少误判
  return hasDefineStore && (hasStoreInName || inStoresDir);
}

/**
 * 解析 Pinia stores
 *
 * @param filePath 文件路径
 * @param root 项目根目录
 * @param source 文件源码
 * @param language 语言类型
 */
export async function parsePiniaStores(
  filePath: string,
  root: string,
  source: string,
  language: 'typescript' | 'javascript',
): Promise<PiniaParseResult> {
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');
  const stores: GraphNode[] = [];
  const elements: GraphNode[] = [];

  // 提取所有 defineStore 调用
  const storeMatches = extractDefineStoreCalls(source);

  for (const match of storeMatches) {
    const storeId = match.id;
    const storeName = match.name || `use${capitalize(storeId)}Store`;

    const storeNode: GraphNode = {
      id: generateNodeId('pinia-store', [relPath, storeId]),
      level: 'L2',
      type: NODE_TYPE_PINIA_STORE,
      name: storeName,
      attrs: {
        filePath: relPath,
        description: `Pinia Store: ${storeId}`,
        tags: ['pinia', 'store'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    stores.push(storeNode);

    // 解析 state/getters/actions
    if (match.style === 'options') {
      // Options API 风格
      const stateItems = extractObjectKeys(match.stateBlock || '');
      const getterItems = extractObjectKeys(match.gettersBlock || '');
      const actionItems = extractObjectKeys(match.actionsBlock || '');

      for (const name of stateItems) {
        elements.push(buildPiniaElement(NODE_TYPE_PINIA_STATE, name, storeName, relPath));
      }
      for (const name of getterItems) {
        elements.push(buildPiniaElement(NODE_TYPE_PINIA_GETTER, name, storeName, relPath));
      }
      for (const name of actionItems) {
        elements.push(buildPiniaElement(NODE_TYPE_PINIA_ACTION, name, storeName, relPath));
      }
    } else if (match.style === 'setup') {
      // Setup 风格：从返回对象中提取
      const returned = extractReturnedKeys(match.body || '');
      for (const item of returned) {
        // 简单启发式：函数名 → action，普通变量 → state，computed → getter
        const type = inferPiniaElementType(item.name, item.kind);
        elements.push(buildPiniaElement(type, item.name, storeName, relPath));
      }
    }
  }

  return { stores, elements };
}

// ==================== 内部函数 ====================

interface DefineStoreMatch {
  id: string;
  name?: string;
  style: 'options' | 'setup';
  stateBlock?: string;
  gettersBlock?: string;
  actionsBlock?: string;
  body?: string;
}

/**
 * 提取 defineStore 调用信息
 *
 * 支持：
 *   defineStore('id', { state, getters, actions })
 *   export const useXxxStore = defineStore('id', { ... })
 *   defineStore('id', () => { ... return { ... } })
 */
function extractDefineStoreCalls(source: string): DefineStoreMatch[] {
  const results: DefineStoreMatch[] = [];

  // 匹配模式：export const xxx = defineStore('id', ...) 或 defineStore('id', ...)
  const regex = /(?:export\s+const\s+(\w+)\s*=\s*)?defineStore\s*\(\s*['"]([^'"]+)['"]\s*,\s*/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const storeName = match[1];
    const storeId = match[2];
    const startIdx = match.index + match[0].length;

    // 找到第二个参数的开始，判断是对象还是函数
    const rest = source.slice(startIdx);
    const firstChar = rest.trimStart()[0];

    if (firstChar === '{') {
      // Options API 风格
      const objContent = extractBalancedBraces(rest);
      if (objContent) {
        const stateBlock = extractNestedObject(objContent, 'state');
        const gettersBlock = extractNestedObject(objContent, 'getters');
        const actionsBlock = extractNestedObject(objContent, 'actions');

        results.push({
          id: storeId,
          name: storeName,
          style: 'options',
          stateBlock,
          gettersBlock,
          actionsBlock,
        });
      }
    } else if (firstChar === '(' || firstChar === ')') {
      // Setup 风格（箭头函数或普通函数）
      const funcBody = extractFunctionBody(rest);
      if (funcBody) {
        results.push({
          id: storeId,
          name: storeName,
          style: 'setup',
          body: funcBody,
        });
      }
    }
  }

  return results;
}

/** 提取平衡的花括号内容（从第一个 { 开始） */
function extractBalancedBraces(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString: string | null = null;
  let inTemplate = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\') {
      escape = true;
      continue;
    }

    if (inTemplate) {
      if (ch === '`') inTemplate = false;
      continue;
    }

    if (inString) {
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }

    if (ch === '`') {
      inTemplate = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start + 1, i);
      }
    }
  }

  return null;
}

/** 从对象中提取嵌套的属性对象内容 */
function extractNestedObject(objContent: string, key: string): string | undefined {
  const regex = new RegExp(`${key}\\s*[:=]\\s*\\{`, 'g');
  const match = regex.exec(objContent);
  if (!match) return undefined;

  const rest = objContent.slice(match.index + match[0].length - 1);
  return extractBalancedBraces(rest) ?? undefined;
}

/** 从对象字面量中提取键名 */
function extractObjectKeys(objContent: string): string[] {
  const keys: string[] = [];
  const keyRegex = /(?:^|[,;{]\s*)(?:['"]([^'"]+)['"]|(\w+))\s*[:(]/g;
  let match: RegExpExecArray | null;

  while ((match = keyRegex.exec(objContent)) !== null) {
    const key = match[1] || match[2];
    if (key && !key.startsWith('__')) {
      keys.push(key);
    }
  }

  return [...new Set(keys)];
}

/** 提取函数体内容（从第一个 { 开始） */
function extractFunctionBody(text: string): string | null {
  // 找到第一个 {
  const start = text.indexOf('{');
  if (start === -1) return null;
  return extractBalancedBraces(text.slice(start));
}

interface ReturnedItem {
  name: string;
  kind: 'ref' | 'reactive' | 'computed' | 'function' | 'other';
}

/** 从 setup 函数体中提取 return 对象的键及其类型 */
function extractReturnedKeys(body: string): ReturnedItem[] {
  const items: ReturnedItem[] = [];

  // 找到 return { ... }
  const returnMatch = /return\s*\{([\s\S]*?)\}/.exec(body);
  if (!returnMatch) return items;

  const returnContent = returnMatch[1];
  const keys = extractObjectKeys(returnContent);

  // 对每个键，推断其类型
  for (const key of keys) {
    const kind = inferKindFromBody(body, key);
    items.push({ name: key, kind });
  }

  return items;
}

/** 从函数体中推断变量的类型 */
function inferKindFromBody(body: string, name: string): ReturnedItem['kind'] {
  // 检查是否为 computed
  const computedRegex = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*=\\s*computed\\s*\\(`,
  );
  if (computedRegex.test(body)) return 'computed';

  // 检查是否为 ref
  const refRegex = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*ref\\s*\\(`);
  if (refRegex.test(body)) return 'ref';

  // 检查是否为 reactive
  const reactiveRegex = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*=\\s*reactive\\s*\\(`,
  );
  if (reactiveRegex.test(body)) return 'reactive';

  // 检查是否为函数
  const funcRegex = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*=\\s*(?:async\\s+)?(?:function|\\()`,
  );
  const funcDeclRegex = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  if (funcRegex.test(body) || funcDeclRegex.test(body)) return 'function';

  return 'other';
}

/** 根据类型推断 Pinia 元素类型 */
function inferPiniaElementType(
  name: string,
  kind: ReturnedItem['kind'],
): typeof NODE_TYPE_PINIA_STATE | typeof NODE_TYPE_PINIA_GETTER | typeof NODE_TYPE_PINIA_ACTION {
  if (kind === 'computed') return NODE_TYPE_PINIA_GETTER;
  if (kind === 'function') return NODE_TYPE_PINIA_ACTION;
  if (kind === 'ref' || kind === 'reactive') return NODE_TYPE_PINIA_STATE;

  // 基于命名的启发式
  if (/^is|^has|^get|^should|^can/.test(name)) return NODE_TYPE_PINIA_GETTER;
  if (/^(fetch|get|set|add|remove|update|delete|create|save|load|init|reset|toggle)/.test(name)) {
    return NODE_TYPE_PINIA_ACTION;
  }

  return NODE_TYPE_PINIA_STATE;
}

/** 构建 Pinia 元素节点 */
function buildPiniaElement(
  type: typeof NODE_TYPE_PINIA_STATE | typeof NODE_TYPE_PINIA_GETTER | typeof NODE_TYPE_PINIA_ACTION,
  name: string,
  storeName: string,
  filePath: string,
): GraphNode {
  return {
    id: generateNodeId('pinia-elem', [filePath, storeName, name]),
    level: 'L3',
    type,
    name,
    attrs: {
      filePath,
      parentName: storeName,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** 首字母大写 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
