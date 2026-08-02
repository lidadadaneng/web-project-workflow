/**
 * 模块目录解析器
 *
 * 基于源码目录结构自动推断 L2 业务模块节点。
 * 支持前后端自动区分，通用目录排除。
 * 可被用户配置的 modules 列表覆盖。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GraphNode, ModuleSide, GraphConfig, ManualModuleDef } from '../types';
import { NODE_TYPE_MODULE } from '../types';
import { generateNodeId } from '../builders/node-builder';
import { isFrontend, isBackend, ProjectType } from '../../lib/project-type';

/** 解析出的模块信息 */
export interface ParsedModule {
  node: GraphNode;
  /** 模块目录（相对项目根） */
  dir: string;
}

/**
 * 解析项目中的业务模块
 *
 * @param root 项目根目录
 * @param config 图谱配置
 * @param projectType 项目类型
 * @returns 解析出的模块列表
 */
export function parseModules(
  root: string,
  config: GraphConfig,
  projectType: ProjectType,
): ParsedModule[] {
  // 如果用户手动配置了模块，优先使用
  if (config.modules && config.modules.length > 0) {
    return buildManualModules(root, config.modules);
  }

  // 自动推断
  return autoDetectModules(root, config, projectType);
}

// ==================== 手动配置模块 ====================

function buildManualModules(
  root: string,
  modules: ManualModuleDef[],
): ParsedModule[] {
  const result: ParsedModule[] = [];

  for (const m of modules) {
    const side = m.side ?? 'unknown';
    const dir = m.dir ?? '';

    const node: GraphNode = {
      id: generateNodeId('mod', [m.name, side]),
      level: 'L1',
      type: NODE_TYPE_MODULE,
      name: m.name,
      attrs: {
        side,
        dir,
        description: m.description,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    result.push({ node, dir });
  }

  return result;
}

/** 常见的模块容器目录名——本身不是业务模块，只是用来组织模块的壳目录 */
const MODULE_CONTAINER_DIRS = new Set([
  'modules', 'module',
  'biz', 'business',
  'pages', 'page',
  'views', 'view',
  'features', 'feature',
  'domains', 'domain',
]);

// ==================== 自动推断模块 ====================

function autoDetectModules(
  root: string,
  config: GraphConfig,
  projectType: ProjectType,
): ParsedModule[] {
  const result: ParsedModule[] = [];
  const seen = new Set<string>();
  const commonDirs = new Set(config.build.commonDirs.map((d) => d.toLowerCase()));

  for (const rootDir of config.build.moduleRoots) {
    const absDir = path.join(root, rootDir);
    if (!fs.existsSync(absDir)) continue;

    scanModuleDir(result, seen, root, rootDir, absDir, commonDirs, projectType);
  }

  // 如果模块根目录没找到，试试 src 下的一级目录
  if (result.length === 0) {
    result.push(...detectFromSrcRoot(root, commonDirs, projectType));
  }

  return result;
}

/**
 * 扫描目录下的子目录，将非通用目录识别为模块。
 * 如果某个子目录是「模块容器目录」（如 modules / biz），则下钻一层继续扫描。
 */
function scanModuleDir(
  result: ParsedModule[],
  seen: Set<string>,
  root: string,
  parentRel: string,
  parentAbs: string,
  commonDirs: Set<string>,
  projectType: ProjectType,
): void {
  const entries = fs.readdirSync(parentAbs, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (commonDirs.has(entry.name.toLowerCase())) continue;
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    const entryLower = entry.name.toLowerCase();
    const relDir = path.join(parentRel, entry.name);
    const key = relDir.replace(/\\/g, '/');
    if (seen.has(key)) continue;

    // 如果是模块容器目录（如 modules / biz），下钻一层，把里面的子目录当作模块
    if (MODULE_CONTAINER_DIRS.has(entryLower)) {
      const absEntry = path.join(parentAbs, entry.name);
      scanModuleDir(result, seen, root, relDir, absEntry, commonDirs, projectType);
      continue;
    }

    seen.add(key);
    const side = detectModuleSide(
      path.join(root, relDir),
      entry.name,
      projectType,
    );

    const node: GraphNode = {
      id: generateNodeId('mod', [entry.name, side]),
      level: 'L1',
      type: NODE_TYPE_MODULE,
      name: entry.name,
      attrs: {
        side,
        dir: relDir,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    result.push({ node, dir: relDir });
  }
}

function detectFromSrcRoot(
  root: string,
  commonDirs: Set<string>,
  projectType: ProjectType,
): ParsedModule[] {
  const srcDir = path.join(root, 'src');
  if (!fs.existsSync(srcDir)) return [];

  const result: ParsedModule[] = [];
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (commonDirs.has(entry.name.toLowerCase())) continue;
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

    const relDir = path.join('src', entry.name);
    const side = detectModuleSide(
      path.join(root, relDir),
      entry.name,
      projectType,
    );

    const node: GraphNode = {
      id: generateNodeId('mod', [entry.name, side]),
      level: 'L1',
      type: NODE_TYPE_MODULE,
      name: entry.name,
      attrs: {
        side,
        dir: relDir,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    result.push({ node, dir: relDir });
  }

  return result;
}

// ==================== 前后端判断 ====================

/**
 * 判断模块属于前端还是后端
 *
 * 判断顺序：
 * 1. 纯前端项目 → 全部前端
 * 2. 纯后端项目 → 全部后端
 * 3. 全栈项目 → 按目录特征和文件类型判断
 */
function detectModuleSide(
  moduleDir: string,
  moduleName: string,
  projectType: ProjectType,
): ModuleSide {
  // 纯前端 / 纯后端
  if (isFrontend(projectType)) return 'frontend';
  if (isBackend(projectType)) return 'backend';

  // 全栈项目，按特征判断
  if (!fs.existsSync(moduleDir)) return 'unknown';

  let frontendScore = 0;
  let backendScore = 0;

  // 目录名关键词
  const nameLower = moduleName.toLowerCase();
  const FE_DIR_KEYWORDS = ['page', 'view', 'component', 'widget', 'screen', 'layout', 'route', 'store', 'hook', 'composable', 'asset', 'style', 'client'];
  const BE_DIR_KEYWORDS = ['controller', 'service', 'model', 'entity', 'dao', 'repository', 'dto', 'api', 'server', 'middleware', 'guard', 'interceptor', 'pipe'];

  for (const kw of FE_DIR_KEYWORDS) {
    if (nameLower.includes(kw)) frontendScore += 2;
  }
  for (const kw of BE_DIR_KEYWORDS) {
    if (nameLower.includes(kw)) backendScore += 2;
  }

  // 文件类型统计
  const files = listFilesRecursive(moduleDir, 2);
  let tsxCount = 0;
  let vueCount = 0;
  let tsCount = 0;
  let controllerCount = 0;
  let serviceCount = 0;

  for (const file of files) {
    const lower = file.toLowerCase();
    const base = path.basename(file).toLowerCase();
    if (lower.endsWith('.tsx')) tsxCount++;
    if (lower.endsWith('.vue')) vueCount++;
    if (lower.endsWith('.ts') || lower.endsWith('.js')) tsCount++;
    if (base.includes('controller')) controllerCount++;
    if (base.includes('service')) serviceCount++;
  }

  frontendScore += tsxCount * 2 + vueCount * 3;
  backendScore += controllerCount * 2 + serviceCount;

  // 路径特征
  if (moduleDir.includes(path.sep + 'client' + path.sep)) frontendScore += 3;
  if (moduleDir.includes(path.sep + 'server' + path.sep)) backendScore += 3;
  if (moduleDir.includes(path.sep + 'frontend' + path.sep)) frontendScore += 5;
  if (moduleDir.includes(path.sep + 'backend' + path.sep)) backendScore += 5;

  if (frontendScore > backendScore && frontendScore >= 2) return 'frontend';
  if (backendScore > frontendScore && backendScore >= 2) return 'backend';

  // 区分不了就看项目里的主体类型
  if (tsxCount > 0 || vueCount > 0) return 'frontend';
  if (controllerCount > 0 || serviceCount > 0) return 'backend';

  return 'shared';
}

// ==================== 工具函数 ====================

/** 递归列出文件（限制深度） */
function listFilesRecursive(dir: string, maxDepth: number, currentDepth = 0): string[] {
  if (currentDepth >= maxDepth) return [];

  const result: string[] = [];
  if (!fs.existsSync(dir)) return result;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile()) {
      result.push(fullPath);
    } else if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      result.push(
        ...listFilesRecursive(fullPath, maxDepth, currentDepth + 1),
      );
    }
  }

  return result;
}
