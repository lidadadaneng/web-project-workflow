/**
 * uni-app 解析器
 *
 * 解析 uni-app 项目结构和源码，提取：
 * - uni-page 节点（L2）：uni-app 页面（基于 pages.json）
 * - 扩展属性：platform 条件编译标记、uni-app 生命周期
 *
 * uni-app 项目本身是 Vue 项目，基础的文件/元素解析由 Vue 解析器完成。
 * 本解析器专注于 uni-app 特有的结构和 API。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GraphNode, GraphEdge } from '../types';
import {
  NODE_TYPE_UNI_PAGE,
  EDGE_TYPE_CONTAIN,
  EDGE_TYPE_NAVIGATE,
} from '../types';
import { generateNodeId } from '../builders/node-builder';

/** uni-app 解析结果 */
export interface UniappParseResult {
  /** 页面节点列表（L2） */
  pages: GraphNode[];
  /** 页面的子元素节点（L3，如生命周期方法等） */
  elements: GraphNode[];
  /** contain 边 */
  containEdges: GraphEdge[];
  /** navigate 边 */
  navigateEdges: GraphEdge[];
}

// ==================== 项目识别 ====================

/**
 * 判断项目是否为 uni-app 项目
 */
export function isUniappProject(root: string): boolean {
  const pagesJson = path.join(root, 'pages.json');
  const manifestJson = path.join(root, 'manifest.json');
  const srcAppVue = path.join(root, 'src', 'App.vue');
  const rootAppVue = path.join(root, 'App.vue');
  const packageJsonPath = path.join(root, 'package.json');
  const mainJs = path.join(root, 'main.js');
  const uniScss = path.join(root, 'uni.scss');

  if (!fs.existsSync(pagesJson)) return false;

  // 方式1：pages.json + manifest.json（uni-app 标准结构，CLI 或 HBuilderX）
  if (fs.existsSync(manifestJson)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestJson, 'utf-8'));
      // manifest.json 中有 uni-app 特有的字段
      if (
        manifest.name ||
        manifest.appid ||
        manifest['mp-weixin'] ||
        manifest['mp-alipay'] ||
        manifest.h5 ||
        manifest['app-plus'] ||
        manifest.quickapp
      ) {
        return true;
      }
    } catch {
      // 解析失败，继续检查其他方式
    }
  }

  // 方式2：检查 package.json 中的 @dcloudio 依赖（CLI 项目）
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      for (const key of Object.keys(deps)) {
        if (key.startsWith('@dcloudio/')) return true;
      }
    } catch {
      // 忽略
    }
  }

  // 方式3：HBuilderX 风格：pages.json + App.vue + main.js + uni.scss（根目录）
  if (
    fs.existsSync(rootAppVue) &&
    fs.existsSync(mainJs) &&
    fs.existsSync(uniScss)
  ) {
    return true;
  }

  // 方式4：CLI 项目：pages.json + src/App.vue
  if (fs.existsSync(srcAppVue)) {
    return true;
  }

  return false;
}

// ==================== pages.json 解析 ====================

interface PageInfo {
  /** 页面路径 */
  path: string;
  /** 页面标题 */
  title?: string;
  /** 是否 tabBar 页面 */
  isTabBar: boolean;
  /** 所属分包名（如果是分包页面） */
  subPackage?: string;
}

function parsePagesJson(root: string): PageInfo[] {
  const pagesJsonPath = path.join(root, 'pages.json');
  if (!fs.existsSync(pagesJsonPath)) return [];

  try {
    const content = fs.readFileSync(pagesJsonPath, 'utf-8');
    // pages.json 可能包含注释（json5 风格），做简单清理
    const cleanContent = content
      .replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const json = JSON.parse(cleanContent);

    const pages: PageInfo[] = [];
    const tabBarPages = new Set<string>();

    // 收集 tabBar 页面
    if (json.tabBar && Array.isArray(json.tabBar.list)) {
      for (const item of json.tabBar.list) {
        if (item.pagePath) tabBarPages.add(item.pagePath);
      }
    }

    // 主包页面
    if (Array.isArray(json.pages)) {
      for (const page of json.pages) {
        const pagePath = typeof page === 'string' ? page : page.path;
        if (!pagePath) continue;
        pages.push({
          path: pagePath,
          title: page.style?.navigationBarTitleText || json.globalStyle?.navigationBarTitleText,
          isTabBar: tabBarPages.has(pagePath),
        });
      }
    }

    // 分包页面
    if (Array.isArray(json.subPackages)) {
      for (const pkg of json.subPackages) {
        const pkgRoot = pkg.root || '';
        const pkgName = pkg.name || pkgRoot;
        if (Array.isArray(pkg.pages)) {
          for (const page of pkg.pages) {
            const pagePath = typeof page === 'string' ? page : page.path;
            if (!pagePath) continue;
            const fullPath = pkgRoot ? `${pkgRoot}/${pagePath}` : pagePath;
            pages.push({
              path: fullPath,
              title: page.style?.navigationBarTitleText,
              isTabBar: false,
              subPackage: pkgName,
            });
          }
        }
      }
    }

    return pages;
  } catch {
    return [];
  }
}

// ==================== uni.* API 调用识别 ====================

const UNI_NAVIGATE_METHODS = [
  'navigateTo', 'redirectTo', 'switchTab', 'reLaunch', 'navigateBack',
];

interface NavigateCall {
  method: string;
  url: string;
}

/**
 * 从源码中提取 uni.navigateTo 等路由调用
 */
export function extractUniNavigateCalls(source: string): NavigateCall[] {
  const results: NavigateCall[] = [];

  for (const method of UNI_NAVIGATE_METHODS) {
    // 匹配 uni.navigateTo({ url: 'xxx' })
    const regex = new RegExp(`uni\\.${method}\\s*\\(\\s*\\{[^}]*url\\s*:\\s*['"]([^'"]+)['"]`, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(source)) !== null) {
      results.push({ method, url: match[1] });
    }
  }

  return results;
}

// ==================== 条件编译识别 ====================

const CONDITIONAL_COMPILE_PLATFORMS = [
  'MP-WEIXIN', 'MP-ALIPAY', 'MP-BAIDU', 'MP-TOUTIAO', 'MP-QQ', 'MP-KUAISHOU',
  'APP-PLUS', 'APP-NVUE', 'H5', 'WEB',
  'VUE3', 'VUE2',
];

/**
 * 从源码中提取条件编译块涉及的平台
 */
export function extractConditionalCompilePlatforms(source: string): string[] {
  const platforms = new Set<string>();

  // 匹配 #ifdef MP-WEIXIN 或 #ifndef H5 或 #ifdef MP-WEIXIN || MP-ALIPAY
  const regex = /#(?:ifdef|ifndef)\s+(.+?)\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(source)) !== null) {
    const expr = match[1].trim();
    // 用 || && 等分隔符拆分
    const parts = expr.split(/\s*(?:\|\||&&)\s*/);
    for (const p of parts) {
      const trimmed = p.trim().toUpperCase();
      if (CONDITIONAL_COMPILE_PLATFORMS.includes(trimmed)) {
        platforms.add(trimmed);
      }
    }
  }

  return Array.from(platforms);
}

// ==================== 页面生命周期识别 ====================

const UNI_PAGE_LIFECYCLES = new Set([
  // 页面生命周期
  'onLoad', 'onShow', 'onReady', 'onHide', 'onUnload',
  'onPullDownRefresh', 'onReachBottom', 'onShareAppMessage',
  'onShareTimeline', 'onAddToFavorites', 'onPageScroll',
  'onResize', 'onTabItemTap',
  // 应用级生命周期（App.vue 中）
  'onLaunch', 'onError', 'onPageNotFound', 'onUnhandledRejection',
  'onThemeChange',
]);

/**
 * 判断方法名是否为 uni-app 页面生命周期
 */
export function isUniPageLifecycle(methodName: string): boolean {
  return UNI_PAGE_LIFECYCLES.has(methodName);
}

// ==================== 全量解析入口 ====================

/**
 * 解析 uni-app 项目
 */
export function parseUniappProject(root: string): UniappParseResult {
  const result: UniappParseResult = {
    pages: [],
    elements: [],
    containEdges: [],
    navigateEdges: [],
  };

  const pageInfos = parsePagesJson(root);
  if (pageInfos.length === 0) return result;

  const pageNodeMap = new Map<string, GraphNode>(); // 页面路径 → 节点

  // 生成页面节点
  for (const pageInfo of pageInfos) {
    // 查找对应的 .vue 文件
    const vuePath = path.join('src', pageInfo.path + '.vue');
    const fullVuePath = path.join(root, vuePath);
    const vueExists = fs.existsSync(fullVuePath);

    // uni-app 项目的页面一般在 src/ 下
    const filePath = vueExists ? vuePath : pageInfo.path + '.vue';

    const pageName = pageInfo.path.split('/').pop() || pageInfo.path;

    const pageNode: GraphNode = {
      id: generateNodeId('uni-page', [pageInfo.path]),
      level: 'L2',
      type: NODE_TYPE_UNI_PAGE,
      name: pageName,
      attrs: {
        filePath,
        pagePath: pageInfo.path,
        pageTitle: pageInfo.title,
        isTabBar: pageInfo.isTabBar,
        subPackage: pageInfo.subPackage,
        platform: 'uni-app',
        tags: ['uni-app', 'page'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    result.pages.push(pageNode);
    pageNodeMap.set(pageInfo.path, pageNode);
  }

  // 扫描所有页面的 .vue 文件，提取导航调用和条件编译信息
  for (const pageInfo of pageInfos) {
    const pageNode = pageNodeMap.get(pageInfo.path);
    if (!pageNode) continue;

    // 尝试读取页面 .vue 文件
    const vueCandidates = [
      path.join(root, 'src', pageInfo.path + '.vue'),
      path.join(root, pageInfo.path + '.vue'),
    ];

    let vueSource = '';
    for (const vp of vueCandidates) {
      if (fs.existsSync(vp)) {
        vueSource = fs.readFileSync(vp, 'utf-8');
        break;
      }
    }

    if (!vueSource) continue;

    // 提取条件编译平台
    const platforms = extractConditionalCompilePlatforms(vueSource);
    if (platforms.length > 0) {
      pageNode.attrs.platform = `uni-app (${platforms.join(', ')})`;
    }

    // 提取路由跳转
    const navCalls = extractUniNavigateCalls(vueSource);
    for (const nav of navCalls) {
      let targetPath = nav.url;
      // 去掉参数
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

  return result;
}
