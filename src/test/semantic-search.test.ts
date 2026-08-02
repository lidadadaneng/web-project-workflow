import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SemanticSearcher, computeLexBoost } from '../graph/search/semantic-search';
import { expandQueryToEnglish } from '../graph/parsers/mapping-sources';
import { GraphQuerier } from '../graph/search/graph-query';
import { getNodeVectorText } from '../graph/builders/vector-builder';
import type { GraphNode, GraphData, VectorMapping } from '../graph/types';

function mkNode(id: string, name: string, type: GraphNode['type'] = 'function', parentName?: string): GraphNode {
  return {
    id,
    level: 'L3',
    type,
    name,
    attrs: parentName ? { parentName } : {},
    createdAt: 0,
    updatedAt: 0,
  };
}

// ==================== expandQueryToEnglish ====================

test('expandQueryToEnglish: 中文查询展开为英文等价词', () => {
  const result = expandQueryToEnglish('用户注册');
  assert.ok(result.includes('用户注册'), '含原词');
  assert.ok(result.includes('用户'), '含拆分中文词 用户');
  assert.ok(result.includes('注册'), '含拆分中文词 注册');
  assert.ok(result.includes('user'), '用户 -> user');
  assert.ok(result.includes('register'), '注册 -> register');
});

test('expandQueryToEnglish: 英文查询原样保留', () => {
  const result = expandQueryToEnglish('login');
  assert.ok(result.includes('login'));
  assert.ok(!result.includes('register'), '无中文不应翻译');
});

// ==================== computeLexBoost 分级 ====================

test('computeLexBoost: 精确/互含名称匹配 +0.35', () => {
  const node = mkNode('c:rv', 'RegisterView', 'component');
  const eq = expandQueryToEnglish('RegisterView');
  assert.equal(computeLexBoost('RegisterView', eq, node), 0.35);
});

test('computeLexBoost: 英文等价词为名前缀 +0.25（注册->register 命中 RegisterView）', () => {
  const node = mkNode('c:rv', 'RegisterView', 'component');
  const eq = expandQueryToEnglish('注册'); // 含 register
  assert.equal(computeLexBoost('注册', eq, node), 0.25);
});

test('computeLexBoost: 英文等价词包含于名 +0.15', () => {
  const node = mkNode('f:au', 'AccountUser', 'function'); // user 含于名但非前缀
  const eq = ['user'];
  assert.equal(computeLexBoost('用户', eq, node), 0.15);
});

test('computeLexBoost: 英文等价词命中 parentName +0.10（区分三个 onSubmit）', () => {
  const regOnSubmit = mkNode('f:1', 'onSubmit', 'function', 'RegisterView');
  const loginOnSubmit = mkNode('f:2', 'onSubmit', 'function', 'LoginView');
  const eq = expandQueryToEnglish('注册'); // 含 register
  assert.equal(computeLexBoost('注册', eq, regOnSubmit), 0.10, 'RegisterView.onSubmit 命中 parentName');
  assert.equal(computeLexBoost('注册', eq, loginOnSubmit), 0, 'LoginView.onSubmit 无命中');
});

test('computeLexBoost: 无命中返回 0（纯语义不受影响）', () => {
  const node = mkNode('f:ru', 'readUsers');
  const eq = expandQueryToEnglish('calculate'); // calculate 不在词典
  assert.equal(computeLexBoost('calculate', eq, node), 0);
});

// ==================== search() 集成：排序倒置修复（Task 1.4） ====================

/** 构造测试用 SemanticSearcher（注入查询向量，绕过真实模型） */
function makeSearcher(nodes: GraphNode[], vectors: Float32Array, dimensions: number, mapping: VectorMapping, queryVec: Float32Array): SemanticSearcher {
  const data: GraphData = { nodes, edges: [] };
  const querier = new GraphQuerier(data);
  const searcher = new SemanticSearcher(querier, vectors, dimensions, mapping);
  // 桩 getQueryVector，避免加载真实 embedding 模型
  (searcher as any).getQueryVector = async (_q: string) => queryVec;
  return searcher;
}

test('search: 搜"注册"，RegisterView 经词汇加权反超通用函数（排序倒置修复）', async () => {
  // 单位向量：query=[1,0,0]
  // RegisterView cosine=0.5，readUsers=0.72，findAll=0.71，onLogout=0.70
  // 纯语义：readUsers > findAll > onLogout > RegisterView（倒置）
  // 加权后：RegisterView +0.25(prefix) = 0.75 > readUsers 0.72 -> RegisterView 置顶
  const nodes = [
    mkNode('c:rv', 'RegisterView', 'component'),
    mkNode('f:ru', 'readUsers'),
    mkNode('f:fa', 'findAll'),
    mkNode('f:ol', 'onLogout'),
  ];
  const dim = 3;
  const vectors = new Float32Array([
    0.5, 0.866, 0, // RegisterView
    0.72, 0.694, 0, // readUsers
    0.71, 0.703, 0, // findAll
    0.7, 0.714, 0, // onLogout
  ]);
  const mapping: VectorMapping = {
    indexToNodeId: ['c:rv', 'f:ru', 'f:fa', 'f:ol'],
    nodeIdToIndex: new Map([
      ['c:rv', 0], ['f:ru', 1], ['f:fa', 2], ['f:ol', 3],
    ]),
  };
  const searcher = makeSearcher(nodes, vectors, dim, mapping, new Float32Array([1, 0, 0]));

  const results = await searcher.search('注册', { limit: 10, threshold: 0 });
  assert.ok(results.length > 0);
  assert.equal(results[0].node.name, 'RegisterView', 'RegisterView 应排第一');
  assert.ok(results[0].score > 0.7, `RegisterView finalScore 应 >0.7，实际 ${results[0].score}`);
  // 通用函数应排在 RegisterView 之后
  const rvIdx = results.findIndex((r) => r.node.name === 'RegisterView');
  const ruIdx = results.findIndex((r) => r.node.name === 'readUsers');
  assert.ok(rvIdx < ruIdx, 'RegisterView 应排在 readUsers 之前');
});

test('search: 搜"RegisterView"精确匹配置顶', async () => {
  const nodes = [
    mkNode('c:rv', 'RegisterView', 'component'),
    mkNode('f:ru', 'readUsers'),
  ];
  const dim = 3;
  const vectors = new Float32Array([
    0.5, 0.866, 0, // RegisterView cosine 0.5
    0.72, 0.694, 0, // readUsers cosine 0.72
  ]);
  const mapping: VectorMapping = {
    indexToNodeId: ['c:rv', 'f:ru'],
    nodeIdToIndex: new Map([['c:rv', 0], ['f:ru', 1]]),
  };
  const searcher = makeSearcher(nodes, vectors, dim, mapping, new Float32Array([1, 0, 0]));

  const results = await searcher.search('RegisterView', { limit: 10, threshold: 0 });
  assert.equal(results[0].node.name, 'RegisterView');
  assert.ok(results[0].score >= 0.85, `精确匹配 finalScore 应 ≥0.85，实际 ${results[0].score}`);
});

test('search: 三个 onSubmit 搜"注册"，RegisterView.onSubmit 得分最高（Task 1.5）', async () => {
  const nodes = [
    mkNode('f:1', 'onSubmit', 'function', 'LoginView'),
    mkNode('f:2', 'onSubmit', 'function', 'RegisterView'),
    mkNode('f:3', 'onSubmit', 'function', 'ResetView'),
  ];
  const dim = 3;
  // 三者向量相同 -> cosine 相同（0.6）
  const v = [0.6, 0.8, 0];
  const vectors = new Float32Array([...v, ...v, ...v]);
  const mapping: VectorMapping = {
    indexToNodeId: ['f:1', 'f:2', 'f:3'],
    nodeIdToIndex: new Map([['f:1', 0], ['f:2', 1], ['f:3', 2]]),
  };
  const searcher = makeSearcher(nodes, vectors, dim, mapping, new Float32Array([1, 0, 0]));

  const results = await searcher.search('注册', { limit: 10, threshold: 0 });
  assert.equal(results[0].node.attrs.parentName, 'RegisterView', 'RegisterView.onSubmit 应排第一');
  assert.ok(results[0].score > results[1].score, '应严格高于其他 onSubmit');
});

test('search: 纯英文查询无等价词时 lexBoost=0，finalScore=cosine（Task 1.6）', async () => {
  const nodes = [mkNode('f:ru', 'readUsers')];
  const dim = 3;
  const vectors = new Float32Array([0.7, 0.714, 0]); // cosine with [1,0,0] ≈ 0.7
  const mapping: VectorMapping = {
    indexToNodeId: ['f:ru'],
    nodeIdToIndex: new Map([['f:ru', 0]]),
  };
  const searcher = makeSearcher(nodes, vectors, dim, mapping, new Float32Array([1, 0, 0]));

  const results = await searcher.search('calculate', { limit: 10, threshold: 0 });
  assert.ok(results.length > 0);
  // calculate 不在词典、不命中 readUsers 名 -> lexBoost=0 -> finalScore=cosine≈0.7
  assert.ok(Math.abs(results[0].score - 0.7) < 0.01, `finalScore 应≈cosine 0.7，实际 ${results[0].score}`);
});

// ==================== embedding 文本富化（Task 2.2） ====================

test('getNodeVectorText: 同名函数不同 filePath 产出不同文本', () => {
  const a = mkNode('f:1', 'onSubmit', 'function', 'LoginView');
  a.attrs.filePath = 'views/LoginView.vue';
  const b = mkNode('f:2', 'onSubmit', 'function', 'RegisterView');
  b.attrs.filePath = 'views/RegisterView.vue';
  const ta = getNodeVectorText(a);
  const tb = getNodeVectorText(b);
  assert.notEqual(ta, tb, '不同 filePath 应产出不同 embedding 文本');
  assert.ok(ta!.includes('LoginView.vue'), '文本应含 filePath');
  assert.ok(tb!.includes('RegisterView.vue'), '文本应含 filePath');
});
