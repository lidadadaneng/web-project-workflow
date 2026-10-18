import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HierarchicalSerializer } from '../graph/compression/hierarchical-serializer';
import { extractSkeleton, formatSkeletonLine } from '../graph/compression/skeleton-extractor';
import type { GraphData, GraphEdge, GraphNode, Subgraph } from '../graph/types';

/**
 * 压缩保真：路径与标识符不压缩
 *
 * 背景：定位类任务的答案格式是文件路径（`src/main/java/com/service/impl/X.java`）。
 * 早先的序列化只输出节点名称（`TokenServiceImpl.java`）与模块名（`service-layer`），
 * 压缩文本里一个路径都没有，下游拿不到答案、只能按包名猜——实测中曾因此提交
 * `com/service/TokenServiceImpl.java` 这个并不存在的路径。
 *
 * 这里验证路径属于节点身份、在任何压缩等级下都保留，并验证重复元素的合并。
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

/** 一张最小的能力 → 模块 → 文件 → 元素图，路径信息齐备 */
function fixture(): GraphData {
  return {
    nodes: [
      node('cap:auth', 'C', 'capability', 'auth-interceptor'),
      node('mod:interceptor', 'L1', 'module', 'interceptor-layer', { dir: 'src/main/java/com/interceptor' }),
      node('file:ai', 'L2', 'file', 'AuthorizationInterceptor.java', { filePath: 'src/main/java/com/interceptor/AuthorizationInterceptor.java' }),
      node('file:ti', 'L2', 'file', 'TokenServiceImpl.java', { filePath: 'src/main/java/com/service/impl/TokenServiceImpl.java' }),
      node('elem:preHandle', 'L3', 'function', 'AuthorizationInterceptor.preHandle', { filePath: 'src/main/java/com/interceptor/AuthorizationInterceptor.java' }),
      // 同名重载：解析成两个同名节点
      node('elem:g1', 'L3', 'function', 'TokenServiceImpl.getToken', { filePath: 'src/main/java/com/service/impl/TokenServiceImpl.java' }),
      node('elem:g2', 'L3', 'function', 'TokenServiceImpl.getToken', { filePath: 'src/main/java/com/service/impl/TokenServiceImpl.java' }),
      node('elem:g3', 'L3', 'function', 'TokenServiceImpl.getToken', { filePath: 'src/main/java/com/service/impl/TokenServiceImpl.java' }),
      // 另一模块下的同名文件：依赖关系里必须带目录
      node('mod:admin', 'L1', 'module', 'admin-source', { dir: 'src/main/resources/admin' }),
      node('file:list1', 'L2', 'file', 'list.vue', { filePath: 'src/main/resources/admin/list.vue' }),
      node('file:list2', 'L2', 'file', 'list.vue', { filePath: 'src/main/resources/front/list.vue' }),
    ],
    edges: [
      edge('cap:auth', 'file:ai', 'business_map', 0.4),
      edge('cap:auth', 'file:ti', 'business_map', 0.4),
      edge('cap:auth', 'elem:preHandle', 'business_map', 0.35),
      edge('mod:interceptor', 'file:ai', 'contain', 0.9),
      edge('mod:admin', 'file:list1', 'contain', 0.9),
      edge('mod:admin', 'file:list2', 'contain', 0.9),
      edge('file:ai', 'elem:preHandle', 'contain', 0.9),
      edge('file:ti', 'elem:g1', 'contain', 0.9),
      edge('file:ti', 'elem:g2', 'contain', 0.9),
      edge('file:ti', 'elem:g3', 'contain', 0.9),
      edge('file:ai', 'file:ti', 'import', 0.75),
      edge('file:list1', 'file:list2', 'import', 0.75),
    ],
  };
}

function serialize(data: GraphData, level: 'loose' | 'standard' | 'extreme' = 'standard') {
  const subgraph: Subgraph = {
    nodes: data.nodes,
    edges: data.edges,
    anchors: ['cap:auth'],
    distances: new Map(data.nodes.map((n) => [n.id, 0])),
    scores: new Map(),
  };
  return new HierarchicalSerializer(subgraph, { level }).serialize({ showStats: false });
}

test('文件与模块节点输出完整路径，不再是裸名称', () => {
  const { text } = serialize(fixture());
  assert.ok(text.includes('src/main/java/com/interceptor/AuthorizationInterceptor.java'), '文件节点应给全路径');
  assert.ok(text.includes('src/main/java/com/service/impl/TokenServiceImpl.java'), '文件节点应给全路径');
  assert.ok(text.includes('src/main/java/com/interceptor'), '模块节点应给模块目录');
  // 路径的最后一层就是原来的裸名称，没有信息丢失
  assert.ok(!/\[文件\] AuthorizationInterceptor\.java/.test(text), '不应再只写裸文件名');
});

test('路径在任何压缩等级都保留（含 extreme）', () => {
  for (const level of ['loose', 'standard', 'extreme'] as const) {
    const { text } = serialize(fixture(), level);
    assert.ok(
      text.includes('src/main/java/com/service/impl/TokenServiceImpl.java'),
      `${level} 档应当保留文件路径`,
    );
  }
});

test('能力层的关联按文件归并后给路径，同名元素不重复占行', () => {
  const { text } = serialize(fixture());
  const capBlock = text.slice(text.indexOf('--- 能力层'), text.indexOf('--- 结构层'));
  assert.ok(capBlock.includes('src/main/java/com/service/impl/TokenServiceImpl.java'), '能力层关联应给文件路径');
  assert.ok(capBlock.includes('src/main/java/com/interceptor/AuthorizationInterceptor.java'), '能力层关联应给文件路径');
  // TokenServiceImpl.java 同时以文件节点与元素所在文件两种身份出现，但归并后只占一行
  assert.equal(capBlock.split('src/main/java/com/service/impl/TokenServiceImpl.java').length - 1, 1);
});

test('同名叶节点合并为一条并标注重数', () => {
  const { text } = serialize(fixture());
  assert.ok(/TokenServiceImpl\.getToken ×3/.test(text), `重载方法应合并为 ×3，实际输出：\n${text}`);
});

test('依赖关系只对重名文件补目录，不重名的仍写名称', () => {
  const { text } = serialize(fixture());
  const depBlock = text.slice(text.indexOf('--- 依赖关系 ---'));
  assert.ok(depBlock.includes('src/main/resources/admin/list.vue'), '重名文件应带目录');
  assert.ok(depBlock.includes('src/main/resources/front/list.vue'), '重名文件应带目录');
  assert.ok(/\bAuthorizationInterceptor\.java → TokenServiceImpl\.java\b/.test(depBlock), '不重名的仍只写名称');
});

test('父文件不在子图里的元素节点也要输出，且带上所属文件路径', () => {
  // 节点上限裁剪会把元素留下、把它的文件父节点裁掉；元素又是靠调用/业务映射边
  // 单独够到的。这类节点走不进包含树，早先会整条消失在上下文里——够得着却看不见。
  const data: GraphData = {
    nodes: [
      node('cap:svc', 'C', 'capability', 'common-service'),
      node('elem:impl', 'L3', 'class', 'CommonServiceImpl', { filePath: 'src/main/java/com/service/impl/CommonServiceImpl.java' }),
    ],
    edges: [
      edge('cap:svc', 'elem:impl', 'business_map', 0.4),
    ],
  };
  const { text } = serialize(data);
  assert.ok(
    text.includes('src/main/java/com/service/impl/CommonServiceImpl.java'),
    `树外元素应带所属文件路径输出，实际输出：\n${text}`,
  );
  assert.ok(text.includes('其他可达节点'), '应有一段专门收容树外节点');
});

test('树内已输出的节点不再在补漏段重复', () => {
  const { text } = serialize(fixture());
  const orphanBlock = text.indexOf('--- 其他可达节点');
  if (orphanBlock >= 0) {
    const tail = text.slice(orphanBlock);
    assert.ok(!tail.includes('src/main/java/com/interceptor/AuthorizationInterceptor.java'),
      '已在包含树里输出的文件不应出现在补漏段');
  }
});

test('extractSkeleton 把路径当作身份、不随等级变化', () => {
  const fileNode = node('f', 'L2', 'file', 'TokenServiceImpl.java', {
    filePath: 'src/main/java/com/service/impl/TokenServiceImpl.java',
    signature: 'class TokenServiceImpl',
  });
  for (const level of ['full', 'standard', 'minimal'] as const) {
    assert.equal(
      extractSkeleton(fileNode, level).path,
      'src/main/java/com/service/impl/TokenServiceImpl.java',
    );
  }
  // 文件节点即使带上了签名，输出的仍是路径而不是名称
  assert.ok(formatSkeletonLine(extractSkeleton(fileNode, 'full')).includes('src/main/java/com/service/impl/'));
});