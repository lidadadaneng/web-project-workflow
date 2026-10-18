/**
 * 微信小程序解析器
 *
 * 解析微信小程序项目结构和源码，提取：
 * - mp-app 节点（L1）：App 实例
 * - mp-page 节点（L2）：小程序页面
 * - mp-component 节点（L2）：自定义组件
 * - mp-method / mp-lifecycle / mp-data / mp-property（L3）：页面/组件内部元素
 *
 * 解析对象：
 * - app.json / app.js / app.wxss / project.config.json
 * - 页面 .js / .wxml / .json / .wxss
 * - 组件 .js / .wxml / .json / .wxss
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GraphNode, GraphEdge } from '../types';
import {
  NODE_TYPE_MP_APP,
  NODE_TYPE_MP_PAGE,
  NODE_TYPE_MP_COMPONENT,
  NODE_TYPE_MP_METHOD,
  NODE_TYPE_MP_LIFECYCLE,
  NODE_TYPE_MP_DATA,
  NODE_TYPE_MP_PROPERTY,
  EDGE_TYPE_CONTAIN,
  EDGE_TYPE_NAVIGATE,
  EDGE_TYPE_USE_COMPONENT,
  EDGE_TYPE_BIND_EVENT,
  EDGE_TYPE_BIND_DATA,
} from '../types';
import { generateNodeId } from '../builders/node-builder';

/** 小程序解析结果 */
export interface MiniprogramParseResult {
  /** App 节点（L1） */
  appNode?: GraphNode;
  /** 页面节点列表（L2） */
  pages: GraphNode[];
  /** 组件节点列表（L2） */
  components: GraphNode[];
  /** 页面/组件的子元素（L3） */
  elements: GraphNode[];
  /** contain 边：page/component → method/lifecycle/data/property */
  containEdges: GraphEdge[];
  /** navigate 边：页面 → 页面 */
  navigateEdges: GraphEdge[];
  /** use-component 边：页面/组件 → 子组件 */
  useComponentEdges: GraphEdge[];
  /** bind-event 边：模板元素 → 方法 */
  bindEventEdges: GraphEdge[];
  /** bind-data 边：模板元素 → data/property */
  bindDataEdges: GraphEdge[];
}

// ==================== 项目识别 ====================

/**
 * 判断项目根目录是否为微信小程序项目
 */
export function isMiniprogramProject(root: string): boolean {
  const appJson = path.join(root, 'app.json');
  const appJs = path.join(root, 'app.js');
  const projectConfig = path.join(root, 'project.config.json');

  // 同时存在 app.json 和 app.js，或存在 project.config.json + app.json
  if (!fs.existsSync(appJson)) return false;
  if (fs.existsSync(appJs) && fs.existsSync(projectConfig)) return true;

  // 检查 app.json 是否包含 pages 字段（小程序特征）
  try {
    const content = fs.readFileSync(appJson, 'utf-8');
    const json = JSON.parse(content);
    return Array.isArray(json.pages) && json.pages.length > 0;
  } catch {
    return false;
  }
}

// ==================== app.json 解析 ====================

interface AppJsonConfig {
  pages: string[];
  tabBarPages: string[];
  subPackages: Array<{ root: string; pages: string[]; name?: string }>;
  window: Record<string, any>;
}

function parseAppJson(root: string): AppJsonConfig | null {
  const appJsonPath = path.join(root, 'app.json');
  if (!fs.existsSync(appJsonPath)) return null;

  try {
    const content = fs.readFileSync(appJsonPath, 'utf-8');
    const json = JSON.parse(content);

    const pages: string[] = json.pages || [];
    const tabBarPages: string[] = [];

    if (json.tabBar && Array.isArray(json.tabBar.list)) {
      for (const item of json.tabBar.list) {
        if (item.pagePath) tabBarPages.push(item.pagePath);
      }
    }

    const subPackages: Array<{ root: string; pages: string[]; name?: string }> = [];
    if (Array.isArray(json.subPackages)) {
      for (const pkg of json.subPackages) {
        if (pkg.root && Array.isArray(pkg.pages)) {
          subPackages.push({
            root: pkg.root,
            pages: pkg.pages,
            name: pkg.name || pkg.root,
          });
        }
      }
    }

    return {
      pages,
      tabBarPages,
      subPackages,
      window: json.window || {},
    };
  } catch {
    return null;
  }
}

// ==================== app.js 解析 ====================

interface AppInfo {
  globalDataKeys: string[];
  lifecycleMethods: string[];
}

const APP_LIFECYCLE_METHODS = new Set([
  'onLaunch', 'onShow', 'onHide', 'onError', 'onPageNotFound', 'onUnhandledRejection',
]);

function parseAppJs(root: string): AppInfo {
  const appJsPath = path.join(root, 'app.js');
  if (!fs.existsSync(appJsPath)) {
    return { globalDataKeys: [], lifecycleMethods: [] };
  }

  const source = fs.readFileSync(appJsPath, 'utf-8');
  const result: AppInfo = { globalDataKeys: [], lifecycleMethods: [] };

  // 提取 App({...}) 的内容
  const appMatch = source.match(/App\s*\(\s*\{/);
  if (!appMatch) return result;

  const braceStart = source.indexOf('{', appMatch.index);
  const appContent = extractBalancedBraces(source.slice(braceStart));
  if (!appContent) return result;

  // 提取 globalData 的键
  const globalDataObj = extractNestedObject(appContent, 'globalData');
  if (globalDataObj) {
    result.globalDataKeys = extractFirstLevelKeys(globalDataObj);
  }

  // 提取生命周期方法
  const topLevelKeys = extractFirstLevelKeys(appContent);
  for (const key of topLevelKeys) {
    if (APP_LIFECYCLE_METHODS.has(key)) {
      result.lifecycleMethods.push(key);
    }
  }

  return result;
}

// ==================== 页面/组件 JS 解析 ====================

interface PageComponentInfo {
  /** 页面/组件类型 */
  kind: 'page' | 'component';
  /** data 字段名 */
  dataKeys: string[];
  /** 方法名 */
  methods: string[];
  /** 生命周期方法 */
  lifecycleMethods: Array<{ name: string; type: string }>;
  /** 组件 properties（组件特有） */
  properties: string[];
  /** 路由跳转调用 */
  navigateCalls: Array<{ method: string; url: string }>;
}

const PAGE_LIFECYCLE = new Set([
  'onLoad', 'onShow', 'onReady', 'onHide', 'onUnload',
  'onPullDownRefresh', 'onReachBottom', 'onShareAppMessage',
  'onShareTimeline', 'onAddToFavorites', 'onPageScroll',
  'onResize', 'onTabItemTap',
]);

const COMPONENT_LIFECYCLE = new Set([
  'created', 'attached', 'ready', 'moved', 'detached', 'error',
]);

/**
 * 解析小程序页面或组件的 JS 文件
 */
export function parseMiniprogramJs(filePath: string): PageComponentInfo | null {
  if (!fs.existsSync(filePath)) return null;

  const source = fs.readFileSync(filePath, 'utf-8');

  // 判断是 Page 还是 Component
  const isPage = /Page\s*\(/.test(source);
  const isComponent = /Component\s*\(/.test(source);

  if (!isPage && !isComponent) return null;

  const kind: 'page' | 'component' = isComponent ? 'component' : 'page';
  const pattern = isComponent ? /Component\s*\(\s*\{/ : /Page\s*\(\s*\{/;
  const match = source.match(pattern);
  if (!match) return null;

  const braceStart = source.indexOf('{', match.index);
  const objContent = extractBalancedBraces(source.slice(braceStart));
  if (!objContent) return null;

  const result: PageComponentInfo = {
    kind,
    dataKeys: [],
    methods: [],
    lifecycleMethods: [],
    properties: [],
    navigateCalls: [],
  };

  // 提取 data 键
  const dataObj = extractNestedObject(objContent, 'data');
  if (dataObj) {
    result.dataKeys = extractFirstLevelKeys(dataObj);
  }

  if (kind === 'component') {
    // 组件：提取 properties
    const propsObj = extractNestedObject(objContent, 'properties');
    if (propsObj) {
      result.properties = extractFirstLevelKeys(propsObj);
    }

    // 组件：提取 methods 中的方法
    const methodsObj = extractNestedObject(objContent, 'methods');
    if (methodsObj) {
      result.methods = extractFirstLevelKeys(methodsObj);
    }

    // 组件：提取 lifetimes 中的生命周期
    const lifetimesObj = extractNestedObject(objContent, 'lifetimes');
    if (lifetimesObj) {
      const lifetimeKeys = extractFirstLevelKeys(lifetimesObj);
      for (const key of lifetimeKeys) {
        if (COMPONENT_LIFECYCLE.has(key)) {
          result.lifecycleMethods.push({ name: key, type: 'component' });
        }
      }
    }

    // 组件顶级生命周期（旧写法）
    const topKeys = extractFirstLevelKeys(objContent);
    for (const key of topKeys) {
      if (COMPONENT_LIFECYCLE.has(key)) {
        if (!result.lifecycleMethods.some((l) => l.name === key)) {
          result.lifecycleMethods.push({ name: key, type: 'component' });
        }
      }
    }
  } else {
    // 页面：顶级方法既可能是普通方法，也可能是生命周期
    const topKeys = extractFirstLevelKeys(objContent);
    for (const key of topKeys) {
      if (key === 'data') continue;
      if (PAGE_LIFECYCLE.has(key)) {
        result.lifecycleMethods.push({ name: key, type: 'page' });
      } else {
        result.methods.push(key);
      }
    }
  }

  // 提取路由跳转调用
  result.navigateCalls = extractNavigateCalls(source);

  return result;
}

/** 提取 wx.navigateTo 等路由跳转调用 */
function extractNavigateCalls(source: string): Array<{ method: string; url: string }> {
  const results: Array<{ method: string; url: string }> = [];
  const methods = [
    'navigateTo', 'redirectTo', 'switchTab', 'reLaunch',
    'navigateBack',
  ];

  for (const method of methods) {
    const regex = new RegExp(`wx\\.${method}\\s*\\(\\s*\\{[^}]*url\\s*:\\s*['"]([^'"]+)['"]`, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      results.push({ method, url: match[1] });
    }
  }

  return results;
}

// ==================== WXML 解析 ====================

interface WxmlInfo {
  /** 使用的自定义组件标签（不含内置组件） */
  customComponents: string[];
  /** 事件绑定：事件名 → 处理方法名 */
  eventBindings: Array<{ event: string; handler: string }>;
  /** 数据绑定：绑定路径 */
  dataBindings: string[];
  /** 内置组件列表（去重） */
  builtinComponents: string[];
}

// 微信小程序内置组件（部分常用）
const BUILTIN_COMPONENTS = new Set([
  'view', 'text', 'image', 'button', 'input', 'form', 'label',
  'textarea', 'scroll-view', 'swiper', 'swiper-item', 'movable-view',
  'movable-area', 'cover-view', 'cover-image', 'icon', 'progress',
  'rich-text', 'slider', 'switch', 'navigator', 'audio', 'video',
  'camera', 'live-player', 'live-pusher', 'map', 'canvas',
  'open-data', 'web-view', 'picker', 'picker-view', 'picker-view-column',
  'radio', 'radio-group', 'checkbox', 'checkbox-group',
  'editor', 'match-media', 'page-container', 'share-element',
  'ad', 'ad-custom', 'official-account', 'subscribe-message',
]);

/**
 * 解析 WXML 模板文件
 */
export function parseWxml(filePath: string): WxmlInfo {
  if (!fs.existsSync(filePath)) {
    return { customComponents: [], eventBindings: [], dataBindings: [], builtinComponents: [] };
  }

  const source = fs.readFileSync(filePath, 'utf-8');
  return parseWxmlSource(source);
}

/** 解析 WXML 源码文本 */
export function parseWxmlSource(source: string): WxmlInfo {
  const result: WxmlInfo = {
    customComponents: [],
    eventBindings: [],
    dataBindings: [],
    builtinComponents: [],
  };

  const seenComponents = new Set<string>();
  const seenBuiltins = new Set<string>();

  // 匹配标签 <tagname ...> 和 </tagname>
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(source)) !== null) {
    const tagName = match[1];
    const attrsStr = match[2] || '';

    // 组件分类
    if (BUILTIN_COMPONENTS.has(tagName)) {
      if (!seenBuiltins.has(tagName)) {
        seenBuiltins.add(tagName);
        result.builtinComponents.push(tagName);
      }
    } else {
      if (!seenComponents.has(tagName)) {
        seenComponents.add(tagName);
        result.customComponents.push(tagName);
      }
    }

    // 事件绑定 bind:xxx / catch:xxx / bindxxx / catchxxx
    const eventRegex = /\b(?:bind|catch)(?::)?([a-zA-Z][a-zA-Z0-9-]*)\s*=\s*['"]([^'"]+)['"]/g;
    let eventMatch: RegExpExecArray | null;
    while ((eventMatch = eventRegex.exec(attrsStr)) !== null) {
      result.eventBindings.push({
        event: eventMatch[1],
        handler: eventMatch[2],
      });
    }

  // 数据绑定 {{ xxx }}（属性值中的）
  const dataRegex = /\{\{\s*([^{}]+?)\s*\}\}/g;
  let dataMatch: RegExpExecArray | null;
  while ((dataMatch = dataRegex.exec(attrsStr)) !== null) {
    const expr = dataMatch[1].trim();
    // 提取顶层字段名（去掉 . 后面的、过滤表达式）
    const fieldMatch = expr.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
    if (fieldMatch) {
      const field = fieldMatch[1];
      if (!result.dataBindings.includes(field)) {
        result.dataBindings.push(field);
      }
    }
  }
}

// 文本内容中的数据绑定（标签之间的 {{ xxx }}）
const textDataRegex = />\s*\{\{\s*([^{}]+?)\s*\}\}\s*</g;
let textMatch: RegExpExecArray | null;
while ((textMatch = textDataRegex.exec(source)) !== null) {
  const expr = textMatch[1].trim();
  const fieldMatch = expr.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)/);
  if (fieldMatch) {
    const field = fieldMatch[1];
    if (!result.dataBindings.includes(field)) {
      result.dataBindings.push(field);
    }
  }
}

  return result;
}

// ==================== 小程序 JSON 配置解析 ====================

interface PageJsonConfig {
  /** 使用的自定义组件：组件名 → 路径 */
  usingComponents: Record<string, string>;
  /** 页面标题 */
  navigationBarTitleText?: string;
}

function parsePageJson(filePath: string): PageJsonConfig {
  if (!fs.existsSync(filePath)) {
    return { usingComponents: {} };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);
    return {
      usingComponents: json.usingComponents || {},
      navigationBarTitleText: json.navigationBarTitleText,
    };
  } catch {
    return { usingComponents: {} };
  }
}

// ==================== 全量解析入口 ====================

/**
 * 解析整个小程序项目
 */
export function parseMiniprogramProject(root: string): MiniprogramParseResult {
  const result: MiniprogramParseResult = {
    pages: [],
    components: [],
    elements: [],
    containEdges: [],
    navigateEdges: [],
    useComponentEdges: [],
    bindEventEdges: [],
    bindDataEdges: [],
  };

  const appConfig = parseAppJson(root);
  if (!appConfig) return result;

  const appInfo = parseAppJs(root);

  // 构建 App 节点（L1）
  const appNode: GraphNode = {
    id: generateNodeId('mp-app', ['app']),
    level: 'L1',
    type: NODE_TYPE_MP_APP,
    name: 'app',
    attrs: {
      description: '微信小程序 App 实例',
      tags: ['miniprogram', 'mp-weixin'],
      platform: 'mp-weixin',
      pagePath: appConfig.pages[0] || '',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  result.appNode = appNode;

  // 用于存储所有页面/组件的映射：路径 → 节点
  const pageNodeMap = new Map<string, GraphNode>();
  const componentNodeMap = new Map<string, GraphNode>();

  // 所有页面路径（主包 + 分包）
  const allPages: Array<{ path: string; subPackage?: string; isTabBar: boolean }> = [];

  for (const pagePath of appConfig.pages) {
    allPages.push({
      path: pagePath,
      isTabBar: appConfig.tabBarPages.includes(pagePath),
    });
  }

  for (const pkg of appConfig.subPackages) {
    for (const subPage of pkg.pages) {
      const fullPath = `${pkg.root}/${subPage}`;
      allPages.push({
        path: fullPath,
        subPackage: pkg.name || pkg.root,
        isTabBar: false,
      });
    }
  }

  // 解析每个页面
  for (const pageInfo of allPages) {
    const pageJsPath = path.join(root, pageInfo.path + '.js');
    const pageWxmlPath = path.join(root, pageInfo.path + '.wxml');
    const pageJsonPath = path.join(root, pageInfo.path + '.json');

    const pageName = pageInfo.path.split('/').pop() || pageInfo.path;
    const pageTitle = parsePageJson(pageJsonPath).navigationBarTitleText || pageName;

    const pageNode: GraphNode = {
      id: generateNodeId('mp-page', [pageInfo.path]),
      level: 'L2',
      type: NODE_TYPE_MP_PAGE,
      name: pageName,
      attrs: {
        filePath: pageInfo.path + '.js',
        pagePath: pageInfo.path,
        pageTitle,
        platform: 'mp-weixin',
        isTabBar: pageInfo.isTabBar,
        subPackage: pageInfo.subPackage,
        tags: ['miniprogram', 'page'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    result.pages.push(pageNode);
    pageNodeMap.set(pageInfo.path, pageNode);

    // 解析页面 JS
    const jsInfo = parseMiniprogramJs(pageJsPath);
    if (jsInfo) {
      buildPageComponentElements(result, pageNode, jsInfo);
    }

    // 解析 WXML
    const wxmlInfo = parseWxml(pageWxmlPath);
    pageNode.attrs.builtinComponents = wxmlInfo.builtinComponents;
    pageNode.attrs.componentJsonPath = pageInfo.path + '.json';

    // 解析页面 json，获取 usingComponents
    const jsonConfig = parsePageJson(pageJsonPath);

    // 生成 use-component 边
    for (const [compName, compPath] of Object.entries(jsonConfig.usingComponents)) {
      // 解析组件路径，找到对应组件文件
      const compAbsPath = resolveComponentPath(root, pageInfo.path, compPath);
      if (compAbsPath) {
        // 确保组件已被注册
        let compNode = componentNodeMap.get(compAbsPath);
        if (!compNode) {
          compNode = createComponentNode(root, compAbsPath);
          result.components.push(compNode);
          componentNodeMap.set(compAbsPath, compNode);
        }
        result.useComponentEdges.push({
          id: `${pageNode.id}-use-component-${compNode.id}`,
          from: pageNode.id,
          to: compNode.id,
          type: EDGE_TYPE_USE_COMPONENT,
          weight: 0.8,
          source: 'structure',
        });
      }
    }

    // 生成 bind-event / bind-data 边
    buildWxmlEdges(result, pageNode, wxmlInfo, jsInfo);
  }

  // 生成 navigate 边（扫描所有页面 JS 中的路由调用）
  for (const pageInfo of allPages) {
    const pageNode = pageNodeMap.get(pageInfo.path);
    if (!pageNode) continue;

    const pageJsPath = path.join(root, pageInfo.path + '.js');
    const jsInfo = parseMiniprogramJs(pageJsPath);
    if (!jsInfo) continue;

    for (const nav of jsInfo.navigateCalls) {
      let targetPath = nav.url;
      // 去掉参数部分 ?key=value
      const qIndex = targetPath.indexOf('?');
      if (qIndex !== -1) targetPath = targetPath.slice(0, qIndex);

      // 去掉开头的 /
      if (targetPath.startsWith('/')) targetPath = targetPath.slice(1);

      const targetNode = pageNodeMap.get(targetPath);
      if (targetNode) {
        result.navigateEdges.push({
          id: `${pageNode.id}-navigate-${nav.method}-${targetNode.id}`,
          from: pageNode.id,
          to: targetNode.id,
          type: EDGE_TYPE_NAVIGATE,
          weight: 0.7,
          source: 'structure',
          method: nav.method,
        });
      }
    }
  }

  // 解析所有组件的内部结构
  for (const [compPath, compNode] of componentNodeMap) {
    const compJsPath = path.join(root, compPath + '.js');
    const jsInfo = parseMiniprogramJs(compJsPath);
    if (jsInfo) {
      buildPageComponentElements(result, compNode, jsInfo);
    }

    // 组件也可能包含子组件（递归）
    const compJsonPath = path.join(root, compPath + '.json');
    const jsonConfig = parsePageJson(compJsonPath);
    const compWxmlPath = path.join(root, compPath + '.wxml');
    const wxmlInfo = parseWxml(compWxmlPath);
    compNode.attrs.builtinComponents = wxmlInfo.builtinComponents;

    for (const [childName, childPath] of Object.entries(jsonConfig.usingComponents)) {
      const childAbsPath = resolveComponentPath(root, compPath, childPath);
      if (childAbsPath) {
        let childNode = componentNodeMap.get(childAbsPath);
        if (!childNode) {
          childNode = createComponentNode(root, childAbsPath);
          result.components.push(childNode);
          componentNodeMap.set(childAbsPath, childNode);
        }
        result.useComponentEdges.push({
          id: `${compNode.id}-use-component-${childNode.id}`,
          from: compNode.id,
          to: childNode.id,
          type: EDGE_TYPE_USE_COMPONENT,
          weight: 0.8,
          source: 'structure',
        });
      }
    }

    buildWxmlEdges(result, compNode, wxmlInfo, jsInfo);
  }

  return result;
}

// ==================== 辅助函数 ====================

/** 解析组件路径（处理相对路径和绝对路径） */
function resolveComponentPath(
  root: string,
  basePath: string,
  compPath: string,
): string | null {
  let resolved: string;

  if (compPath.startsWith('/')) {
    // 绝对路径（相对于项目根）
    resolved = compPath.slice(1);
  } else if (compPath.startsWith('./') || compPath.startsWith('../')) {
    // 相对路径（相对于页面/组件所在目录）
    const baseDir = path.dirname(basePath);
    resolved = path.posix.join(baseDir, compPath).replace(/\\/g, '/');
  } else {
    // 可能是 npm 包或其他，暂时跳过
    return null;
  }

  // 检查是否存在对应的 .js 文件
  const jsPath = path.join(root, resolved + '.js');
  if (fs.existsSync(jsPath)) return resolved;

  return null;
}

/** 创建组件节点 */
function createComponentNode(root: string, compPath: string): GraphNode {
  const compName = compPath.split('/').pop() || compPath;
  return {
    id: generateNodeId('mp-component', [compPath]),
    level: 'L2',
    type: NODE_TYPE_MP_COMPONENT,
    name: compName,
    attrs: {
      filePath: compPath + '.js',
      pagePath: compPath,
      platform: 'mp-weixin',
      tags: ['miniprogram', 'component'],
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/** 为页面/组件构建子元素节点和 contain 边 */
function buildPageComponentElements(
  result: MiniprogramParseResult,
  parentNode: GraphNode,
  info: PageComponentInfo,
): void {
  // data 节点
  for (const key of info.dataKeys) {
    const dataNode: GraphNode = {
      id: generateNodeId('mp-data', [parentNode.attrs.pagePath || parentNode.name, key]),
      level: 'L3',
      type: NODE_TYPE_MP_DATA,
      name: key,
      attrs: {
        filePath: parentNode.attrs.filePath,
        parentName: parentNode.name,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    result.elements.push(dataNode);
    result.containEdges.push({
      id: `${parentNode.id}-contain-${dataNode.id}`,
      from: parentNode.id,
      to: dataNode.id,
      type: EDGE_TYPE_CONTAIN,
      weight: 1.0,
      source: 'structure',
    });
  }

  // property 节点（组件特有）
  for (const key of info.properties) {
    const propNode: GraphNode = {
      id: generateNodeId('mp-property', [parentNode.attrs.pagePath || parentNode.name, key]),
      level: 'L3',
      type: NODE_TYPE_MP_PROPERTY,
      name: key,
      attrs: {
        filePath: parentNode.attrs.filePath,
        parentName: parentNode.name,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    result.elements.push(propNode);
    result.containEdges.push({
      id: `${parentNode.id}-contain-${propNode.id}`,
      from: parentNode.id,
      to: propNode.id,
      type: EDGE_TYPE_CONTAIN,
      weight: 1.0,
      source: 'structure',
    });
  }

  // 方法节点
  for (const methodName of info.methods) {
    const methodNode: GraphNode = {
      id: generateNodeId('mp-method', [parentNode.attrs.pagePath || parentNode.name, methodName]),
      level: 'L3',
      type: NODE_TYPE_MP_METHOD,
      name: methodName,
      attrs: {
        filePath: parentNode.attrs.filePath,
        parentName: parentNode.name,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    result.elements.push(methodNode);
    result.containEdges.push({
      id: `${parentNode.id}-contain-${methodNode.id}`,
      from: parentNode.id,
      to: methodNode.id,
      type: EDGE_TYPE_CONTAIN,
      weight: 1.0,
      source: 'structure',
    });
  }

  // 生命周期节点
  for (const lc of info.lifecycleMethods) {
    const lcNode: GraphNode = {
      id: generateNodeId('mp-lifecycle', [parentNode.attrs.pagePath || parentNode.name, lc.name]),
      level: 'L3',
      type: NODE_TYPE_MP_LIFECYCLE,
      name: lc.name,
      attrs: {
        filePath: parentNode.attrs.filePath,
        parentName: parentNode.name,
        lifecycleType: lc.type,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    result.elements.push(lcNode);
    result.containEdges.push({
      id: `${parentNode.id}-contain-${lcNode.id}`,
      from: parentNode.id,
      to: lcNode.id,
      type: EDGE_TYPE_CONTAIN,
      weight: 1.0,
      source: 'structure',
    });
  }
}

/** 构建 WXML 相关的边（bind-event / bind-data） */
function buildWxmlEdges(
  result: MiniprogramParseResult,
  parentNode: GraphNode,
  wxmlInfo: WxmlInfo,
  jsInfo: PageComponentInfo | null,
): void {
  const allMethodNames = jsInfo
    ? [...jsInfo.methods, ...jsInfo.lifecycleMethods.map((l) => l.name)]
    : [];

  // bind-event 边
  for (const binding of wxmlInfo.eventBindings) {
    // 找到对应的方法节点
    const methodName = binding.handler;
    // 处理可能的参数形式，如 handlerName(data)
    const plainName = methodName.replace(/\(.*\)/, '');
    if (allMethodNames.includes(plainName)) {
      result.bindEventEdges.push({
        id: `${parentNode.id}-bind-event-${binding.event}-${plainName}`,
        from: parentNode.id,
        to: generateNodeId('mp-method', [parentNode.attrs.pagePath || parentNode.name, plainName]),
        type: EDGE_TYPE_BIND_EVENT,
        weight: 0.9,
        source: 'structure',
        eventName: binding.event,
      });
    }
  }

  // bind-data 边
  const allDataNames = jsInfo ? jsInfo.dataKeys : [];
  const allPropNames = jsInfo ? jsInfo.properties : [];
  const allDataFields = [...allDataNames, ...allPropNames];

  for (const field of wxmlInfo.dataBindings) {
    if (allDataFields.includes(field)) {
      const isProperty = allPropNames.includes(field);
      const elemType = isProperty ? 'mp-property' : 'mp-data';
      result.bindDataEdges.push({
        id: `${parentNode.id}-bind-data-${field}`,
        from: parentNode.id,
        to: generateNodeId(elemType, [parentNode.attrs.pagePath || parentNode.name, field]),
        type: EDGE_TYPE_BIND_DATA,
        weight: 0.85,
        source: 'structure',
        bindPath: field,
      });
    }
  }
}

// ==================== 文本扫描工具（复用自 vuex/redux parser） ====================

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
