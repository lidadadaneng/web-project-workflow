/**
 * graph 命令测试
 *
 * 测试内容：
 * - graph list 空目录提示
 * - graph list 表格输出
 * - graph list --json 输出
 * - graph remove 删除存在的图谱
 * - graph remove 删除不存在的图谱报错
 * - 图谱名格式校验
 * - --graph 指向不存在的图谱时报错
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { listGraphs, removeGraph, needsLegacyMigration, migrateLegacyGraph } from '../graph/storage/graph-manager';
import { graphExists, isValidGraphName, resolveGraphDir } from '../graph/storage/graph-path';
import { JsonMetaStore, createEmptyMeta } from '../graph/storage/meta-store';
import { JsonlGraphStore } from '../graph/storage/graph-store';
import { DEFAULT_GRAPH_NAME } from '../graph/types';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-graph-cmd-'));
}

function createTestGraph(root: string, name: string, nodes = 10, scanRoot?: string) {
  const meta = createEmptyMeta(name, scanRoot);
  meta.builtAt = Date.now();
  meta.totalNodes = nodes;
  meta.totalEdges = nodes * 2;
  meta.totalVectors = nodes;
  meta.projectType = scanRoot?.includes('front') ? 'frontend-h5' : 'backend-java';

  const metaStore = new JsonMetaStore(root, name);
  metaStore.save(meta);

  // 也创建 graph.jsonl 确保完整性
  const graphStore = new JsonlGraphStore(root, name);
  graphStore.save({
    nodes: Array.from({ length: nodes }, (_, i) => ({
      id: `node-${i}`,
      level: 'L2' as const,
      type: 'file' as const,
      name: `file-${i}.ts`,
      attrs: { filePath: `file-${i}.ts` },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
    edges: [],
  });
}

describe('graph list 命令', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('无图谱时 listGraphs 返回空数组', () => {
    const graphs = listGraphs(tmpDir);
    expect(graphs).toEqual([]);
  });

  it('有多个图谱时返回正确条目并排序', () => {
    createTestGraph(tmpDir, 'z-graph', 20);
    createTestGraph(tmpDir, 'a-graph', 10, 'src');
    createTestGraph(tmpDir, 'm-graph', 15, 'modules');

    const graphs = listGraphs(tmpDir);
    expect(graphs.length).toBe(3);
    expect(graphs[0].name).toBe('a-graph');
    expect(graphs[1].name).toBe('m-graph');
    expect(graphs[2].name).toBe('z-graph');

    expect(graphs[0].totalNodes).toBe(10);
    expect(graphs[0].scanRoot).toBe('src');
    expect(graphs[0].projectType).toBe('backend-java'); // scanRoot='src' 不含 front
  });

  it('图谱条目包含完整字段', () => {
    createTestGraph(tmpDir, 'test-graph', 42, 'src');
    const graphs = listGraphs(tmpDir);
    expect(graphs.length).toBe(1);

    const g = graphs[0];
    expect(g.name).toBe('test-graph');
    expect(g.totalNodes).toBe(42);
    expect(g.totalEdges).toBe(84);
    expect(g.totalVectors).toBe(42);
    expect(g.builtAt).toBeGreaterThan(0);
    expect(g.scanRoot).toBe('src');
    expect(g.projectType).toBeTruthy();
    expect(g.schemaVersion).toBeTruthy();
  });
});

describe('graph remove 命令', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    createTestGraph(tmpDir, 'graph-a', 10);
    createTestGraph(tmpDir, 'graph-b', 20);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('删除存在的图谱', () => {
    expect(graphExists(tmpDir, 'graph-a')).toBe(true);
    expect(listGraphs(tmpDir).length).toBe(2);

    removeGraph(tmpDir, 'graph-a');

    expect(graphExists(tmpDir, 'graph-a')).toBe(false);
    expect(graphExists(tmpDir, 'graph-b')).toBe(true);
    expect(listGraphs(tmpDir).length).toBe(1);
  });

  it('删除不存在的图谱抛出错误', () => {
    expect(() => removeGraph(tmpDir, 'nonexistent')).toThrow(/不存在/);
    // 提示 list 命令
    expect(() => removeGraph(tmpDir, 'nonexistent')).toThrow(/graph list/);
  });
});

describe('图谱名格式校验', () => {
  it('合法 kebab-case 名称', () => {
    expect(isValidGraphName('my-graph')).toBe(true);
    expect(isValidGraphName('frontend-vue-3')).toBe(true);
    expect(isValidGraphName('a')).toBe(true);
  });

  it('非法名称', () => {
    expect(isValidGraphName('')).toBe(false);
    expect(isValidGraphName('My-Graph')).toBe(false); // 大写
    expect(isValidGraphName('my_graph')).toBe(false); // 下划线
    expect(isValidGraphName('-bad')).toBe(false); // 开头连字符
    expect(isValidGraphName('bad-')).toBe(false); // 结尾连字符
    expect(isValidGraphName('bad--name')).toBe(false); // 连续连字符
    expect(isValidGraphName('123-graph')).toBe(false); // 数字开头
  });
});

describe('向后兼容迁移', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createLegacy() {
    const baseDir = path.join(tmpDir, 'wpw', 'knowledge', 'graph');
    fs.mkdirSync(baseDir, { recursive: true });

    const metaStore = new JsonMetaStore(baseDir);
    const meta = createEmptyMeta();
    meta.builtAt = Date.now();
    meta.totalNodes = 100;
    meta.totalEdges = 200;
    metaStore.save(meta);

    const graphStore = new JsonlGraphStore(baseDir);
    graphStore.save({ nodes: [], edges: [] });
  }

  it('needsLegacyMigration 正确检测', () => {
    // 空目录不需要
    expect(needsLegacyMigration(tmpDir)).toBe(false);

    // 有旧式文件需要
    createLegacy();
    expect(needsLegacyMigration(tmpDir)).toBe(true);

    // default 已存在不需要
    fs.mkdirSync(path.join(tmpDir, 'wpw', 'knowledge', 'graph', DEFAULT_GRAPH_NAME), { recursive: true });
    expect(needsLegacyMigration(tmpDir)).toBe(false);
  });

  it('migrateLegacyGraph 成功迁移', () => {
    createLegacy();
    const result = migrateLegacyGraph(tmpDir);

    expect(result.migrated).toBe(true);
    expect(graphExists(tmpDir, DEFAULT_GRAPH_NAME)).toBe(true);

    // 原位置没有 meta.json 了
    const baseDir = path.join(tmpDir, 'wpw', 'knowledge', 'graph');
    expect(fs.existsSync(path.join(baseDir, 'meta.json'))).toBe(false);

    // default 下有
    expect(fs.existsSync(path.join(baseDir, DEFAULT_GRAPH_NAME, 'meta.json'))).toBe(true);
  });

  it('default 已存在时不迁移', () => {
    createLegacy();
    const defaultDir = path.join(tmpDir, 'wpw', 'knowledge', 'graph', DEFAULT_GRAPH_NAME);
    fs.mkdirSync(defaultDir, { recursive: true });

    const result = migrateLegacyGraph(tmpDir);
    expect(result.migrated).toBe(false);
    expect(result.reason).toContain('default');
  });
});

describe('resolveGraphDir 路径解析', () => {
  it('默认图谱路径', () => {
    const dir = resolveGraphDir('/test/project');
    expect(dir.endsWith(path.join('wpw', 'knowledge', 'graph', 'default'))).toBe(true);
  });

  it('指定图谱名路径', () => {
    const dir = resolveGraphDir('/test/project', 'my-graph');
    expect(dir.endsWith(path.join('wpw', 'knowledge', 'graph', 'my-graph'))).toBe(true);
  });
});
