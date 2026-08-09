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

  // backend-java 项目：Spring Boot 业务包推断
  if (projectType === 'backend-java') {
    const javaModules = detectSpringBootModules(root, commonDirs, config);
    if (javaModules.length > 0) {
      return javaModules;
    }
  }

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

// ==================== Spring Boot 业务包推断 ====================

/**
 * Spring Boot 项目下按业务包推断 L1 模块
 *
 * Maven 标准布局：src/main/java/<groupId反转>/<业务包>/...
 * 业务包是源根下的直接子目录，技术分包（controller/service/repository 等）不作为模块。
 */
function detectSpringBootModules(
  root: string,
  commonDirs: Set<string>,
  _config: GraphConfig,
): ParsedModule[] {
  const result: ParsedModule[] = [];

  const srcMainJava = path.join(root, 'src', 'main', 'java');
  if (!fs.existsSync(srcMainJava)) return result;

  // 找到 groupId 反转包路径的根目录（通常是两级，如 com/example/）
  const groupIdRoot = findGroupIdRoot(srcMainJava);
  const srcMainJavaNorm = srcMainJava.replace(/\\/g, '/');

  if (groupIdRoot) {
    // 业务包 = groupId 根下的直接子目录（排除 commonDirs）
    let currentRoot = groupIdRoot;
    let relCurrent = path.relative(root, currentRoot).replace(/\\/g, '/');

    // 如果当前目录下所有子目录都是技术分包（commonDirs），说明当前目录本身就是业务包
    // 向上回退一级，重新判断
    const entries = fs.readdirSync(currentRoot, { withFileTypes: true });
    const subDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'));
    const allTech = subDirs.length > 0 && subDirs.every((d) => commonDirs.has(d.name.toLowerCase()));

    if (allTech && currentRoot.replace(/\\/g, '/') !== srcMainJavaNorm) {
      // 所有子目录都是技术包，当前目录本身是业务包
      // 向上回退一级，把当前目录作为一个业务包
      const parentDir = path.dirname(currentRoot);
      const parentRel = path.relative(root, parentDir).replace(/\\/g, '/');
      const parentEntries = fs.readdirSync(parentDir, { withFileTypes: true });
      const businessPackages = parentEntries.filter((e) =>
        e.isDirectory() &&
        !e.name.startsWith('_') &&
        !e.name.startsWith('.') &&
        !commonDirs.has(e.name.toLowerCase()),
      );

      if (businessPackages.length > 0) {
        currentRoot = parentDir;
        relCurrent = parentRel;
      }
    }

    // 扫描当前根目录下的业务包
    const finalEntries = fs.readdirSync(currentRoot, { withFileTypes: true });
    for (const entry of finalEntries) {
      if (!entry.isDirectory()) continue;
      const entryLower = entry.name.toLowerCase();
      if (commonDirs.has(entryLower)) continue;
      if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;

      const relDir = path.join(relCurrent, entry.name).replace(/\\/g, '/');
      const node: GraphNode = {
        id: generateNodeId('mod', [entry.name, 'backend']),
        level: 'L1',
        type: NODE_TYPE_MODULE,
        name: entry.name,
        attrs: {
          side: 'backend',
          dir: relDir,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      result.push({ node, dir: relDir });
    }
  }

  // 扁平包结构降级：整个 src/main/java 作为一个 backend 模块
  if (result.length === 0) {
    const relDir = 'src/main/java';
    const absDir = path.join(root, relDir);
    // 确认目录下确实有 java 文件
    const hasJavaFiles = fs.readdirSync(absDir).some((name) =>
      name.endsWith('.java') ||
      fs.statSync(path.join(absDir, name)).isDirectory(),
    );
    if (hasJavaFiles) {
      result.push({
        node: {
          id: generateNodeId('mod', ['backend', 'backend']),
          level: 'L1',
          type: NODE_TYPE_MODULE,
          name: 'backend',
          attrs: {
            side: 'backend',
            dir: relDir,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        dir: relDir,
      });
    }
  }

  return result;
}

/**
 * 找到 groupId 反转包路径的根目录
 *
 * 从 src/main/java 往下找，最多找 3 级目录，直到找到一个目录下有多个子目录（业务包），
 * 或者到达有 .java 文件的层级。
 */
function findGroupIdRoot(srcMainJava: string): string | null {
  let current = srcMainJava;
  // 最多下钻 3 级（典型 groupId 反转：com/example/demo 是三级）
  for (let depth = 0; depth < 3; depth++) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return null;
    }

    const dirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));
    const javaFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.java'));

    // 如果有 Java 文件，说明已经到了业务包内部，当前就是 groupId 根
    if (javaFiles.length > 0) return current;

    // 如果没有子目录，说明到了尽头
    if (dirs.length === 0) return null;

    // 如果只有一个子目录，继续下钻（groupId 通常是多级单目录）
    if (dirs.length === 1) {
      current = path.join(current, dirs[0].name);
      continue;
    }

    // 如果有多个子目录，说明这里就是业务包层级的父目录 = groupId 根
    return current;
  }

  return current;
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
