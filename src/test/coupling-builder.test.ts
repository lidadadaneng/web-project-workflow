import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EdgeBuilder } from '../graph/builders/edge-builder';
import { buildSiblingEdges } from '../graph/builders/coupling-builder';
import type { GraphNode, GraphEdge } from '../graph/types';
import { EDGE_TYPE_SIBLING, EDGE_TYPE_BUSINESS_MAP } from '../graph/types';

/** 构造测试用节点 */
function mkFile(id: string, filePath: string, level: GraphNode['level'] = 'L2'): GraphNode {
  return {
    id,
    level,
    type: level === 'L2' ? 'file' : 'class',
    name: filePath.split('/').pop() ?? id,
    attrs: { filePath },
    createdAt: 0,
    updatedAt: 0,
  };
}

function mkCap(id: string, name: string): GraphNode {
  return { id, level: 'C', type: 'capability', name, attrs: {}, createdAt: 0, updatedAt: 0 };
}

/** 装载一批 business_map 边与对应节点 */
function setup(map: Array<[string, string, number]>): {
  builder: EdgeBuilder;
  nodeById: Map<string, GraphNode>;
} {
  const builder = new EdgeBuilder();
  const nodeById = new Map<string, GraphNode>();
  const caps = new Set<string>();
  for (const [capId, fileId, weight] of map) {
    if (!caps.has(capId)) {
      caps.add(capId);
      nodeById.set(capId, mkCap(capId, capId));
    }
    if (!nodeById.has(fileId)) nodeById.set(fileId, mkFile(fileId, `${fileId}.java`));
    builder.addBusinessMap(capId, fileId, weight, 'semantic');
  }
  return { builder, nodeById };
}

const siblingsOf = (edges: GraphEdge[], id: string): GraphEdge[] =>
  edges.filter((e) => e.type === EDGE_TYPE_SIBLING && e.from === id);

test('buildSiblingEdges: 同能力的文件两两相连，权重取两侧较弱值', () => {
  const { builder, nodeById } = setup([
    ['cap:cart', 'f:cartController', 0.5],
    ['cap:cart', 'f:cartService', 0.4],
    ['cap:cart', 'f:cartEntity', 0.6],
  ]);

  const stats = buildSiblingEdges(builder, nodeById);
  const edges = builder.getEdges().filter((e) => e.type === EDGE_TYPE_SIBLING);

  // 3 个文件 → 3 对 → 双向 6 条
  assert.equal(stats.capabilities, 1);
  assert.equal(stats.files, 3);
  assert.equal(edges.length, 6);

  const c2s = edges.find((e) => e.from === 'f:cartController' && e.to === 'f:cartService');
  const c2e = edges.find((e) => e.from === 'f:cartController' && e.to === 'f:cartEntity');
  assert.equal(c2s?.weight, 0.4, '取两侧较弱的 0.5 与 0.4');
  assert.equal(c2e?.weight, 0.5, '取两侧较弱的 0.5 与 0.6');
  // 对称：反方向权重相同
  assert.equal(edges.find((e) => e.from === 'f:cartService' && e.to === 'f:cartController')?.weight, 0.4);
});

test('buildSiblingEdges: 不同能力的文件之间不连边', () => {
  const { builder, nodeById } = setup([
    ['cap:cart', 'f:cartController', 0.5],
    ['cap:cart', 'f:cartService', 0.4],
    ['cap:order', 'f:orderController', 0.5],
    ['cap:order', 'f:orderService', 0.4],
  ]);

  buildSiblingEdges(builder, nodeById);
  const edges = builder.getEdges().filter((e) => e.type === EDGE_TYPE_SIBLING);
  assert.equal(edges.length, 4, '两个能力各 1 对 → 双向 4 条');
  assert.equal(edges.some((e) => e.from.startsWith('f:cart') && e.to.startsWith('f:order')), false);
  assert.equal(edges.some((e) => e.from.startsWith('f:order') && e.to.startsWith('f:cart')), false);
});

test('buildSiblingEdges: 单一文件的能力不产生边', () => {
  const { builder, nodeById } = setup([
    ['cap:solo', 'f:onlyOne', 0.5],
    ['cap:cart', 'f:a', 0.5],
    ['cap:cart', 'f:b', 0.4],
  ]);

  const stats = buildSiblingEdges(builder, nodeById);
  assert.equal(stats.capabilities, 1, '只有 cart 有能力内的文件对');
  assert.equal(builder.getEdges().filter((e) => e.type === EDGE_TYPE_SIBLING).length, 2);
});

test('buildSiblingEdges: 超出上限的文件被截断（按权重保留前 K）', () => {
  const map: Array<[string, string, number]> = [];
  for (let i = 0; i < 10; i += 1) map.push(['cap:big', `f:${i}`, 0.9 - i * 0.05]);
  const { builder, nodeById } = setup(map);

  const stats = buildSiblingEdges(builder, nodeById, { maxFilesPerCapability: 4 });
  assert.equal(stats.truncated, 6);
  assert.equal(stats.files, 4);
  // 保留权重最高的 4 个 → 6 对 → 12 条
  assert.equal(stats.edges, 12);
  const kept = new Set(builder.getEdges().filter((e) => e.type === EDGE_TYPE_SIBLING).map((e) => e.from));
  assert.deepEqual([...kept].sort(), ['f:0', 'f:1', 'f:2', 'f:3']);
});

test('buildSiblingEdges: 同一文件的多个元素归并到一个文件，权重取最强', () => {
  const builder = new EdgeBuilder();
  const nodeById = new Map<string, GraphNode>();
  nodeById.set('cap:cart', mkCap('cap:cart', 'cart'));
  // 同一个文件的类节点（L3）与文件节点（L2）同时被映射
  nodeById.set('f:elements', mkFile('f:elements', 'src/Entity.java', 'L3'));
  nodeById.set('f:file', mkFile('f:file', 'src/Entity.java', 'L2'));
  nodeById.set('f:other', mkFile('f:other', 'src/Other.java'));
  builder.addBusinessMap('cap:cart', 'f:elements', 0.3, 'semantic');
  builder.addBusinessMap('cap:cart', 'f:file', 0.5, 'semantic');
  builder.addBusinessMap('cap:cart', 'f:other', 0.4, 'semantic');

  const stats = buildSiblingEdges(builder, nodeById);
  assert.equal(stats.files, 2, '两个物理文件');
  // 同一文件保留层级较高的节点（文件节点而非类节点），且权重取最强的 0.5
  const e = builder.getEdges().find((x) => x.type === EDGE_TYPE_SIBLING && x.from === 'f:file');
  assert.equal(e?.to, 'f:other');
  assert.equal(e?.weight, 0.4, '取两侧较弱值：min(0.5, 0.4)');
});

test('buildSiblingEdges: 无文件归属的目标（模块目录）不参与连边', () => {
  const builder = new EdgeBuilder();
  const nodeById = new Map<string, GraphNode>();
  nodeById.set('cap:cart', mkCap('cap:cart', 'cart'));
  nodeById.set('f:a', mkFile('f:a', 'src/A.java'));
  // L1 模块节点只有 dir，没有 filePath
  nodeById.set('mod:cart', {
    id: 'mod:cart', level: 'L1', type: 'module', name: 'cart',
    attrs: { dir: 'src/main/java/com/cart' }, createdAt: 0, updatedAt: 0,
  });
  builder.addBusinessMap('cap:cart', 'f:a', 0.5, 'semantic');
  builder.addBusinessMap('cap:cart', 'mod:cart', 0.6, 'semantic');

  const stats = buildSiblingEdges(builder, nodeById);
  assert.equal(stats.edges, 0, '一个文件配一个目录，构不成文件对');
});

test('buildSiblingEdges: 只读 business_map 边，不理会其他类型', () => {
  const { builder, nodeById } = setup([
    ['cap:cart', 'f:a', 0.5],
    ['cap:cart', 'f:b', 0.4],
  ]);
  const before = builder.getEdges().length;
  const stats = buildSiblingEdges(builder, nodeById);
  assert.equal(stats.edges, 2);
  assert.equal(builder.getEdges().length, before + 2);
  assert.equal(builder.getEdges().every((e) => e.type === EDGE_TYPE_BUSINESS_MAP || e.type === EDGE_TYPE_SIBLING), true);
});