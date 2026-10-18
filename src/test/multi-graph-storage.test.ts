/**
 * 多图谱存储层测试
 *
 * 测试内容：
 * - resolveGraphDir 路径解析
 * - 多图谱共存（不同 stack 独立存储）
 * - 同名图谱覆盖（幂等）
 * - graphName / scanRoot 元数据字段
 * - isValidGraphName 命名校验
 * - listGraphs 图谱列举
 * - removeGraph 图谱删除
 * - 旧式单图谱迁移
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  resolveGraphDir,
  isValidGraphName,
  isReservedGraphName,
  graphExists,
  getGraphBaseDir,
} from '../graph/storage/graph-path';
import {
  listGraphs,
  removeGraph,
  needsLegacyMigration,
  migrateLegacyGraph,
} from '../graph/storage/graph-manager';
import { JsonlGraphStore } from '../graph/storage/graph-store';
import { JsonMetaStore, createEmptyMeta } from '../graph/storage/meta-store';
import { BinaryVectorStore } from '../graph/storage/vector-store';
import { VectorMappingStore } from '../graph/storage/mapping-store';
import type { GraphData, GraphMeta } from '../graph/types';
import { DEFAULT_GRAPH_NAME } from '../graph/types';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-multi-graph-'));
}

function makeTestGraphData(prefix: string, count: number): GraphData {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    nodes.push({
      id: `${prefix}-node-${i}`,
      level: 'L2' as const,
      type: 'file' as const,
      name: `${prefix}-file-${i}.ts`,
      attrs: { filePath: `${prefix}/file-${i}.ts` },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return { nodes, edges: [] };
}

describe('多图谱存储 - 路径解析', () => {
  describe('resolveGraphDir', () => {
    it('默认 stack 为 default', () => {
      const dir = resolveGraphDir('/project');
      expect(dir).toContain(DEFAULT_GRAPH_NAME);
      expect(dir.endsWith(path.join('wpw', 'knowledge', 'graph', DEFAULT_GRAPH_NAME))).toBe(true);
    });

    it('指定 stack 时路径包含图谱名', () => {
      const dir = resolveGraphDir('/project', 'frontend-vue');
      expect(dir.endsWith(path.join('wpw', 'knowledge', 'graph', 'frontend-vue'))).toBe(true);
    });

    it('空字符串 stack 回退到 default', () => {
      const dir = resolveGraphDir('/project', '');
      expect(dir).toContain(DEFAULT_GRAPH_NAME);
    });
  });

  describe('isValidGraphName', () => {
    it('合法 kebab-case 名称', () => {
      expect(isValidGraphName('frontend-vue')).toBe(true);
      expect(isValidGraphName('backend-springboot')).toBe(true);
      expect(isValidGraphName('my-graph-1')).toBe(true);
      expect(isValidGraphName('a')).toBe(true);
      expect(isValidGraphName('abc123')).toBe(true);
    });

    it('非法名称', () => {
      expect(isValidGraphName('')).toBe(false);
      expect(isValidGraphName('Frontend')).toBe(false); // 大写字母
      expect(isValidGraphName('-frontend')).toBe(false); // 开头连字符
      expect(isValidGraphName('frontend-')).toBe(false); // 结尾连字符
      expect(isValidGraphName('front--end')).toBe(false); // 连续连字符
      expect(isValidGraphName('123-front')).toBe(false); // 数字开头
      expect(isValidGraphName('front_end')).toBe(false); // 下划线
      expect(isValidGraphName('front end')).toBe(false); // 空格
    });
  });

  describe('isReservedGraphName', () => {
    it('default 是保留名', () => {
      expect(isReservedGraphName('default')).toBe(true);
    });

    it('其他名称不是保留名', () => {
      expect(isReservedGraphName('frontend-vue')).toBe(false);
    });
  });
});

describe('多图谱存储 - 多图谱共存', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('两个图谱独立存储互不干扰', () => {
    // 构建前端图谱
    const feStore = new JsonlGraphStore(tmpDir, 'frontend-vue');
    const feData = makeTestGraphData('fe', 5);
    feStore.save(feData);

    // 构建后端图谱
    const beStore = new JsonlGraphStore(tmpDir, 'backend-springboot');
    const beData = makeTestGraphData('be', 3);
    beStore.save(beData);

    // 验证独立
    const loadedFe = feStore.load();
    const loadedBe = beStore.load();
    expect(loadedFe.nodes.length).toBe(5);
    expect(loadedBe.nodes.length).toBe(3);
    expect(loadedFe.nodes.every((n) => n.id.startsWith('fe-'))).toBe(true);
    expect(loadedBe.nodes.every((n) => n.id.startsWith('be-'))).toBe(true);
  });

  it('同名构建覆盖原有图谱', () => {
    const store = new JsonlGraphStore(tmpDir, 'test-graph');

    // 第一次构建
    store.save(makeTestGraphData('v1', 3));
    expect(store.load().nodes.length).toBe(3);

    // 第二次同名构建（覆盖）
    store.save(makeTestGraphData('v2', 7));
    const loaded = store.load();
    expect(loaded.nodes.length).toBe(7);
    expect(loaded.nodes.every((n) => n.id.startsWith('v2-'))).toBe(true);
  });

  it('meta.json 包含 graphName 和 scanRoot 字段', () => {
    const metaStore = new JsonMetaStore(tmpDir, 'frontend-vue');
    const meta = createEmptyMeta('frontend-vue', 'frontend');
    meta.builtAt = Date.now();
    meta.totalNodes = 42;
    meta.totalEdges = 100;
    metaStore.save(meta);

    const loaded = metaStore.load();
    expect(loaded?.graphName).toBe('frontend-vue');
    expect(loaded?.scanRoot).toBe('frontend');
    expect(loaded?.totalNodes).toBe(42);
  });

  it('graphExists 通过 meta.json 判断', () => {
    expect(graphExists(tmpDir, 'nonexistent')).toBe(false);

    // 只有 meta.json 才算存在
    const metaStore = new JsonMetaStore(tmpDir, 'new-graph');
    const meta = createEmptyMeta('new-graph');
    metaStore.save(meta);
    expect(graphExists(tmpDir, 'new-graph')).toBe(true);
  });
});

describe('多图谱存储 - 图谱列举与删除', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createTestGraph(name: string, nodes: number, scanRoot?: string) {
    const metaStore = new JsonMetaStore(tmpDir, name);
    const meta: GraphMeta = {
      schemaVersion: '3.0.0',
      builtAt: Date.now(),
      totalNodes: nodes,
      totalEdges: nodes * 2,
      totalVectors: nodes,
      fileHashes: {},
      configVersion: 'test',
      graphName: name,
      scanRoot,
      projectType: scanRoot?.includes('front') ? 'frontend-h5' : 'backend-java',
    };
    metaStore.save(meta);

    // 也存一下 graph.jsonl 让 store 存在
    const graphStore = new JsonlGraphStore(tmpDir, name);
    graphStore.save(makeTestGraphData(name, nodes));
  }

  it('listGraphs 空目录返回空数组', () => {
    const graphs = listGraphs(tmpDir);
    expect(graphs).toEqual([]);
  });

  it('listGraphs 列举多个图谱并按名称排序', () => {
    createTestGraph('frontend-vue', 50, 'frontend');
    createTestGraph('backend-springboot', 30, 'backend');

    const graphs = listGraphs(tmpDir);
    expect(graphs.length).toBe(2);
    // 按名称排序：backend-springboot < frontend-vue
    expect(graphs[0].name).toBe('backend-springboot');
    expect(graphs[1].name).toBe('frontend-vue');
    expect(graphs[0].totalNodes).toBe(30);
    expect(graphs[1].totalNodes).toBe(50);
    expect(graphs[0].scanRoot).toBe('backend');
    expect(graphs[1].scanRoot).toBe('frontend');
    expect(graphs[0].projectType).toBe('backend-java');
  });

  it('removeGraph 删除指定图谱', () => {
    createTestGraph('graph-a', 10);
    createTestGraph('graph-b', 20);

    expect(listGraphs(tmpDir).length).toBe(2);

    removeGraph(tmpDir, 'graph-a');

    const remaining = listGraphs(tmpDir);
    expect(remaining.length).toBe(1);
    expect(remaining[0].name).toBe('graph-b');
    expect(graphExists(tmpDir, 'graph-a')).toBe(false);
  });

  it('removeGraph 删除不存在的图谱时报错', () => {
    expect(() => removeGraph(tmpDir, 'nonexistent')).toThrow(/不存在/);
  });
});

describe('多图谱存储 - 向后兼容迁移', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createLegacyGraph() {
    const baseDir = path.join(tmpDir, 'wpw', 'knowledge', 'graph');
    fs.mkdirSync(baseDir, { recursive: true });

    // graph.jsonl
    const graphStore = new JsonlGraphStore(baseDir);
    graphStore.save(makeTestGraphData('legacy', 10));

    // meta.json
    const metaStore = new JsonMetaStore(baseDir);
    const meta = createEmptyMeta();
    meta.builtAt = Date.now();
    meta.totalNodes = 10;
    meta.totalEdges = 20;
    metaStore.save(meta);

    // 向量索引
    const vectorStore = new BinaryVectorStore(baseDir);
    const vectors = new Float32Array(512);
    vectorStore.save(vectors, 512);

    // 向量映射
    const mappingStore = new VectorMappingStore(baseDir);
    mappingStore.save({
      indexToNodeId: ['legacy-node-0'],
      nodeIdToIndex: new Map([['legacy-node-0', 0]]),
    });
  }

  it('needsLegacyMigration 检测到旧式图谱时返回 true', () => {
    createLegacyGraph();
    expect(needsLegacyMigration(tmpDir)).toBe(true);
  });

  it('needsLegacyMigration default 已存在时返回 false', () => {
    createLegacyGraph();
    // 创建 default/ 目录
    const defaultDir = path.join(getGraphBaseDir(tmpDir), DEFAULT_GRAPH_NAME);
    fs.mkdirSync(defaultDir, { recursive: true });
    expect(needsLegacyMigration(tmpDir)).toBe(false);
  });

  it('needsLegacyMigration 没有旧式图谱时返回 false', () => {
    expect(needsLegacyMigration(tmpDir)).toBe(false);
  });

  it('migrateLegacyGraph 迁移旧式图谱到 default', () => {
    createLegacyGraph();

    const result = migrateLegacyGraph(tmpDir);

    expect(result.migrated).toBe(true);
    expect(result.movedCount).toBeGreaterThan(0);
    expect(result.beforeFiles).toContain('graph.jsonl');
    expect(result.beforeFiles).toContain('meta.json');
    expect(result.afterFiles).toContain('graph.jsonl');
    expect(result.afterFiles).toContain('meta.json');

    // 验证 default/ 下有图谱
    expect(graphExists(tmpDir, DEFAULT_GRAPH_NAME)).toBe(true);

    // 验证数据正确
    const graphStore = new JsonlGraphStore(tmpDir, DEFAULT_GRAPH_NAME);
    const data = graphStore.load();
    expect(data.nodes.length).toBe(10);

    // 验证原位置没有 graph.jsonl 了
    const baseDir = getGraphBaseDir(tmpDir);
    expect(fs.existsSync(path.join(baseDir, 'graph.jsonl'))).toBe(false);
  });

  it('migrateLegacyGraph default 已存在时不迁移', () => {
    createLegacyGraph();
    const defaultDir = path.join(getGraphBaseDir(tmpDir), DEFAULT_GRAPH_NAME);
    fs.mkdirSync(defaultDir, { recursive: true });

    const result = migrateLegacyGraph(tmpDir);
    expect(result.migrated).toBe(false);
    expect(result.reason).toContain('default');
  });

  it('迁移后 listGraphs 能列举出 default 图谱', () => {
    createLegacyGraph();
    migrateLegacyGraph(tmpDir);

    const graphs = listGraphs(tmpDir);
    expect(graphs.length).toBe(1);
    expect(graphs[0].name).toBe(DEFAULT_GRAPH_NAME);
    expect(graphs[0].totalNodes).toBe(10);
  });
});

describe('多图谱存储 - 向后兼容：旧式 API（单参数构造）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('JsonlGraphStore 旧式单参数构造仍可用', () => {
    const graphDir = path.join(tmpDir, 'my-graph');
    fs.mkdirSync(graphDir, { recursive: true });

    const store = new JsonlGraphStore(graphDir);
    const data = makeTestGraphData('legacy-api', 5);
    store.save(data);

    expect(store.exists()).toBe(true);
    expect(store.load().nodes.length).toBe(5);
  });

  it('JsonMetaStore 旧式单参数构造仍可用', () => {
    const graphDir = path.join(tmpDir, 'my-graph');
    fs.mkdirSync(graphDir, { recursive: true });

    const store = new JsonMetaStore(graphDir);
    const meta = createEmptyMeta();
    store.save(meta);

    expect(store.exists()).toBe(true);
    expect(store.load()?.schemaVersion).toBeTruthy();
  });

  it('BinaryVectorStore 旧式单参数构造仍可用', () => {
    const graphDir = path.join(tmpDir, 'my-graph');
    fs.mkdirSync(graphDir, { recursive: true });

    const store = new BinaryVectorStore(graphDir);
    const vecs = new Float32Array(10);
    store.save(vecs, 5);

    expect(store.exists()).toBe(true);
    expect(store.getCount()).toBe(2);
  });

  it('VectorMappingStore 旧式单参数构造仍可用', () => {
    const graphDir = path.join(tmpDir, 'my-graph');
    fs.mkdirSync(graphDir, { recursive: true });

    const store = new VectorMappingStore(graphDir);
    store.save({
      indexToNodeId: ['a', 'b'],
      nodeIdToIndex: new Map([['a', 0], ['b', 1]]),
    });

    expect(store.exists()).toBe(true);
    expect(store.load()?.indexToNodeId.length).toBe(2);
  });
});
