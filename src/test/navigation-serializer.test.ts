import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavigationSerializer } from '../graph/compression/navigation-serializer';
import { HierarchicalSerializer } from '../graph/compression/hierarchical-serializer';
import type { GraphEdge, GraphNode, Subgraph } from '../graph/types';

/**
 * 导航式序列化：只给「往哪里看」，不给内容
 *
 * 用法前提：图谱在任务里是搜索辅助件，读什么、读多少由调用方决定，因此它的输出应当
 * 是一张地图（锚点 + 候选路径 + 够到它的关系），而不是一段替调用方选好的材料。
 *
 * 这里验证四件事：候选位置给全路径、够到的关系可解释、锚点位置排在最前、
 * 以及输出里不出现任何非锚点的元素名（导航不是内容）。
 */

function node(
  id: string,
  level: GraphNode['level'],
  type: GraphNode['type'],
  name: string,
  attrs: GraphNode['attrs'] = {},
): GraphNode {
  return { id, level, type, name, attrs, createdAt: 0, updatedAt: 0 };
}

function edge(from: string, to: string, type: GraphEdge['type'], weight: number): GraphEdge {
  return { id: `${from}-${type}-${to}`, from, to, type, weight, source: 'structure' };
}

const FILE_AI = 'src/main/java/com/interceptor/AuthorizationInterceptor.java';
const FILE_TI = 'src/main/java/com/service/impl/TokenServiceImpl.java';
const FILE_VAL = 'src/main/java/com/utils/ValidatorUtils.java';

/**
 * 一张最小的能力 → 模块 → 文件 → 元素图。
 *
 * 距离设定让每个位置有唯一的「最近来源」：
 *   cap:auth(0) ─业务映射 0.40→ file:ai(1) ─导入 0.75→ file:ti(2)
 *   mod:interceptor(1) ─包含 0.90→ file:ai
 */
function subgraph(): Subgraph {
  const nodes: GraphNode[] = [
    node('cap:auth', 'C', 'capability', 'auth-interceptor'),
    node('mod:interceptor', 'L1', 'module', 'interceptor-layer', { dir: 'src/main/java/com/interceptor' }),
    node('file:ai', 'L2', 'file', 'AuthorizationInterceptor.java', { filePath: FILE_AI }),
    node('file:ti', 'L2', 'file', 'TokenServiceImpl.java', { filePath: FILE_TI }),
    node('elem:preHandle', 'L3', 'function', 'AuthorizationInterceptor.preHandle', { filePath: FILE_AI }),
    node('elem:g1', 'L3', 'function', 'TokenServiceImpl.getToken', { filePath: FILE_TI }),
    node('elem:g2', 'L3', 'function', 'TokenServiceImpl.getToken', { filePath: FILE_TI }),
    node('elem:g3', 'L3', 'function', 'TokenServiceImpl.getToken', { filePath: FILE_TI }),
    node('cap:session', 'C', 'capability', 'session-user'),
    node('file:val', 'L2', 'file', 'ValidatorUtils.java', { filePath: FILE_VAL }),
  ];
  const edges: GraphEdge[] = [
    edge('cap:auth', 'file:ai', 'business_map', 0.40),
    edge('mod:interceptor', 'file:ai', 'contain', 0.90),
    edge('file:ai', 'elem:preHandle', 'contain', 0.90),
    edge('file:ai', 'file:ti', 'import', 0.75),
    edge('file:ti', 'elem:g1', 'contain', 0.90),
    edge('file:ti', 'elem:g2', 'contain', 0.90),
    edge('file:ti', 'elem:g3', 'contain', 0.90),
    edge('cap:session', 'file:val', 'business_map', 0.45),
  ];
  const distances = new Map<string, number>([
    ['cap:auth', 0], ['file:ai', 1], ['mod:interceptor', 1],
    ['file:ti', 2], ['elem:preHandle', 2], ['elem:g1', 2], ['elem:g2', 2], ['elem:g3', 2],
    ['cap:session', 1], ['file:val', 2],
  ]);
  const scores = new Map<string, number>([
    ['cap:auth', 1], ['file:ai', 0.8], ['mod:interceptor', 0.5], ['file:ti', 0.6],
    ['cap:session', 0.4], ['file:val', 0.35],
  ]);
  return { nodes, edges, anchors: ['cap:auth', 'file:ai'], distances, scores };
}

test('导航输出候选文件全路径，并标出锚点所在位置', () => {
  const { text } = new NavigationSerializer(subgraph()).serialize();
  assert.ok(text.includes(FILE_AI), '应给出文件全路径');
  assert.ok(text.includes(FILE_TI), '应给出文件全路径');
  assert.ok(text.includes('src/main/java/com/interceptor'), '应给出模块目录');
  assert.ok(text.includes('◉ 锚点所在'), '锚点所在的文件要标出来');
});

test('每条候选都能解释「是怎么够到的」', () => {
  const { text } = new NavigationSerializer(subgraph()).serialize();
  assert.match(text, /导入 0\.75 ← src\/main\/java\/com\/interceptor\/AuthorizationInterceptor\.java/,
    'TokenServiceImpl 应标出是由导入边从拦截器文件够到的');
  assert.match(text, /业务映射 0\.45 ← C:session-user/,
    '非锚点的能力所关联的文件应标出是由业务映射够到的');
});

test('导航不是内容：不输出非锚点的元素名', () => {
  const { text } = new NavigationSerializer(subgraph()).serialize();
  assert.ok(!text.includes('TokenServiceImpl.getToken'), '元素名属于内容，不应出现在导航里');
  assert.ok(!text.includes('preHandle'), '元素名属于内容，不应出现在导航里');
  // 锚点自身要列出来（否则不知道是从哪起搜的）
  assert.ok(text.includes('auth-interceptor'), '锚点名称要列出');
});

test('同一文件里的元素合并成一条位置，只报个数', () => {
  const { candidates } = new NavigationSerializer(subgraph()).serialize();
  const ti = candidates.find((c) => c.path === FILE_TI);
  assert.ok(ti, 'TokenServiceImpl 应在候选里');
  assert.equal(ti.elementCount, 4, '文件节点加 3 个同名重载方法应合成 4 个元素');
  assert.equal(candidates.filter((c) => c.path === FILE_TI).length, 1, '同一路径只出现一次');
});

test('锚点所在位置排在候选首位', () => {
  const { candidates } = new NavigationSerializer(subgraph()).serialize();
  assert.equal(candidates[0].path, FILE_AI, '锚点所在文件应排在最前');
  assert.equal(candidates[0].isAnchorSite, true);
});

test('默认不截断候选位置：够得着的路径必须全部出现', () => {
  // 早先的实现把候选截到 20 条，二十题的离线复测里导航文本只覆盖 34/62 个金标文件，
  // 而同一张子图够得着 55 个——被截掉的正是答案。导航是搜索辅助件，漏路径等于没搜到。
  const sg = subgraph();
  for (let i = 0; i < 40; i++) {
    const p = `src/main/java/com/gen/File${i}.java`;
    sg.nodes.push(node(`file:g${i}`, 'L2', 'file', `File${i}.java`, { filePath: p }));
    sg.edges.push(edge('cap:session', `file:g${i}`, 'business_map', 0.4));
    sg.distances.set(`file:g${i}`, 2);
    sg.scores.set(`file:g${i}`, 0.3);
  }
  const { text, candidates } = new NavigationSerializer(sg).serialize();
  assert.equal(candidates.length, 44, '候选位置数应为 4 个原有位置加 40 个新位置');
  for (let i = 0; i < 40; i++) {
    assert.ok(text.includes(`src/main/java/com/gen/File${i}.java`), `File${i}.java 不应被截断`);
  }
});

test('导航的体积随位置数增长，不随元素数增长', () => {
  const before = new NavigationSerializer(subgraph()).serialize();

  // 同一个文件里再塞 20 个元素：上下文正文会随之变长，导航只更新一个计数
  const sg = subgraph();
  for (let i = 0; i < 20; i++) {
    sg.nodes.push(node(`elem:x${i}`, 'L3', 'function', `TokenServiceImpl.extra${i}`, { filePath: FILE_TI }));
    sg.edges.push(edge('file:ti', `elem:x${i}`, 'contain', 0.9));
    sg.distances.set(`elem:x${i}`, 2);
  }
  const after = new NavigationSerializer(sg).serialize();

  assert.ok(after.candidates.length === before.candidates.length, '位置数不变');
  assert.ok(after.estimatedTokens - before.estimatedTokens <= 2,
    `导航只应多出一个计数位（${before.estimatedTokens} → ${after.estimatedTokens}）`);

  const ctxBefore = new HierarchicalSerializer(subgraph(), { level: 'standard' }).serialize({ showStats: false });
  const ctxAfter = new HierarchicalSerializer(sg, { level: 'standard' }).serialize({ showStats: false });
  assert.ok(ctxAfter.estimatedTokens > ctxBefore.estimatedTokens + 40,
    `同一批元素在上下文正文里会明显增加体积（${ctxBefore.estimatedTokens} → ${ctxAfter.estimatedTokens}）`);
});