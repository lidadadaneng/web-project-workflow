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
      const stateItems = extractFirstLevelKeys(match.stateBlock || '');
      const getterItems = extractFirstLevelKeys(match.gettersBlock || '');
      const actionItems = extractFirstLevelKeys(match.actionsBlock || '');

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

  const regex = /(?:export\s+const\s+(\w+)\s*=\s*)?defineStore\s*\(\s*['"]([^'"]+)['"]\s*,\s*/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const storeName = match[1];
    const storeId = match[2];
    const startIdx = match.index + match[0].length;

    const rest = source.slice(startIdx);
    const firstChar = rest.trimStart()[0];

    if (firstChar === '{') {
      // Options API 风格
      const objContent = extractBalancedBraces(rest);
      if (objContent) {
        const stateBlock = extractStateBlock(objContent);
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
      // Setup 风格
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

// ==================== 文本扫描工具 ====================

interface ScanState {
  inString: string | null;
  inTemplate: boolean;
  inLineComment: boolean;
  inBlockComment: boolean;
}

function createScanState(): ScanState {
  return { inString: null, inTemplate: false, inLineComment: false, inBlockComment: false };
}

/**
 * 推进扫描状态一个字符。返回 true 表示当前字符是"代码字符"
 * （不在字符串/模板/注释中）。
 */
function stepScan(state: ScanState, ch: string, nextCh: string): boolean {
  if (state.inLineComment) {
    if (ch === '\n') state.inLineComment = false;
    return false;
  }
  if (state.inBlockComment) {
    if (ch === '*' && nextCh === '/') {
      state.inBlockComment = false;
      // 用一个技巧：把下一个字符标记为已处理
      // 调用方会按字符推进，所以这里只处理当前字符即可，
      // 下一轮 nextCh 就不是 '/' 了
    }
    return false;
  }
  if (state.inString) {
    if (ch === '\\') return false; // 转义，下一个也跳过
    if (ch === state.inString) { state.inString = null; return false; }
    return false;
  }
  if (state.inTemplate) {
    if (ch === '\\') return false;
    if (ch === '`') { state.inTemplate = false; return false; }
    return false;
  }

  if (ch === '/' && nextCh === '/') { state.inLineComment = true; return false; }
  if (ch === '/' && nextCh === '*') { state.inBlockComment = true; return false; }
  if (ch === '"' || ch === "'") { state.inString = ch; return false; }
  if (ch === '`') { state.inTemplate = true; return false; }

  return true;
}

/**
 * 提取平衡花括号内容（从第一个 { 开始，返回括号内部内容）。
 * 正确处理字符串、模板字面量、注释、嵌套对象。
 */
function extractBalancedBraces(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  const state = createScanState();

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    const nextCh = text[i + 1] || '';
    const isCode = stepScan(state, ch, nextCh);
    if (!isCode) continue;

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

/**
 * 从对象字面量中提取顶层指定 key 的嵌套对象内容。
 * 正确处理嵌套对象中的同名 key（只匹配顶层）。
 */
function extractNestedObject(objContent: string, key: string): string | undefined {
  const state = createScanState();
  let braceDepth = 0;
  let i = 0;

  while (i < objContent.length) {
    const ch = objContent[i];
    const nextCh = objContent[i + 1] || '';
    const isCode = stepScan(state, ch, nextCh);

    if (!isCode) { i++; continue; }
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }

    // 只在顶层（depth === 0）查找 key
    if (braceDepth !== 0) { i++; continue; }

    // 检查是否匹配 key: { 或 key = {
    const pattern = new RegExp(`^${key}\\s*[:=]\\s*\\{`);
    const rest = objContent.slice(i);
    const m = pattern.exec(rest);
    if (m) {
      // 从匹配的 { 开始提取
      const braceStart = i + m[0].length - 1;
      const inner = extractBalancedBraces(objContent.slice(braceStart));
      return inner ?? undefined;
    }

    i++;
  }

  return undefined;
}

/**
 * 提取 state 对象内容。
 * 支持三种形式：
 *   state: { ... }
 *   state: () => ({ ... })   (箭头函数返回对象)
 *   state() { return { ... } } (方法简写)
 */
function extractStateBlock(objContent: string): string | undefined {
  const state = createScanState();
  let braceDepth = 0;
  let i = 0;

  while (i < objContent.length) {
    const ch = objContent[i];
    const nextCh = objContent[i + 1] || '';
    const isCode = stepScan(state, ch, nextCh);

    if (!isCode) { i++; continue; }
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }
    if (braceDepth !== 0) { i++; continue; }

    // 匹配 state: {
    const objPattern = /^state\s*:\s*\{/;
    if (objPattern.test(objContent.slice(i))) {
      const m = objPattern.exec(objContent.slice(i))!;
      const braceStart = i + m[0].length - 1;
      return extractBalancedBraces(objContent.slice(braceStart)) ?? undefined;
    }

    // 匹配 state: () => ({
    const arrowPattern = /^state\s*:\s*\(\s*\)\s*=>\s*\(/;
    if (arrowPattern.test(objContent.slice(i))) {
      const m = arrowPattern.exec(objContent.slice(i))!;
      const afterArrow = i + m[0].length;
      // 从 ( 后面找 {
      const rest = objContent.slice(afterArrow);
      const braceIdx = rest.indexOf('{');
      if (braceIdx !== -1) {
        return extractBalancedBraces(rest.slice(braceIdx)) ?? undefined;
      }
    }

    // 匹配 state() { ... return {
    const methodPattern = /^state\s*\(\s*\)\s*\{/;
    if (methodPattern.test(objContent.slice(i))) {
      const m = methodPattern.exec(objContent.slice(i))!;
      const funcStart = i + m[0].length - 1;
      const funcBody = extractBalancedBraces(objContent.slice(funcStart));
      if (funcBody) {
        // 从函数体中找 return {
        const returnMatch = /return\s*\{/.exec(funcBody);
        if (returnMatch) {
          return extractBalancedBraces(funcBody.slice(returnMatch.index + 'return '.length)) ?? undefined;
        }
      }
    }

    i++;
  }

  return undefined;
}

/**
 * 从对象字面量中提取第一层键名。
 * 正确跳过：嵌套对象/函数体、字符串、模板字面量、注释。
 *
 * 支持的键形式：
 *   key: value
 *   'key': value
 *   "key": value
 *   key() { ... }        (方法简写)
 *   async key() { ... }  (async 方法)
 *   *key() { ... }       (生成器方法)
 */
function extractFirstLevelKeys(objContent: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const state = createScanState();
  let braceDepth = 0;

  // 给内容包一层 {} 保证深度计算一致——其实不用，调用方传进来的就是对象内部内容
  // 我们把 braceDepth 初始化为 1，模拟外层对象已进入
  braceDepth = 1;

  let i = 0;
  while (i < objContent.length) {
    const ch = objContent[i];
    const nextCh = objContent[i + 1] || '';
    const isCode = stepScan(state, ch, nextCh);

    if (!isCode) { i++; continue; }

    // 维护括号深度
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }

    // 只在第一层找键
    if (braceDepth !== 1) { i++; continue; }

    // 跳过空白和逗号
    if (/\s/.test(ch) || ch === ',') { i++; continue; }

    // 读取键：字符串或标识符
    let keyName: string | null = null;
    let keyEnd = i;

    if (ch === '"' || ch === "'") {
      // 字符串键
      const quote = ch;
      let j = i + 1;
      let str = '';
      let esc = false;
      while (j < objContent.length) {
        const c = objContent[j];
        if (esc) { str += c; esc = false; j++; continue; }
        if (c === '\\') { esc = true; j++; continue; }
        if (c === quote) break;
        str += c;
        j++;
      }
      keyName = str;
      keyEnd = j + 1;
    } else if (ch === '*') {
      // 生成器方法：*key()
      keyEnd = i + 1;
      // 跳过空白
      while (keyEnd < objContent.length && /\s/.test(objContent[keyEnd])) keyEnd++;
      // 读标识符
      let j = keyEnd;
      while (j < objContent.length && /[a-zA-Z0-9_$]/.test(objContent[j])) j++;
      keyName = objContent.slice(keyEnd, j);
      keyEnd = j;
    } else if (/[a-zA-Z_$]/.test(ch)) {
      // 标识符键
      let j = i;
      while (j < objContent.length && /[a-zA-Z0-9_$]/.test(objContent[j])) j++;
      keyName = objContent.slice(i, j);
      keyEnd = j;
    } else {
      i++;
      continue;
    }

    if (!keyName || keyName.startsWith('__')) {
      i = keyEnd;
      continue;
    }

    // 跳过键后面的空白
    let k = keyEnd;
    while (k < objContent.length && /\s/.test(objContent[k])) k++;

    // 处理 async 前缀：如果 keyName 是 'async' 且后面跟着另一个标识符 + ( 或 :
    if (keyName === 'async' && /[a-zA-Z_$]/.test(objContent[k] || '')) {
      let m = k;
      while (m < objContent.length && /[a-zA-Z0-9_$]/.test(objContent[m])) m++;
      const realKey = objContent.slice(k, m);
      let n = m;
      while (n < objContent.length && /\s/.test(objContent[n])) n++;
      if (objContent[n] === '(' || objContent[n] === ':') {
        keyName = realKey;
        keyEnd = m;
        k = n;
      }
    }

    // 检查后面是 : 还是 (
    if (objContent[k] === ':' || objContent[k] === '(') {
      if (!seen.has(keyName)) {
        seen.add(keyName);
        keys.push(keyName);
      }
    }

    i = keyEnd;
  }

  return keys;
}

/** 提取函数体内容（从第一个 { 开始） */
function extractFunctionBody(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  return extractBalancedBraces(text.slice(start));
}

// ==================== Setup Store 相关 ====================

interface ReturnedItem {
  name: string;
  kind: 'ref' | 'reactive' | 'computed' | 'function' | 'other';
}

/** 从 setup 函数体中提取 return 对象的键及其类型 */
function extractReturnedKeys(body: string): ReturnedItem[] {
  const items: ReturnedItem[] = [];

  // 找到顶层 return { ... }
  const returnMatch = findTopLevelReturnObject(body);
  if (!returnMatch) return items;

  const keys = extractFirstLevelKeys(returnMatch);

  for (const key of keys) {
    const kind = inferKindFromBody(body, key);
    items.push({ name: key, kind });
  }

  return items;
}

/** 在函数体中找到顶层 return { ... } 的对象内部内容 */
function findTopLevelReturnObject(body: string): string | null {
  const state = createScanState();
  let braceDepth = 0;
  let i = 0;

  while (i < body.length) {
    const ch = body[i];
    const nextCh = body[i + 1] || '';
    const isCode = stepScan(state, ch, nextCh);

    if (!isCode) { i++; continue; }
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }

    // 只在顶层找 return
    if (braceDepth !== 0) { i++; continue; }

    if (/^return\s*\{/.test(body.slice(i))) {
      const m = /^return\s*\{/.exec(body.slice(i))!;
      const braceStart = i + m[0].length - 1;
      return extractBalancedBraces(body.slice(braceStart));
    }

    i++;
  }

  return null;
}

/** 从函数体中推断变量的类型 */
function inferKindFromBody(body: string, name: string): ReturnedItem['kind'] {
  const computedRegex = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*=\\s*computed\\s*\\(`,
  );
  if (computedRegex.test(body)) return 'computed';

  const refRegex = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*ref\\s*\\(`);
  if (refRegex.test(body)) return 'ref';

  const reactiveRegex = new RegExp(
    `(?:const|let|var)\\s+${name}\\s*=\\s*reactive\\s*\\(`,
  );
  if (reactiveRegex.test(body)) return 'reactive';

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
