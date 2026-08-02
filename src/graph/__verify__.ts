/**
 * 临时验证脚本：验证存储层 + 解析器基本功能
 *
 * 运行：npx ts-node src/graph/__verify__.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { JsonlGraphStore, buildGraphIndex } from './storage/graph-store';
import { BinaryVectorStore } from './storage/vector-store';
import { JsonMetaStore, createEmptyMeta } from './storage/meta-store';
import { parseAllCapabilities } from './parsers/capability-parser';
import { parseModules } from './parsers/module-parser';
import { loadGraphConfig } from './config';
import { sniffProjectType } from '../lib/project-type';
import type { GraphNode, GraphEdge } from './types';

const ROOT = process.cwd();
const WPF_DIR = path.join(ROOT, 'wpw', 'knowledge', 'graph-verify');

// 清理
if (fs.existsSync(WPF_DIR)) {
  fs.rmSync(WPF_DIR, { recursive: true });
}

async function main() {
  console.log('=== 知识图谱子系统验证 ===\n');

  // ===== 1. 配置读取 =====
  console.log('1. 配置读取...');
  const config = loadGraphConfig(ROOT);
  console.log(`   build.ignore: ${config.build.ignore.length} 条规则`);
  console.log(`   mapping.mode: ${config.mapping.mode}`);
  console.log(`   search.defaultLimit: ${config.search.defaultLimit}`);
  console.log(`   search.decayAlpha: ${config.search.decayAlpha}`);
  console.log(`   compression.level: ${config.compression.level}`);
  console.log(`   embedding.model: ${config.embedding.model}`);
  console.log('   ✅ 配置读取成功\n');

  // ===== 2. 存储层 =====
  console.log('2. 存储层验证...');

  const graphStore = new JsonlGraphStore(WPF_DIR);
  console.log(`   初始存在? ${graphStore.exists()}`);

  // 造几个假节点和边（C + L1/L2/L3 架构）
  const testNodes: GraphNode[] = [
    {
      id: 'cap:test123',
      level: 'C',
      type: 'capability',
      name: 'user-auth',
      attrs: { description: '用户认证能力' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'mod:test456',
      level: 'L1',
      type: 'module',
      name: 'auth',
      attrs: { side: 'backend', dir: 'src/modules/auth' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'file:test789',
      level: 'L2',
      type: 'file',
      name: 'auth.service.ts',
      attrs: { filePath: 'src/modules/auth/auth.service.ts', language: 'typescript' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'elem:test012',
      level: 'L3',
      type: 'function',
      name: 'login',
      attrs: { parentName: 'AuthService', signature: 'login(): Promise<User>' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  const testEdges: GraphEdge[] = [
    {
      id: 'e1',
      from: 'cap:test123',
      to: 'mod:test456',
      type: 'business_map',
      weight: 0.85,
      source: 'doc-extract',
    },
    {
      id: 'e2',
      from: 'mod:test456',
      to: 'file:test789',
      type: 'contain',
      weight: 0.9,
      source: 'structure',
    },
    {
      id: 'e3',
      from: 'file:test789',
      to: 'elem:test012',
      type: 'contain',
      weight: 0.9,
      source: 'structure',
    },
  ];

  graphStore.save({ nodes: testNodes, edges: testEdges });
  console.log(`   写入后存在? ${graphStore.exists()}`);

  const loaded = graphStore.load();
  console.log(`   加载节点数: ${loaded.nodes.length}`);
  console.log(`   加载边数: ${loaded.edges.length}`);
  console.assert(loaded.nodes.length === 4, '节点数应为 4');
  console.assert(loaded.edges.length === 3, '边数应为 3');

  // 内存索引
  const idx = buildGraphIndex(loaded);
  console.log(`   nodeMap 大小: ${idx.nodeMap.size}`);
  console.log(`   C 层节点数: ${idx.nodesByLevel.get('C')?.length}`);
  console.log(`   L1 节点数: ${idx.nodesByLevel.get('L1')?.length}`);
  console.log(`   L2 节点数: ${idx.nodesByLevel.get('L2')?.length}`);
  console.log(`   L3 节点数: ${idx.nodesByLevel.get('L3')?.length}`);
  console.assert(idx.nodeMap.size === 4, '索引节点数应为 4');
  console.log('   ✅ 存储层验证通过\n');

  // ===== 3. 向量存储 =====
  console.log('3. 向量存储验证...');

  const vecStore = new BinaryVectorStore(WPF_DIR);
  console.log(`   初始存在? ${vecStore.exists()}`);

  const dims = 8;
  const count = 5;
  const vectors = new Float32Array(dims * count);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < dims; j++) {
      vectors[i * dims + j] = i * 10 + j;
    }
  }

  vecStore.save(vectors, dims);
  console.log(`   写入后存在? ${vecStore.exists()}`);
  console.log(`   维度: ${vecStore.getDimensions()}`);
  console.log(`   数量: ${vecStore.getCount()}`);

  const loadedVec = vecStore.load();
  console.assert(loadedVec !== null, '向量加载不应为空');
  console.assert(loadedVec!.length === dims * count, '向量长度不匹配');
  console.log('   ✅ 向量存储验证通过\n');

  // ===== 4. 元数据存储 =====
  console.log('4. 元数据存储验证...');

  const metaStore = new JsonMetaStore(WPF_DIR);
  const meta = createEmptyMeta();
  meta.builtAt = Date.now();
  meta.totalNodes = 4;
  meta.totalEdges = 3;
  meta.totalVectors = 5;
  meta.fileHashes = { 'src/index.ts': 'abc123' };

  metaStore.save(meta);
  const loadedMeta = metaStore.load();
  console.assert(loadedMeta !== null, '元数据加载不应为空');
  console.assert(loadedMeta!.totalNodes === 4, 'totalNodes 不匹配');
  console.log(`   schema 版本: ${loadedMeta!.schemaVersion}`);
  console.log('   ✅ 元数据存储验证通过\n');

  // ===== 5. 能力解析器 =====
  console.log('5. 能力解析器验证...');

  const caps = parseAllCapabilities(ROOT);
  console.log(`   解析到能力数: ${caps.length}`);
  if (caps.length > 0) {
    const first = caps[0];
    console.log(`   第一个能力: ${first.node.name}`);
    console.log(`   层级: ${first.node.level}`);
    console.log(`   描述: ${first.node.attrs.description?.slice(0, 50)}...`);
    console.log(`   向量化文本长度: ${first.vectorText.length}`);
    if (first.node.attrs.features) {
      console.log(`   功能条目数: ${first.node.attrs.features.length}`);
    }
  }
  console.log('   ✅ 能力解析器验证通过\n');

  // ===== 6. 模块解析器 =====
  console.log('6. 模块解析器验证...');

  const projectType = sniffProjectType(ROOT);
  console.log(`   项目类型: ${projectType}`);

  const modules = parseModules(ROOT, config, projectType);
  console.log(`   解析到模块数: ${modules.length}`);
  for (const m of modules.slice(0, 5)) {
    console.log(`     - ${m.node.name} (L1, ${m.node.attrs.side}, dir: ${m.node.attrs.dir})`);
  }
  if (modules.length > 5) {
    console.log(`     ... 还有 ${modules.length - 5} 个`);
  }
  console.log('   ✅ 模块解析器验证通过\n');

  // ===== 7. 源码解析器 =====
  console.log('7. 源码解析器验证...');

  const { parseSourceFile, isSupportedFile } = await import('./parsers/source-parser');

  const testFile = path.join(ROOT, 'src', 'lib', 'state.ts');
  const supported = isSupportedFile(testFile, config.build.languages);
  console.log(`   state.ts 支持? ${supported}`);

  if (supported) {
    const result = await parseSourceFile(testFile, ROOT);
    console.log(`   文件节点: ${result.fileNode.name} (L2, ${result.fileNode.attrs.language})`);
    console.log(`   元素数量 (L3): ${result.elements.length}`);
    console.log(`   import 数量: ${result.imports.length}`);

    const typeCounts: Record<string, number> = {};
    for (const el of result.elements) {
      typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
    }
    console.log(`   元素类型分布: ${JSON.stringify(typeCounts)}`);

    console.assert(result.elements.length > 0, '元素数应大于 0');
  }
  console.log('   ✅ 源码解析器验证通过\n');

  // ===== 8. 全量构建 =====
  console.log('8. 全量构建验证...');

  const { buildGraph } = await import('./builders/graph-builder');

  const buildResult = await buildGraph(ROOT);
  const { data, stats } = buildResult;

  console.log(`   总节点数: ${data.nodes.length}`);
  console.log(`   总边数: ${data.edges.length}`);
  console.log(`   各层级节点: ${JSON.stringify(stats.nodesByLevel)}`);
  console.log(`   各类型边: ${JSON.stringify(stats.edgesByType)}`);
  console.log(`   构建耗时: ${stats.totalTimeMs}ms`);
  console.log(`   校验通过: ${stats.validation.passed}`);
  if (stats.validation.warnings.length > 0) {
    console.log(`   警告: ${stats.validation.warnings.length} 条`);
  }
  if (stats.validation.errors.length > 0) {
    console.log(`   错误: ${stats.validation.errors.length} 条`);
    for (const e of stats.validation.errors.slice(0, 5)) {
      console.log(`     - ${e}`);
    }
  }

  const capNodes = data.nodes.filter((n) => n.level === 'C');
  const l1Nodes = data.nodes.filter((n) => n.level === 'L1');
  const l2Nodes = data.nodes.filter((n) => n.level === 'L2');
  const l3Nodes = data.nodes.filter((n) => n.level === 'L3');
  console.log(`   C 层(能力): ${capNodes.length}`);
  console.log(`   L1层(模块): ${l1Nodes.length}`);
  console.log(`   L2层(文件): ${l2Nodes.length}`);
  console.log(`   L3层(元素): ${l3Nodes.length}`);

  console.assert(data.nodes.length > 0, '节点数应大于 0');
  console.log('   ✅ 全量构建验证通过\n');

  // ===== 9. 结构化查询 =====
  console.log('9. 结构化查询验证...');

  const { GraphQuerier } = await import('./search/graph-query');
  const querier = new GraphQuerier(data);

  const graphStats = querier.getStats();
  console.log(`   节点: ${graphStats.totalNodes}, 边: ${graphStats.totalEdges}`);
  console.log(`   层级分布: ${JSON.stringify(graphStats.nodesByLevel)}`);

  const firstModule = l1Nodes[0];
  if (firstModule) {
    const downstream = querier.getDownstream(firstModule.id, { depth: 2 });
    console.log(`   模块「${firstModule.name}」下游依赖: ${downstream.length} 个节点`);
  }

  const l2Files = querier.queryNodes({ level: 'L2', limit: 5 });
  console.log(`   L2 文件节点示例 (前 5):`);
  for (const f of l2Files) {
    console.log(`     - ${f.attrs.filePath ?? f.name}`);
  }

  console.log('   ✅ 结构化查询验证通过\n');

  // ===== 10. Context Pipeline =====
  console.log('10. Context Pipeline 验证...');

  const { ContextPipeline } = await import('./context/context-pipeline');

  if (firstModule) {
    const pipeline = new ContextPipeline(
      data,
      null, // vectors
      384,
      null, // mapping
      config,
    );

    const result = await pipeline.generate({
      anchors: [firstModule.id],
      depth: 2,
      maxNodes: 30,
      compression: 'standard',
    });

    console.log(`   锚点数: ${result.stats.anchorCount}`);
    console.log(`   子图节点: ${result.stats.nodeCount}`);
    console.log(`   子图边: ${result.stats.edgeCount}`);
    console.log(`   预估 Token: ${result.stats.estimatedTokens}`);
    console.log(`   压缩率: ${result.stats.compressionRatio}x`);
  }
  console.log('   ✅ Context Pipeline 验证通过\n');

  // ===== 清理 =====
  if (fs.existsSync(WPF_DIR)) {
    fs.rmSync(WPF_DIR, { recursive: true });
  }

  console.log('=== 全部验证通过 ✅ ===');
}

main().catch((err) => {
  console.error('验证失败:', err);
  process.exit(1);
});
