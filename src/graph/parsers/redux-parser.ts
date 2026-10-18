/**
 * Redux / Redux Toolkit 解析器
 *
 * 基于源码文本分析识别 Redux 状态管理定义，提取：
 * - slice 节点（L2）
 * - state / reducer / action / selector 子元素（L3）
 *
 * 支持的模式：
 *   1. createSlice({ name, initialState, reducers, extraReducers })
 *   2. createAction('type') / createReducer(initialState, builder => {...})
 *   3. createSelector(...) + selectXxx 命名约定
 *   4. configureStore({ reducer: { ... } })
 */
import * as path from 'path';
import type { GraphNode } from '../types';
import {
  NODE_TYPE_REDUX_SLICE,
  NODE_TYPE_REDUX_STATE,
  NODE_TYPE_REDUX_REDUCER,
  NODE_TYPE_REDUX_ACTION,
  NODE_TYPE_REDUX_SELECTOR,
} from '../types';
import { generateNodeId } from '../builders/node-builder';

/** Redux 解析结果 */
export interface ReduxParseResult {
  /** slice 节点列表（L2） */
  slices: GraphNode[];
  /** 独立 action 节点列表（L3，非 slice 生成的） */
  actions: GraphNode[];
  /** 独立 reducer 节点列表（L3） */
  reducers: GraphNode[];
  /** selector 节点列表（L3） */
  selectors: GraphNode[];
  /** 所有子元素节点（合并后的 L3 列表，用于挂到 elements） */
  elements: GraphNode[];
}

/**
 * 判断文件是否为 Redux 相关文件（快速预检）
 */
export function isReduxFile(filePath: string, source: string): boolean {
  const basename = path.basename(filePath).toLowerCase();
  const dirname = path.dirname(filePath).toLowerCase();

  // 目录特征
  const inReduxDir =
    /[/\\]redux[/\\]/.test(filePath) ||
    /[/\\]store[s]?[/\\]/.test(filePath) ||
    /[/\\]slices[/\\]/.test(filePath) ||
    /[/\\]features[/\\]/.test(filePath) ||
    /slices?$/.test(dirname) ||
    /stores?$/.test(dirname);

  // 文件名特征
  const hasReduxInName =
    basename.includes('.slice.') ||
    basename.includes('slice.') ||
    basename.includes('.reducer.') ||
    basename.includes('reducer.') ||
    basename.includes('store.') ||
    /^use.*selector/.test(basename);

  // 内容特征
  const hasReduxPattern =
    /createSlice\s*\(/.test(source) ||
    /configureStore\s*\(/.test(source) ||
    /createReducer\s*\(/.test(source) ||
    /createAction\s*\(/.test(source) ||
    /createSelector\s*\(/.test(source);

  return hasReduxPattern && (inReduxDir || hasReduxInName);
}

/**
 * 解析 Redux 文件
 */
export async function parseReduxFile(
  filePath: string,
  root: string,
  source: string,
  _language: 'typescript' | 'javascript',
): Promise<ReduxParseResult> {
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');
  const slices: GraphNode[] = [];
  const elements: GraphNode[] = [];
  const actions: GraphNode[] = [];
  const reducers: GraphNode[] = [];
  const selectors: GraphNode[] = [];

  // 1. 解析 createSlice
  const sliceMatches = extractCreateSliceCalls(source);
  for (const sm of sliceMatches) {
    const sliceNode: GraphNode = {
      id: generateNodeId('redux-slice', [relPath, sm.name]),
      level: 'L2',
      type: NODE_TYPE_REDUX_SLICE,
      name: sm.name,
      attrs: {
        filePath: relPath,
        description: `Redux Slice: ${sm.name}`,
        tags: ['redux', 'slice'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    slices.push(sliceNode);

    // state
    for (const key of sm.stateKeys) {
      const node = buildReduxElement(NODE_TYPE_REDUX_STATE, key, sm.name, relPath);
      elements.push(node);
    }

    // reducers
    for (const key of sm.reducerKeys) {
      const node = buildReduxElement(NODE_TYPE_REDUX_REDUCER, key, sm.name, relPath);
      elements.push(node);
      // RTK 中每个 reducer 自动生成同名 action
      const actionNode = buildReduxElement(
        NODE_TYPE_REDUX_ACTION,
        `${sm.name}/${key}`,
        sm.name,
        relPath,
      );
      actionNode.attrs.actionType = `${sm.name}/${key}`;
      elements.push(actionNode);
      actions.push(actionNode);
    }
  }

  // 2. 解析 createAction（独立的 action）
  const actionCreators = extractCreateActionCalls(source);
  for (const ac of actionCreators) {
    // 跳过已经在 slice 中生成的 action
    if (elements.some((e) => e.type === 'redux-action' && e.attrs.actionType === ac.type)) continue;
    const node = buildReduxElement(NODE_TYPE_REDUX_ACTION, ac.name, '', relPath);
    node.attrs.actionType = ac.type;
    elements.push(node);
    actions.push(node);
  }

  // 3. 解析 createReducer（独立的 reducer）
  const reducerCreators = extractCreateReducerCalls(source);
  for (const rc of reducerCreators) {
    const node = buildReduxElement(NODE_TYPE_REDUX_REDUCER, rc.name, '', relPath);
    elements.push(node);
    reducers.push(node);
  }

  // 4. 解析 selector（createSelector + selectXxx 命名约定）
  const selectorsFound = extractSelectors(source);
  for (const sel of selectorsFound) {
    // 跳过重复
    if (elements.some((e) => e.name === sel && e.type === 'redux-selector')) continue;
    const node = buildReduxElement(NODE_TYPE_REDUX_SELECTOR, sel, '', relPath);
    elements.push(node);
    selectors.push(node);
  }

  return { slices, actions, reducers, selectors, elements };
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

function extractFirstLevelKeys(objContent: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const state = createScanState();
  let braceDepth = 1;
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

/**
 * 在源码中查找变量定义并返回其对象字面量内容。
 * 支持：const varName = { ... }
 */
function findVariableDefinition(source: string, varName: string): string | undefined {
  const pattern = new RegExp(`(?:const|let|var)\\s+${varName}\\s*[:=\\w\\s]*=\\s*\\{`);
  const match = pattern.exec(source);
  if (!match) return undefined;
  const braceStart = match.index + match[0].length - 1;
  return extractBalancedBraces(source.slice(braceStart)) ?? undefined;
}

/** 提取对象中指定 key 的嵌套对象内容 */
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

// ==================== Redux 专用提取函数 ====================

interface CreateSliceInfo {
  name: string;
  stateKeys: string[];
  reducerKeys: string[];
}

/** 提取 createSlice 调用信息 */
function extractCreateSliceCalls(source: string): CreateSliceInfo[] {
  const results: CreateSliceInfo[] = [];
  const regex = /createSlice\s*\(\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const braceStart = match.index + match[0].length - 1;
    const objContent = extractBalancedBraces(source.slice(braceStart));
    if (!objContent) continue;

    // 提取 name
    const nameMatch = objContent.match(/name\s*:\s*['"]([^'"]+)['"]/);
    const sliceName = nameMatch ? nameMatch[1] : '';
    if (!sliceName) continue;

    // 提取 initialState 的键
    let stateKeys: string[] = [];
    const initialStateObj = extractNestedObject(objContent, 'initialState');
    if (initialStateObj) {
      stateKeys = extractFirstLevelKeys(initialStateObj);
    } else {
      // initialState 可能是变量引用（如 initialState, 或 initialState: initialState）
      // 尝试从源码中查找该变量的定义
      const varMatch = objContent.match(/initialState\s*:\s*(\w+)/);
      const varName = varMatch ? varMatch[1] : 'initialState';
      const varValue = findVariableDefinition(source, varName);
      if (varValue) {
        stateKeys = extractFirstLevelKeys(varValue);
      }
    }

    // 提取 reducers 的键
    let reducerKeys: string[] = [];
    const reducers = extractNestedObject(objContent, 'reducers');
    if (reducers) {
      reducerKeys = extractFirstLevelKeys(reducers);
    }

    results.push({ name: sliceName, stateKeys, reducerKeys });
  }

  return results;
}

interface CreateActionInfo {
  name: string;
  type: string;
}

/** 提取 createAction 调用 */
function extractCreateActionCalls(source: string): CreateActionInfo[] {
  const results: CreateActionInfo[] = [];
  // 匹配形式：export const xxx = createAction('type')
  const regex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*createAction\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    results.push({ name: match[1], type: match[2] });
  }
  return results;
}

interface CreateReducerInfo {
  name: string;
}

/** 提取 createReducer 调用（变量名即 reducer 名） */
function extractCreateReducerCalls(source: string): CreateReducerInfo[] {
  const results: CreateReducerInfo[] = [];
  const regex = /(?:export\s+)?(?:const|let|var)\s+(\w+Reducer)\s*=\s*createReducer\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    results.push({ name: match[1] });
  }
  return results;
}

/** 提取 selector 名称（createSelector + selectXxx 命名约定） */
function extractSelectors(source: string): string[] {
  const names = new Set<string>();

  // createSelector 赋值
  const csRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*createSelector\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = csRegex.exec(source)) !== null) {
    names.add(match[1]);
  }

  // selectXxx 命名约定的函数（参数含 state）
  const funcRegex = /(?:export\s+)?(?:const|let|var)\s+(select\w+)\s*=\s*(?:\([^)]*\)|(?:state[^,)]*))\s*=>/g;
  while ((match = funcRegex.exec(source)) !== null) {
    const name = match[1];
    // 确保参数中有 state
    const funcDef = match[0];
    if (/state/.test(funcDef)) {
      names.add(name);
    }
  }

  return Array.from(names);
}

// ==================== 工具函数 ====================

/** 构建 Redux 元素节点 */
function buildReduxElement(
  type:
    | typeof NODE_TYPE_REDUX_STATE
    | typeof NODE_TYPE_REDUX_REDUCER
    | typeof NODE_TYPE_REDUX_ACTION
    | typeof NODE_TYPE_REDUX_SELECTOR,
  name: string,
  sliceName: string,
  filePath: string,
): GraphNode {
  return {
    id: generateNodeId('redux-elem', [filePath, sliceName || 'global', name]),
    level: 'L3',
    type,
    name,
    attrs: {
      filePath,
      parentName: sliceName || 'global',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
