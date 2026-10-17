import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SubgraphTrimmer } from '../graph/trimming/subgraph-trimmer';
import type { GraphData, GraphEdge, GraphNode } from '../graph/types';

/**
 * 子图裁剪的按边类型阈值单测
 *
 * 背景：结构边的权重是固定常量（contain 0.9、import 0.75），而 business_map 边的
 * 权重是语义相似度的融合值，构建侧上限 0.7、实测集中在 0.33~0.43。若两类边共用
 * 一个按结构边量级定的阈值（默认 0.7），业务映射边会被整类过滤掉，C 层锚点无法
 * 扩展到它对应的模块与文件。这里验证 minWeightByType 能把两者分开处理。
 */

function node(id: string, level: GraphNode['level']): GraphNode {
  return {
    id,
    level,
    type: 'class',
    name: id,
    attrs: {},
    createdAt: 0,
    updatedAt: 0,
  };
}

function edge(from: string, to: string, type: GraphEdge['type'], weight: number): GraphEdge {
  return {
    id: `${from}-${type}-${to}`,
    from,
    to,
    type,
    weight,
    source: 'structure',
  };
}

/** C 能力节点 --business_map(0.4)--> L1 模块 --contain(0.9)--> L2 文件 */
function fixture(): GraphData {
  return {
    nodes: [
      node('cap:cart', 'C'),
      node('mod:cart', 'L1'),
      node('file:cart', 'L2'),
    ],
    edges: [
      edge('cap:cart', 'mod:cart', 'business_map', 0.4),
      edge('mod:cart', 'file:cart', 'contain', 0.9),
    ],
  };
}

test('统一阈值 0.7 时，business_map 边不可通行，C 层锚点只返回自身', () => {
  const subgraph = new SubgraphTrimmer(fixture()).buildSubgraph(['cap:cart'], {
    depth: 2,
    minWeight: 0.7,
  });
  assert.deepEqual(subgraph.nodes.map((n) => n.id), ['cap:cart']);
});

test('minWeightByType 为 business_map 单独给阈值后，能力锚点可扩展到模块与文件', () => {
  const subgraph = new SubgraphTrimmer(fixture()).buildSubgraph(['cap:cart'], {
    depth: 2,
    minWeight: 0.7,
    minWeightByType: { business_map: 0.3 },
  });
  const ids = subgraph.nodes.map((n) => n.id).sort();
  assert.deepEqual(ids, ['cap:cart', 'file:cart', 'mod:cart']);
  // 扩展出来的业务映射边与结构边都要留在子图里
  assert.deepEqual(
    subgraph.edges.map((e) => `${e.type}:${e.weight}`).sort(),
    ['business_map:0.4', 'contain:0.9'],
  );
});

test('按类型阈值只作用于列出的边类型，其余边仍用统一阈值', () => {
  // 结构边权重 0.75 低于统一阈值 0.9，即使给了 business_map 阈值也不应放行
  const g = fixture();
  g.edges = [
    edge('cap:cart', 'mod:cart', 'business_map', 0.4),
    edge('mod:cart', 'file:cart', 'import', 0.75),
  ];
  const subgraph = new SubgraphTrimmer(g).buildSubgraph(['cap:cart'], {
    depth: 2,
    minWeight: 0.9,
    minWeightByType: { business_map: 0.3 },
  });
  assert.deepEqual(subgraph.nodes.map((n) => n.id).sort(), ['cap:cart', 'mod:cart']);
});

test('未提供按类型阈值时行为与只给 minWeight 一致', () => {
  const withOut = new SubgraphTrimmer(fixture()).buildSubgraph(['cap:cart'], {
    depth: 2,
    minWeight: 0.3,
  });
  const emptyMap = new SubgraphTrimmer(fixture()).buildSubgraph(['cap:cart'], {
    depth: 2,
    minWeight: 0.3,
    minWeightByType: {},
  });
  assert.deepEqual(
    withOut.nodes.map((n) => n.id).sort(),
    emptyMap.nodes.map((n) => n.id).sort(),
  );
});

/**
 * 扩展路径必须允许中途换向
 *
 * 锚点常常是元素节点（类、方法），指向它的包含边是从文件指过来的；而它真正要带出的
 * 目标文件在依赖边上又得顺着出边走。若把整条路径的方向钉死在起始那一跳（只走包含边
 * 向上、或只走导入边向下），这种「先上后下」的路径永远走不到，跨模块问题会大面积漏。
 */
function chainFixture(): GraphData {
  return {
    nodes: [
      node('elem:svc', 'L3'),
      node('file:svc', 'L2'),
      node('file:dep', 'L2'),
    ],
    edges: [
      // 文件包含元素（锚点在这个元素上）
      edge('file:svc', 'elem:svc', 'contain', 0.9),
      // 文件依赖另一个文件
      edge('file:svc', 'file:dep', 'import', 0.75),
    ],
  };
}

test('元素锚点：含向上的包含边、向下的导入边各一跳，可够到被依赖文件', () => {
  const subgraph = new SubgraphTrimmer(chainFixture()).buildSubgraph(['elem:svc'], {
    depth: 2,
    minWeight: 0.7,
  });
  assert.deepEqual(subgraph.nodes.map((n) => n.id).sort(), ['elem:svc', 'file:dep', 'file:svc']);
});

test('深度 1 时换向路径走不到被依赖文件（距离按跳数算）', () => {
  const subgraph = new SubgraphTrimmer(chainFixture()).buildSubgraph(['elem:svc'], {
    depth: 1,
    minWeight: 0.7,
  });
  assert.deepEqual(subgraph.nodes.map((n) => n.id).sort(), ['elem:svc', 'file:svc']);
});
/**
 * 低优先边（共能力边）不得挤掉原有可达节点
 *
 * 共能力边把同一能力下的文件直接连起来，这些文件与锚点语义高度相似、综合得分也高。
 * 节点上限一收紧，它们就会占满剩余槽位，把原本靠包含/导入边够得的节点挤出去。
 * 离线实测（6.4.8）：节点上限 100 时，任其竞争会把可达性从 52/62 压到 49/62。
 * 因此把 sibling 列为低优先：先按「去掉这些边」的可达集占位，只剩余量时再给它们。
 */
function siblingFixture(): GraphData {
  return {
    nodes: [
      node('elem:svc', 'L3'),
      node('file:svc', 'L2'),
      node('file:dep', 'L2'),
      node('file:sib1', 'L2'),
      node('file:sib2', 'L2'),
    ],
    edges: [
      edge('file:svc', 'elem:svc', 'contain', 0.9),
      edge('file:svc', 'file:dep', 'import', 0.75),
      edge('file:svc', 'file:sib1', 'sibling', 0.5),
      edge('file:svc', 'file:sib2', 'sibling', 0.5),
    ],
  };
}

/** 共能力文件给满分语义分，结构文件给 0：让低优先边在最坏情况下赢下得分排序 */
const SIB_SEMANTIC = new Map([
  ['file:sib1', 1],
  ['file:sib2', 1],
  ['file:svc', 0],
  ['file:dep', 0],
]);

test('不设低优先边：得分更高的共能力文件挤掉结构可达文件（上限 3 只留 2 个）', () => {
  const subgraph = new SubgraphTrimmer(siblingFixture()).buildSubgraph(['elem:svc'], {
    depth: 3,
    minWeight: 0.3,
    maxNodes: 3,
    semanticScores: SIB_SEMANTIC,
  });
  assert.deepEqual(subgraph.nodes.map((n) => n.id).sort(), ['elem:svc', 'file:sib1', 'file:sib2']);
});

test('sibling 列为低优先边后，结构可达文件先占位，共能力文件只在有余量时补进来', () => {
  const subgraph = new SubgraphTrimmer(siblingFixture()).buildSubgraph(['elem:svc'], {
    depth: 3,
    minWeight: 0.3,
    maxNodes: 3,
    semanticScores: SIB_SEMANTIC,
    lowPriorityEdgeTypes: ['sibling'],
  });
  assert.deepEqual(subgraph.nodes.map((n) => n.id).sort(), ['elem:svc', 'file:dep', 'file:svc']);
});

test('低优先边只做加法：上限放宽到 5 时，共能力文件仍能进子图', () => {
  const subgraph = new SubgraphTrimmer(siblingFixture()).buildSubgraph(['elem:svc'], {
    depth: 3,
    minWeight: 0.3,
    maxNodes: 5,
    semanticScores: SIB_SEMANTIC,
    lowPriorityEdgeTypes: ['sibling'],
  });
  assert.deepEqual(
    subgraph.nodes.map((n) => n.id).sort(),
    ['elem:svc', 'file:dep', 'file:sib1', 'file:sib2', 'file:svc'],
  );
});
