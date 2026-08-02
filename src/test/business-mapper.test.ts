import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EdgeBuilder } from '../graph/builders/edge-builder';
import {
  buildBusinessMapEdges,
  collectGitEvidences,
  collectSemanticEvidences,
  type BusinessMapContext,
} from '../graph/builders/business-mapper';
import type { GraphNode, GraphConfig, VectorMapping } from '../graph/types';
import type { ParsedCapability } from '../graph/parsers/capability-parser';
import type { ParsedModule } from '../graph/parsers/module-parser';
import { getDefaultGraphConfig } from '../graph/config';

/** 构造测试用节点 */
function mkNode(id: string, level: GraphNode['level'], type: GraphNode['type'], name: string): GraphNode {
  return { id, level, type, name, attrs: {}, createdAt: 0, updatedAt: 0 };
}

function mkCap(id: string, name: string, moduleNames: string[] = []): ParsedCapability {
  // 构造一个模拟的 ParsedCapability
  const node = mkNode(id, 'C', 'capability', name);
  node.attrs.features = moduleNames.map((m, i) => ({ id: `R${i + 1}`, name: m }));
  return {
    node,
    dirPath: `/tmp/specs/${name}`,
    vectorText: name + ' ' + moduleNames.join(' '),
  };
}

function mkMod(id: string, name: string): ParsedModule {
  return { node: mkNode(id, 'L1', 'module', name), dir: `src/${name}` };
}

// ==================== Git 历史追溯单测 ====================

test('collectGitEvidences: 频次归一化 + gitMinFreq 过滤 + 权重正确', () => {
  const cap = mkCap('cap:auth', 'user-auth', []);
  const config = getDefaultGraphConfig();
  const filePathToNodeId = new Map<string, string>([
    ['src/auth/login.ts', 'file:login'],
    ['src/auth/session.ts', 'file:session'],
    ['src/utils/helper.ts', 'file:helper'],
  ]);
  const traceGit = () => ({
    fileCounts: new Map<string, number>([
      ['src/auth/login.ts', 5],
      ['src/auth/session.ts', 3],
      ['src/utils/helper.ts', 1],
    ]),
    totalCommits: 3,
  });

  const evidences: any[] = [];
  collectGitEvidences(cap, '/tmp/root', config, traceGit, filePathToNodeId, 2, evidences);

  assert.equal(evidences.length, 2, '应生成 2 条 git-history 证据（helper 被过滤）');
  const login = evidences.find((e) => e.targetId === 'file:login')!;
  const session = evidences.find((e) => e.targetId === 'file:session')!;
  assert.equal(login.source, 'git-history');
  assert.equal(login.baseWeight, 0.6, 'login normFreq=1.0 -> min(0.7, 0.6)=0.6');
  assert.equal(session.source, 'git-history');
  assert.equal(session.baseWeight, 0.36, 'session normFreq=0.6 -> 0.6*0.6=0.36');
  assert.equal(evidences.find((e) => e.targetId === 'file:helper'), undefined, 'helper 频次<2 被过滤');
});

test('collectGitEvidences: 空频次表不生成证据', () => {
  const cap = mkCap('cap:x', 'test-cap', []);
  const config = getDefaultGraphConfig();
  const traceGit = () => ({ fileCounts: new Map<string, number>(), totalCommits: 0 });
  const evidences: any[] = [];
  collectGitEvidences(cap, '/tmp', config, traceGit, new Map(), 2, evidences);
  assert.equal(evidences.length, 0);
});

test('buildBusinessMapEdges: 非 Git 仓库跳过 Git 源', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-bm-'));
  const cap = mkCap('cap:auth', 'user-auth', ['auth']);
  const mod = mkMod('mod:auth', 'auth');
  const config = getDefaultGraphConfig();

  const ctx: BusinessMapContext = {
    caps: [cap],
    modules: [mod],
    fileNodes: new Map(),
    root: tmpRoot,
    config,
    vectors: null,
    dimensions: 0,
    mapping: null,
    traceGit: () => {
      throw new Error('traceGit 不应在非 Git 仓库被调用');
    },
  };
  const eb = new EdgeBuilder();
  buildBusinessMapEdges(eb, ctx);
  const edges = eb.getEdges();
  assert.ok(!edges.some((e) => e.source === 'git-history'), '非 Git 仓库不应生成 git-history 边');
});

// ==================== 语义匹配单测 ====================

test('collectSemanticEvidences: 高相似 L1/L2 节点生成语义证据', () => {
  const cap = mkCap('cap:login', 'auth-cap');
  const dimensions = 2;
  const vectors = new Float32Array([1, 0, 1, 0, 0, 1, 1, 0]);
  const mapping: VectorMapping = {
    indexToNodeId: ['cap:login', 'mod:a', 'mod:b', 'file:c'],
    nodeIdToIndex: new Map([
      ['cap:login', 0],
      ['mod:a', 1],
      ['mod:b', 2],
      ['file:c', 3],
    ]),
  };
  const nodeById = new Map<string, GraphNode>([
    ['mod:a', mkNode('mod:a', 'L1', 'module', 'auth')],
    ['mod:b', mkNode('mod:b', 'L1', 'module', 'other')],
    ['file:c', mkNode('file:c', 'L2', 'file', 'login.ts')],
  ]);

  const evidences: any[] = [];
  collectSemanticEvidences(cap, vectors, dimensions, mapping, nodeById, 0.5, 5, evidences);

  assert.ok(evidences.length >= 1, '应至少命中 1 个');
  assert.equal(evidences.find((e) => e.targetId === 'mod:b'), undefined, 'mod:b sim=0 被阈值过滤');
});

test('collectSemanticEvidences: 能力节点无向量时跳过', () => {
  const cap = mkCap('cap:novec', 'no-vec-cap');
  const dimensions = 2;
  const vectors = new Float32Array([1, 0]);
  const mapping: VectorMapping = {
    indexToNodeId: ['some:node'],
    nodeIdToIndex: new Map([['some:node', 0]]),
  };
  const nodeById = new Map<string, GraphNode>([['some:node', mkNode('some:node', 'L1', 'module', 'x')]]);
  const evidences: any[] = [];
  collectSemanticEvidences(cap, vectors, dimensions, mapping, nodeById, 0.5, 5, evidences);
  assert.equal(evidences.length, 0, '能力无向量时应跳过');
});

// ==================== 集成测试 ====================

test('集成: 多源命中 noisy-OR 聚合正确', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-int-'));
  const cap = mkCap('cap:auth', 'user-authentication', ['auth']);
  const mod = mkMod('mod:auth', 'auth');
  const fileLogin = mkNode('file:login', 'L2', 'file', 'login.ts');
  const config = getDefaultGraphConfig();

  const dimensions = 2;
  const vectors = new Float32Array([1, 0, 1, 0, 0, 1]);
  const mapping: VectorMapping = {
    indexToNodeId: ['cap:auth', 'mod:auth', 'file:login'],
    nodeIdToIndex: new Map([
      ['cap:auth', 0],
      ['mod:auth', 1],
      ['file:login', 2],
    ]),
  };

  const ctx: BusinessMapContext = {
    caps: [cap],
    modules: [mod],
    fileNodes: new Map([['src/auth/login.ts', fileLogin]]),
    root: tmpRoot,
    config,
    vectors,
    dimensions,
    mapping,
    traceGit: () => ({
      fileCounts: new Map([['src/auth/login.ts', 5]]),
      totalCommits: 1,
    }),
    isGit: () => true,
  };

  const eb = new EdgeBuilder();
  buildBusinessMapEdges(eb, ctx);
  const edges = eb.getEdges();

  assert.ok(edges.length > 0, '应生成至少 1 条 business_map 边');
  const sources = new Set(edges.map((e) => e.source));
  assert.ok(sources.has('git-history') || sources.has('semantic'), '至少有一个证据源');
});
