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
import type { ParsedRequirement } from '../graph/parsers/requirement-parser';
import type { ParsedModule } from '../graph/parsers/module-parser';
import { getDefaultGraphConfig } from '../graph/config';

/** 构造测试用节点 */
function mkNode(id: string, level: GraphNode['level'], type: GraphNode['type'], name: string): GraphNode {
  return { id, level, type, name, attrs: {}, createdAt: 0, updatedAt: 0 };
}

function mkReq(id: string, name: string, extractedModules: string[] = []): ParsedRequirement {
  return {
    node: mkNode(id, 'L1', 'requirement', name),
    dirPath: '/tmp/req',
    vectorText: name,
    extractedModules,
    extractedInterfaces: [],
  };
}

function mkMod(id: string, name: string): ParsedModule {
  return { node: mkNode(id, 'L2', 'module', name), dir: `src/${name}` };
}

// ==================== Task 3.5: Git 历史追溯单测 ====================

test('collectGitEvidences: 频次归一化 + gitMinFreq 过滤 + 权重正确', () => {
  const req = mkReq('req:login', '登录', []);
  const config = getDefaultGraphConfig();
  const filePathToNodeId = new Map<string, string>([
    ['src/auth/login.ts', 'file:login'],
    ['src/auth/session.ts', 'file:session'],
    ['src/utils/helper.ts', 'file:helper'],
  ]);
  // mock traceGit：login 5 次、session 3 次、helper 1 次
  const traceGit = () => ({
    fileCounts: new Map<string, number>([
      ['src/auth/login.ts', 5],
      ['src/auth/session.ts', 3],
      ['src/utils/helper.ts', 1],
    ]),
    totalCommits: 3,
  });

  const evidences: any[] = [];
  collectGitEvidences(req, '/tmp/root', config, traceGit, filePathToNodeId, 2, evidences);

  // maxFreq=5；helper(1) < gitMinFreq(2) 被过滤
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
  const req = mkReq('req:x', 'X', []);
  const config = getDefaultGraphConfig();
  const traceGit = () => ({ fileCounts: new Map<string, number>(), totalCommits: 0 });
  const evidences: any[] = [];
  collectGitEvidences(req, '/tmp', config, traceGit, new Map(), 2, evidences);
  assert.equal(evidences.length, 0);
});

test('buildBusinessMapEdges: 非 Git 仓库跳过 Git 源（traceGit 不被调用）', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-bm-'));
  const req = mkReq('req:auth', '认证', ['auth']);
  const mod = mkMod('mod:auth', 'auth');
  const config = getDefaultGraphConfig();

  // traceGit 若被调用即抛错（断言 useGit=false 时不调用）
  const ctx: BusinessMapContext = {
    reqs: [req],
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
  // 不应抛错
  buildBusinessMapEdges(eb, ctx);
  const edges = eb.getEdges();
  // doc-extract 仍应生成 req->mod:auth 边
  assert.ok(edges.some((e) => e.source === 'doc-extract'), 'doc-extract 边应存在');
  assert.ok(!edges.some((e) => e.source === 'git-history'), '非 Git 仓库不应生成 git-history 边');
});

// ==================== Task 4.5: 语义匹配单测 ====================

test('collectSemanticEvidences: 高相似 L2/L3 节点生成语义证据，低相似被阈值过滤', () => {
  const req = mkReq('req:login', '登录');
  // 2 维向量：req=[1,0], mod:a=[1,0](sim1.0), mod:b=[0,1](sim0), file:c=[1,0](sim1.0)
  const dimensions = 2;
  const vectors = new Float32Array([1, 0, 1, 0, 0, 1, 1, 0]);
  const mapping: VectorMapping = {
    indexToNodeId: ['req:login', 'mod:a', 'mod:b', 'file:c'],
    nodeIdToIndex: new Map([
      ['req:login', 0],
      ['mod:a', 1],
      ['mod:b', 2],
      ['file:c', 3],
    ]),
  };
  const nodeById = new Map<string, GraphNode>([
    ['mod:a', mkNode('mod:a', 'L2', 'module', 'auth')],
    ['mod:b', mkNode('mod:b', 'L2', 'module', 'other')],
    ['file:c', mkNode('file:c', 'L3', 'file', 'login.ts')],
  ]);

  const evidences: any[] = [];
  collectSemanticEvidences(req, vectors, dimensions, mapping, nodeById, 0.5, 5, evidences);

  assert.equal(evidences.length, 2, 'mod:a 与 file:c 高相似命中，mod:b 低相似被过滤');
  const modA = evidences.find((e) => e.targetId === 'mod:a')!;
  const fileC = evidences.find((e) => e.targetId === 'file:c')!;
  assert.equal(modA.source, 'semantic');
  assert.equal(modA.baseWeight, 0.6, 'sim=1.0 -> min(0.7, 0.6)=0.6');
  assert.equal(fileC.source, 'semantic');
  assert.equal(fileC.baseWeight, 0.6);
  assert.equal(evidences.find((e) => e.targetId === 'mod:b'), undefined, 'mod:b sim=0 被阈值过滤');
  assert.equal(evidences.find((e) => e.targetId === 'req:login'), undefined, '不应生成自身到自身的证据');
});

test('collectSemanticEvidences: 需求节点无向量时跳过', () => {
  const req = mkReq('req:novec', '无向量需求');
  const dimensions = 2;
  const vectors = new Float32Array([1, 0]);
  const mapping: VectorMapping = {
    indexToNodeId: ['some:node'],
    nodeIdToIndex: new Map([['some:node', 0]]), // req:novec 不在映射中
  };
  const nodeById = new Map<string, GraphNode>([['some:node', mkNode('some:node', 'L2', 'module', 'x')]]);
  const evidences: any[] = [];
  collectSemanticEvidences(req, vectors, dimensions, mapping, nodeById, 0.5, 5, evidences);
  assert.equal(evidences.length, 0, '需求无向量时应跳过');
});

test('buildBusinessMapEdges: 向量缺失时跳过语义源但仍生成其他源边', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-bm2-'));
  const req = mkReq('req:auth', '认证', ['auth']);
  const mod = mkMod('mod:auth', 'auth');
  const config = getDefaultGraphConfig();
  const ctx: BusinessMapContext = {
    reqs: [req],
    modules: [mod],
    fileNodes: new Map(),
    root: tmpRoot,
    config,
    vectors: null, // 语义源不可用
    dimensions: 0,
    mapping: null,
  };
  const eb = new EdgeBuilder();
  buildBusinessMapEdges(eb, ctx);
  const edges = eb.getEdges();
  assert.ok(edges.some((e) => e.source === 'doc-extract'), 'doc-extract 边应存在');
  assert.ok(!edges.some((e) => e.source === 'semantic'), '向量缺失时不应生成 semantic 边');
});

// ==================== Task 5.4: 四源集成测试 ====================

test('集成: 四源同时命中，noisy-OR 聚合 + 多源溯源分布正确', () => {
  // 场景：需求「用户认证」
  //   - doc-extract:  extractedModules=['auth'] -> mod:auth (0.85)
  //   - name-match:   '用户认证' 经 认证->auth 命中 mod:auth (0.5*0.5=0.25)
  //   - semantic:     req 向量与 mod:auth 向量 sim=1.0 -> (0.6)
  //   - git-history:  commit 修改 src/auth/login.ts 5 次 -> file:login (0.6)
  // 期望边：
  //   req -> mod:auth  : doc+name+semantic 聚合 ≈ 0.95，source=doc-extract（rank 最高）
  //   req -> file:login: git-history 单源 0.6，source=git-history
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-int-'));
  const req = mkReq('req:auth', '用户认证', ['auth']);
  const mod = mkMod('mod:auth', 'auth');
  const fileLogin = mkNode('file:login', 'L3', 'file', 'login.ts');
  const config = getDefaultGraphConfig();

  // 向量：req=[1,0], mod:auth=[1,0](sim1.0), file:login=[0,1](sim0，被阈值过滤)
  const dimensions = 2;
  const vectors = new Float32Array([1, 0, 1, 0, 0, 1]);
  const mapping: VectorMapping = {
    indexToNodeId: ['req:auth', 'mod:auth', 'file:login'],
    nodeIdToIndex: new Map([
      ['req:auth', 0],
      ['mod:auth', 1],
      ['file:login', 2],
    ]),
  };

  const ctx: BusinessMapContext = {
    reqs: [req],
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
    isGit: () => true, // 注入：绕过真实 Git 仓库判定，激活 git 源
  };

  const eb = new EdgeBuilder();
  buildBusinessMapEdges(eb, ctx);
  const edges = eb.getEdges();

  assert.equal(edges.length, 2, '应生成 2 条 business_map 边');

  const modEdge = edges.find((e) => e.to === 'mod:auth')!;
  const fileEdge = edges.find((e) => e.to === 'file:login')!;

  // mod:auth: noisy-OR(0.85, 0.25, 0.6) = 1-(0.15)(0.75)(0.4)=0.955 -> cap 0.95
  assert.ok(modEdge, '应存在 req->mod:auth 边');
  assert.equal(modEdge.source, 'doc-extract', '多源命中取最权威 doc-extract');
  assert.ok(Math.abs(modEdge.weight - 0.95) < 1e-6, `mod:auth 权重应≈0.95，实际 ${modEdge.weight}`);

  // file:login: git-history 单源 0.6
  assert.ok(fileEdge, '应存在 req->file:login 边');
  assert.equal(fileEdge.source, 'git-history');
  assert.ok(Math.abs(fileEdge.weight - 0.6) < 1e-6, `file:login 权重应 0.6，实际 ${fileEdge.weight}`);

  // 溯源分布含 doc-extract 与 git-history
  const sources = new Set(edges.map((e) => e.source));
  assert.ok(sources.has('doc-extract'));
  assert.ok(sources.has('git-history'));
});

