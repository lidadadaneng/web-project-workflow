/**
 * Vuex Store 解析器
 *
 * 基于源码文本分析识别 Vuex store 定义，提取：
 * - store 节点（L2）
 * - state / mutations / actions / getters 子元素（L3）
 *
 * 支持三种定义风格：
 *   1. 根 Store: new Vuex.Store({ state, mutations, actions, getters, modules })
 *   2. 模块文件: export default { state, mutations, actions, getters, namespaced, modules }
 *   3. 模块常量: const moduleA = { state, ..., namespaced: true }
 *
 * 支持嵌套模块递归解析。
 */
import * as path from 'path';
import type { GraphNode } from '../types';
import {
  NODE_TYPE_VUEX_STORE,
  NODE_TYPE_VUEX_STATE,
  NODE_TYPE_VUEX_MUTATION,
  NODE_TYPE_VUEX_ACTION,
  NODE_TYPE_VUEX_GETTER,
} from '../types';
import { generateNodeId } from '../builders/node-builder';

/** Vuex 解析结果 */
export interface VuexParseResult {
  /** store 节点列表（含根 store 和子模块） */
  stores: GraphNode[];
  /** 子元素节点（state/mutation/action/getter） */
  elements: GraphNode[];
}

/**
 * 判断文件是否为 Vuex store 文件（快速预检）
 *
 * 基于文件名和内容特征做启发式判断。
 */
export function isVuexStoreFile(filePath: string, source: string): boolean {
  const basename = path.basename(filePath).toLowerCase();
  const dirname = path.dirname(filePath).toLowerCase();

  // 目录特征：store / stores 目录下
  const inStoresDir = /[/\\]stores?[/\\]/.test(filePath) || /stores?$/.test(dirname);

  // 文件名特征
  const hasStoreInName =
    basename.includes('.store.') ||
    basename.includes('store.') ||
    basename === 'store.js' ||
    basename === 'store.ts' ||
    basename === 'index.js' && /stores?$/.test(dirname);

  // 内容特征：Vuex 特有标识
  const hasVuexPattern =
    /new\s+Vuex\.Store\s*\(/.test(source) ||
    /Vuex\.Store\s*\(/.test(source) ||
    /namespaced\s*:\s*true/.test(source) ||
    (/\bmutations\s*:/.test(source) && /\bactions\s*:/.test(source) && /\bstate\s*:/.test(source));

  return hasVuexPattern && (inStoresDir || hasStoreInName);
}

/**
 * 解析 Vuex stores
 *
 * @param filePath 文件路径
 * @param root 项目根目录
 * @param source 文件源码
 * @param _language 语言类型（预留，当前基于文本扫描）
 */
export async function parseVuexStores(
  filePath: string,
  root: string,
  source: string,
  _language: 'typescript' | 'javascript',
): Promise<VuexParseResult> {
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');
  const stores: GraphNode[] = [];
  const elements: GraphNode[] = [];

  // 1. 查找 new Vuex.Store(...) 根 store
  const rootStores = extractRootStore(source);
  for (const rs of rootStores) {
    const storeName = 'root';
    parseStoreObject(rs.content, storeName, relPath, stores, elements, rs.namespaced);
  }

  // 2. 查找 export default { ... } 模块定义
  const defaultModule = extractDefaultExportModule(source);
  if (defaultModule && rootStores.length === 0) {
    // 从文件名推断模块名
    const fileName = path.basename(filePath, path.extname(filePath));
    const moduleName = fileName === 'index' ? inferModuleNameFromPath(relPath) : fileName;
    parseStoreObject(defaultModule.content, moduleName, relPath, stores, elements, defaultModule.namespaced);
  }

  // 3. 查找命名常量模块：const xxxModule = { state, mutations, ... }
  const namedModules = extractNamedModules(source);
  for (const nm of namedModules) {
    // 避免重复（如果已在 export default 或 modules 里处理过）
    if (stores.some((s) => s.name === nm.name)) continue;
    parseStoreObject(nm.content, nm.name, relPath, stores, elements, nm.namespaced);
  }

  return { stores, elements };
}

// ==================== 内部函数 ====================

interface StoreInfo {
  name: string;
  namespaced: boolean;
}

/**
 * 解析一个 store 配置对象，生成节点和子元素，
 * 并递归解析嵌套的 modules。
 */
function parseStoreObject(
  objContent: string,
  storeName: string,
  filePath: string,
  stores: GraphNode[],
  elements: GraphNode[],
  namespaced: boolean,
): void {
  const storeNode: GraphNode = {
    id: generateNodeId('vuex-store', [filePath, storeName]),
    level: 'L2',
    type: NODE_TYPE_VUEX_STORE,
    name: storeName,
    attrs: {
      filePath,
      description: `Vuex Store: ${storeName}`,
      tags: ['vuex', 'store'],
      namespaced,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  stores.push(storeNode);

  // 提取 state
  const stateKeys = extractStateKeys(objContent);
  for (const key of stateKeys) {
    elements.push(buildVuexElement(NODE_TYPE_VUEX_STATE, key, storeName, filePath));
  }

  // 提取 mutations
  const mutationKeys = extractNestedKeys(objContent, 'mutations');
  for (const key of mutationKeys) {
    elements.push(buildVuexElement(NODE_TYPE_VUEX_MUTATION, key, storeName, filePath));
  }

  // 提取 actions
  const actionKeys = extractNestedKeys(objContent, 'actions');
  for (const key of actionKeys) {
    elements.push(buildVuexElement(NODE_TYPE_VUEX_ACTION, key, storeName, filePath));
  }

  // 提取 getters
  const getterKeys = extractNestedKeys(objContent, 'getters');
  for (const key of getterKeys) {
    elements.push(buildVuexElement(NODE_TYPE_VUEX_GETTER, key, storeName, filePath));
  }

  // 递归解析嵌套 modules
  const nestedModules = extractNestedModules(objContent);
  for (const nested of nestedModules) {
    const childName = `${storeName}/${nested.name}`;
    parseStoreObject(nested.content, childName, filePath, stores, elements, nested.namespaced);
  }
}

// ==================== 文本扫描工具（轻量版，足够 Vuex 场景） ====================

interface ScanState {
  inString: string | null;
  inTemplate: boolean;
  inLineComment: boolean;
  inBlockComment: boolean;
}

function createScanState(): ScanState {
  return { inString: null, inTemplate: false, inLineComment: false, inBlockComment: false };
}

function stepScan(state: ScanState, ch: string, nextCh: string): boolean {
  if (state.inLineComment) {
    if (ch === '\n') state.inLineComment = false;
    return false;
  }
  if (state.inBlockComment) {
    if (ch === '*' && nextCh === '/') state.inBlockComment = false;
    return false;
  }
  if (state.inString) {
    if (ch === '\\') return false;
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
      if (depth === 0) return text.slice(start + 1, i);
    }
  }
  return null;
}

/** 提取指定 key 对应对象的内部内容（顶层匹配） */
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
    if (braceDepth !== 0) { i++; continue; }

    const pattern = new RegExp(`^${key}\\s*:\\s*\\{`);
    const rest = objContent.slice(i);
    const m = pattern.exec(rest);
    if (m) {
      const braceStart = i + m[0].length - 1;
      const inner = extractBalancedBraces(objContent.slice(braceStart));
      return inner ?? undefined;
    }

    i++;
  }
  return undefined;
}

/** 提取对象第一层键名 */
function extractFirstLevelKeys(objContent: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const state = createScanState();
  let braceDepth = 1; // 模拟外层对象

  let i = 0;
  while (i < objContent.length) {
    const ch = objContent[i];
    const nextCh = objContent[i + 1] || '';
    const isCode = stepScan(state, ch, nextCh);
    if (!isCode) { i++; continue; }
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }
    if (braceDepth !== 1) { i++; continue; }
    if (/\s/.test(ch) || ch === ',') { i++; continue; }

    let keyName: string | null = null;
    let keyEnd = i;

    if (ch === '"' || ch === "'") {
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
      keyEnd = i + 1;
      while (keyEnd < objContent.length && /\s/.test(objContent[keyEnd])) keyEnd++;
      let j = keyEnd;
      while (j < objContent.length && /[a-zA-Z0-9_$]/.test(objContent[j])) j++;
      keyName = objContent.slice(keyEnd, j);
      keyEnd = j;
    } else if (/[a-zA-Z_$]/.test(ch)) {
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

    let k = keyEnd;
    while (k < objContent.length && /\s/.test(objContent[k])) k++;

    // async 前缀处理
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

// ==================== Vuex 专用提取函数 ====================

/** 提取根 store：new Vuex.Store({ ... }) */
function extractRootStore(source: string): Array<{ content: string; namespaced: boolean }> {
  const results: Array<{ content: string; namespaced: boolean }> = [];
  const regex = /new\s+Vuex\.Store\s*\(\s*/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const startIdx = match.index + match[0].length;
    const rest = source.slice(startIdx);
    const objContent = extractBalancedBraces(rest);
    if (objContent) {
      results.push({ content: objContent, namespaced: false });
    }
  }

  // 兼容 Vuex 3/4：createStore({ ... })
  const csRegex = /createStore\s*\(\s*/g;
  while ((match = csRegex.exec(source)) !== null) {
    // 避免和其他 createStore 混淆，检查是否从 vuex 导入
    if (!/from\s+['"]vuex['"]/.test(source) && !/import.*vuex/i.test(source)) {
      // 即使不确定是 vuex 的 createStore，只要在 store 文件里就先按 vuex 解析
      // 由于 isVuexStoreFile 已经做了前置校验，这里可以放宽
    }
    const startIdx = match.index + match[0].length;
    const rest = source.slice(startIdx);
    const objContent = extractBalancedBraces(rest);
    if (objContent) {
      results.push({ content: objContent, namespaced: false });
    }
  }

  return results;
}

/** 提取 export default { ... } 形式的模块 */
function extractDefaultExportModule(source: string): { content: string; namespaced: boolean } | null {
  // 匹配 export default { 或 export default { ... }
  const regex = /export\s+default\s*\{/;
  const match = regex.exec(source);
  if (!match) return null;

  const braceStart = match.index + match[0].length - 1;
  const content = extractBalancedBraces(source.slice(braceStart));
  if (!content) return null;

  const namespaced = /namespaced\s*:\s*true/.test(content);
  return { content, namespaced };
}

/** 提取命名常量模块：const xxxModule = { state, ... } */
function extractNamedModules(source: string): Array<{ name: string; content: string; namespaced: boolean }> {
  const results: Array<{ name: string; content: string; namespaced: boolean }> = [];
  const regex = /(?:const|let|var)\s+(\w+(?:[Mm]odule|[Ss]tore))\s*=\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const name = match[1];
    const braceStart = match.index + match[0].length - 1;
    const content = extractBalancedBraces(source.slice(braceStart));
    if (content) {
      const hasState = /\bstate\s*:/.test(content);
      const hasMutations = /\bmutations\s*:/.test(content);
      const hasActions = /\bactions\s*:/.test(content);
      // 至少包含 2 个 Vuex 核心字段才认为是模块
      const coreCount = [hasState, hasMutations, hasActions, /\bgetters\s*:/.test(content)].filter(Boolean).length;
      if (coreCount >= 2) {
        const namespaced = /namespaced\s*:\s*true/.test(content);
        results.push({ name, content, namespaced });
      }
    }
  }

  return results;
}

/** 提取 state 键名（兼容 state: {} 和 state: () => ({}) 和 state() { return {} }） */
function extractStateKeys(objContent: string): string[] {
  // 形式 1: state: { ... }
  const objState = extractNestedObject(objContent, 'state');
  if (objState) return extractFirstLevelKeys(objState);

  // 形式 2: state: () => ({ ... })
  const arrowRegex = /state\s*:\s*\(\s*\)\s*=>\s*\(/;
  const arrowMatch = arrowRegex.exec(objContent);
  if (arrowMatch) {
    const afterArrow = arrowMatch.index + arrowMatch[0].length;
    const rest = objContent.slice(afterArrow);
    const braceIdx = rest.indexOf('{');
    if (braceIdx !== -1) {
      const inner = extractBalancedBraces(rest.slice(braceIdx));
      if (inner) return extractFirstLevelKeys(inner);
    }
  }

  // 形式 3: state() { return { ... } }
  const methodRegex = /state\s*\(\s*\)\s*\{/;
  const methodMatch = methodRegex.exec(objContent);
  if (methodMatch) {
    const funcStart = methodMatch.index + methodMatch[0].length - 1;
    const funcBody = extractBalancedBraces(objContent.slice(funcStart));
    if (funcBody) {
      const returnMatch = /return\s*\{/.exec(funcBody);
      if (returnMatch) {
        const inner = extractBalancedBraces(funcBody.slice(returnMatch.index + 'return '.length));
        if (inner) return extractFirstLevelKeys(inner);
      }
    }
  }

  return [];
}

/** 提取嵌套对象（mutations/actions/getters）的键名 */
function extractNestedKeys(objContent: string, key: string): string[] {
  const nested = extractNestedObject(objContent, key);
  if (!nested) return [];
  return extractFirstLevelKeys(nested);
}

/** 提取嵌套 modules 对象中的子模块 */
function extractNestedModules(objContent: string): Array<{ name: string; content: string; namespaced: boolean }> {
  const modules = extractNestedObject(objContent, 'modules');
  if (!modules) return [];

  const results: Array<{ name: string; content: string; namespaced: boolean }> = [];
  const state = createScanState();
  let braceDepth = 1;

  let i = 0;
  while (i < modules.length) {
    const ch = modules[i];
    const nextCh = modules[i + 1] || '';
    const isCode = stepScan(state, ch, nextCh);
    if (!isCode) { i++; continue; }
    if (ch === '{') { braceDepth++; i++; continue; }
    if (ch === '}') { braceDepth--; i++; continue; }
    if (braceDepth !== 1) { i++; continue; }
    if (/\s/.test(ch) || ch === ',') { i++; continue; }

    // 读模块名（键）
    let moduleName: string | null = null;
    let keyEnd = i;

    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let str = '';
      let esc = false;
      while (j < modules.length) {
        const c = modules[j];
        if (esc) { str += c; esc = false; j++; continue; }
        if (c === '\\') { esc = true; j++; continue; }
        if (c === quote) break;
        str += c;
        j++;
      }
      moduleName = str;
      keyEnd = j + 1;
    } else if (/[a-zA-Z_$]/.test(ch)) {
      let j = i;
      while (j < modules.length && /[a-zA-Z0-9_$]/.test(modules[j])) j++;
      moduleName = modules.slice(i, j);
      keyEnd = j;
    } else {
      i++;
      continue;
    }

    if (!moduleName) {
      i = keyEnd;
      continue;
    }

    // 跳过 : 和空白
    let k = keyEnd;
    while (k < modules.length && /\s/.test(modules[k])) k++;
    if (modules[k] === ':') {
      k++;
      while (k < modules.length && /\s/.test(modules[k])) k++;
    }

    // 检查值是对象字面量还是变量引用
    if (modules[k] === '{') {
      // 对象字面量
      const inner = extractBalancedBraces(modules.slice(k));
      if (inner) {
        const namespaced = /namespaced\s*:\s*true/.test(inner);
        results.push({ name: moduleName, content: inner, namespaced });
      }
      // 跳过整个对象
      const braceEnd = findMatchingBrace(modules, k);
      i = braceEnd + 1;
      continue;
    } else {
      // 变量引用（如 userModule）——无法在此处解析，跳过
      i = keyEnd;
      continue;
    }
  }

  return results;
}

/** 找到匹配的右括号位置 */
function findMatchingBrace(text: string, startIdx: number): number {
  let depth = 0;
  const state = createScanState();
  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    const nextCh = text[i + 1] || '';
    const isCode = stepScan(state, ch, nextCh);
    if (!isCode) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length - 1;
}

/** 从文件路径推断模块名（取 store/modules 下的目录名） */
function inferModuleNameFromPath(relPath: string): string {
  const parts = relPath.split('/');
  // 找 store/modules 下面那一层
  const storeIdx = parts.findIndex((p) => p === 'store' || p === 'stores');
  if (storeIdx !== -1 && storeIdx + 1 < parts.length) {
    const next = parts[storeIdx + 1];
    if (next === 'modules' && storeIdx + 2 < parts.length) {
      return parts[storeIdx + 2];
    }
    if (next !== 'modules') {
      return next;
    }
  }
  // 退而求其次，取上一级目录名
  if (parts.length >= 2) return parts[parts.length - 2];
  return 'module';
}

/** 构建 Vuex 元素节点 */
function buildVuexElement(
  type:
    | typeof NODE_TYPE_VUEX_STATE
    | typeof NODE_TYPE_VUEX_MUTATION
    | typeof NODE_TYPE_VUEX_ACTION
    | typeof NODE_TYPE_VUEX_GETTER,
  name: string,
  storeName: string,
  filePath: string,
): GraphNode {
  return {
    id: generateNodeId('vuex-elem', [filePath, storeName, name]),
    level: 'L3',
    type,
    name,
    attrs: {
      filePath,
      parentName: storeName,
      storeName,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
