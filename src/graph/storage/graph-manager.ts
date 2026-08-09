/**
 * 多图谱管理器
 *
 * 负责：
 * - 枚举所有命名图谱（graph list）
 * - 删除指定图谱（graph remove）
 * - 旧式单图谱向后兼容迁移
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GraphRegistryEntry, GraphMeta } from '../types';
import { DEFAULT_GRAPH_NAME } from '../types';
import { getGraphBaseDir, resolveGraphDir, graphExists } from './graph-path';
import { JsonMetaStore } from './meta-store';

// ==================== 图谱列举 ====================

/**
 * 枚举所有图谱（wpw/knowledge/graph/ 下含 meta.json 的子文件夹）
 *
 * @param root 工作根目录
 * @returns 图谱注册条目列表，按名称排序
 */
export function listGraphs(root: string): GraphRegistryEntry[] {
  const baseDir = getGraphBaseDir(root);
  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const entries: GraphRegistryEntry[] = [];
  const items = fs.readdirSync(baseDir, { withFileTypes: true });

  for (const item of items) {
    if (!item.isDirectory()) continue;

    const graphDir = path.join(baseDir, item.name);
    const metaPath = path.join(graphDir, 'meta.json');
    if (!fs.existsSync(metaPath)) continue;

    try {
      const metaStore = new JsonMetaStore(graphDir);
      const meta = metaStore.load();
      if (!meta) continue;

      entries.push(metaToRegistryEntry(item.name, meta));
    } catch {
      // 跳过损坏的 meta
      continue;
    }
  }

  // 按名称排序
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

function metaToRegistryEntry(name: string, meta: GraphMeta): GraphRegistryEntry {
  return {
    name,
    totalNodes: meta.totalNodes ?? 0,
    totalEdges: meta.totalEdges ?? 0,
    totalVectors: meta.totalVectors ?? 0,
    builtAt: meta.builtAt ?? 0,
    scanRoot: meta.scanRoot,
    projectType: meta.projectType,
    schemaVersion: meta.schemaVersion,
  };
}

// ==================== 图谱删除 ====================

/**
 * 删除指定图谱（删除整个子文件夹）
 *
 * @param root 工作根目录
 * @param stack 图谱名
 * @returns 是否成功删除
 * @throws 图谱不存在时抛出错误
 */
export function removeGraph(root: string, stack: string): void {
  if (!graphExists(root, stack)) {
    throw new Error(`图谱「${stack}」不存在。可运行 wpw graph list 查看可用图谱。`);
  }

  const graphDir = resolveGraphDir(root, stack);
  fs.rmSync(graphDir, { recursive: true, force: true });
}

// ==================== 向后兼容迁移 ====================

/** 旧式图谱文件（直接在 graph/ 下的文件） */
const LEGACY_FILES = ['graph.jsonl', 'meta.json'];
const LEGACY_INDEX_DIR = 'index';
const LEGACY_INDEX_FILES = ['vector.index', 'vector-mapping.json'];

/**
 * 检测是否存在旧式直写图谱（需要迁移）
 *
 * 条件：
 * - wpw/knowledge/graph/graph.jsonl 存在（直接在 graph/ 下，不是子文件夹内）
 * - wpw/knowledge/graph/default/ 子文件夹不存在
 */
export function needsLegacyMigration(root: string): boolean {
  const baseDir = getGraphBaseDir(root);
  const legacyGraphFile = path.join(baseDir, 'graph.jsonl');
  const defaultDir = path.join(baseDir, DEFAULT_GRAPH_NAME);

  return fs.existsSync(legacyGraphFile) && !fs.existsSync(defaultDir);
}

/**
 * 迁移结果
 */
export interface MigrationResult {
  /** 是否执行了迁移 */
  migrated: boolean;
  /** 原因（未迁移时说明） */
  reason?: string;
  /** 迁移前文件清单 */
  beforeFiles?: string[];
  /** 迁移后文件清单 */
  afterFiles?: string[];
  /** 迁移的文件数 */
  movedCount?: number;
}

/**
 * 执行旧式单图谱到 default/ 的迁移
 *
 * 流程：
 * 1. 检测是否需要迁移
 * 2. 创建 default/ 目录
 * 3. 移动旧文件到 default/
 * 4. 验证迁移结果
 *
 * @param root 工作根目录
 * @returns 迁移结果
 */
export function migrateLegacyGraph(root: string): MigrationResult {
  const baseDir = getGraphBaseDir(root);

  // 检查是否需要迁移
  if (!needsLegacyMigration(root)) {
    const defaultDir = path.join(baseDir, DEFAULT_GRAPH_NAME);
    if (fs.existsSync(defaultDir)) {
      return { migrated: false, reason: 'default/ 已存在，不执行迁移' };
    }
    return { migrated: false, reason: '未检测到旧式图谱文件' };
  }

  // 收集迁移前文件清单
  const beforeFiles = collectLegacyFiles(baseDir);

  // 创建 default/ 目录
  const defaultDir = path.join(baseDir, DEFAULT_GRAPH_NAME);
  fs.mkdirSync(defaultDir, { recursive: true });

  const movedFiles: string[] = [];
  try {
    // 移动顶层文件
    for (const fileName of LEGACY_FILES) {
      const src = path.join(baseDir, fileName);
      if (fs.existsSync(src)) {
        const dest = path.join(defaultDir, fileName);
        fs.renameSync(src, dest);
        movedFiles.push(fileName);
      }
    }

    // 移动 index/ 目录
    const indexSrc = path.join(baseDir, LEGACY_INDEX_DIR);
    if (fs.existsSync(indexSrc)) {
      const indexDest = path.join(defaultDir, LEGACY_INDEX_DIR);
      // 如果目标目录已存在（不应该），移动里面的文件
      if (fs.existsSync(indexDest)) {
        for (const f of LEGACY_INDEX_FILES) {
          const src = path.join(indexSrc, f);
          if (fs.existsSync(src)) {
            fs.renameSync(src, path.join(indexDest, f));
            movedFiles.push(`index/${f}`);
          }
        }
        // 删除源目录（如果空了）
        try {
          fs.rmdirSync(indexSrc);
        } catch {
          // 目录非空就保留
        }
      } else {
        fs.renameSync(indexSrc, indexDest);
        movedFiles.push('index/');
      }
    }

    // 验证迁移后 default/ 有 meta.json（证明是有效图谱）
    const afterFiles = collectGraphFiles(defaultDir);

    return {
      migrated: true,
      beforeFiles,
      afterFiles,
      movedCount: movedFiles.length,
    };
  } catch (e) {
    // 迁移失败：尝试回滚
    console.warn('[graph-manager] 迁移失败，尝试回滚...');
    try {
      rollbackMigration(baseDir, defaultDir, movedFiles);
    } catch (rollbackErr) {
      console.error('[graph-manager] 回滚失败，请手动检查文件:', rollbackErr);
    }
    throw e;
  }
}

/**
 * 回滚迁移操作
 */
function rollbackMigration(baseDir: string, defaultDir: string, movedFiles: string[]): void {
  for (const f of movedFiles) {
    const src = path.join(defaultDir, f);
    const dest = path.join(baseDir, f);
    if (fs.existsSync(src)) {
      if (f.endsWith('/')) {
        // 目录
        const destDir = path.join(baseDir, f.slice(0, -1));
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }
        const files = fs.readdirSync(src);
        for (const ff of files) {
          fs.renameSync(path.join(src, ff), path.join(destDir, ff));
        }
        try {
          fs.rmdirSync(src);
        } catch {
          // ignore
        }
      } else {
        fs.renameSync(src, dest);
      }
    }
  }
  // 如果 default/ 空了就删掉
  try {
    const remaining = fs.readdirSync(defaultDir);
    if (remaining.length === 0) {
      fs.rmdirSync(defaultDir);
    }
  } catch {
    // ignore
  }
}

function collectLegacyFiles(baseDir: string): string[] {
  const files: string[] = [];
  for (const f of LEGACY_FILES) {
    if (fs.existsSync(path.join(baseDir, f))) {
      files.push(f);
    }
  }
  const indexDir = path.join(baseDir, LEGACY_INDEX_DIR);
  if (fs.existsSync(indexDir)) {
    const idxFiles = fs.readdirSync(indexDir);
    for (const f of idxFiles) {
      files.push(`index/${f}`);
    }
  }
  return files;
}

function collectGraphFiles(graphDir: string): string[] {
  const files: string[] = [];
  for (const f of LEGACY_FILES) {
    if (fs.existsSync(path.join(graphDir, f))) {
      files.push(f);
    }
  }
  const indexDir = path.join(graphDir, LEGACY_INDEX_DIR);
  if (fs.existsSync(indexDir)) {
    const idxFiles = fs.readdirSync(indexDir);
    for (const f of idxFiles) {
      files.push(`index/${f}`);
    }
  }
  return files;
}
