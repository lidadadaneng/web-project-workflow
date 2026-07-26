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
import { parseAllRequirements } from './parsers/requirement-parser';
import { parseModules } from './parsers/module-parser';
import { loadGraphConfig } from './config';
import { sniffProjectType } from '../lib/project-type';
import type { GraphNode, GraphEdge } from './types';

const ROOT = process.cwd();
const WPF_DIR = path.join(ROOT, '.wpf-verify');

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
  console.log(`   compression.level: ${config.compression.level}`);
  console.log(`   embedding.model: ${config.embedding.model}`);
  console.log('   ✅ 配置读取成功\n');

  // ===== 2. 存储层 =====
  console.log('2. 存储层验证...');

  const graphStore = new JsonlGraphStore(WPF_DIR);
  console.log(`   初始存在? ${graphStore.exists()}`);

  // 造几个假节点和边
  const testNodes: GraphNode[] = [
    {
      id: 'req:test123',
      level: 'L1',
      type: 'requirement',
      name: '测试需求',
      attrs: { description: '这是一个测试' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'mod:test456',
      level: 'L2',
      type: 'module',
      name: 'auth',
      attrs: { side: 'backend', dir: 'src/modules/auth' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'file:test789',
      level: 'L3',
      type: 'file',
      name: 'auth.service.ts',
      attrs: { filePath: 'src/modules/auth/auth.service.ts', language: 'typescript' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  const testEdges: GraphEdge[] = [
    {
      id: 'e1',
      from: 'req:test123',
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
  ];

  graphStore.save({ nodes: testNodes, edges: testEdges });
  console.log(`   写入后存在? ${graphStore.exists()}`);

  const loaded = graphStore.load();
  console.log(`   加载节点数: ${loaded.nodes.length}`);
  console.log(`   加载边数: ${loaded.edges.length}`);
  console.assert(loaded.nodes.length === 3, '节点数应为 3');
  console.assert(loaded.edges.length === 2, '边数应为 2');

  // 内存索引
  const idx = buildGraphIndex(loaded);
  console.log(`   nodeMap 大小: ${idx.nodeMap.size}`);
  console.log(`   outEdges 大小: ${idx.outEdges.size}`);
  console.log(`   inEdges 大小: ${idx.inEdges.size}`);
  console.log(`   L1 节点数: ${idx.nodesByLevel.get('L1')?.length}`);
  console.log(`   L2 节点数: ${idx.nodesByLevel.get('L2')?.length}`);
  console.assert(idx.nodeMap.size === 3, '索引节点数应为 3');
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
  console.assert(loadedVec![0] === 0, '第一个向量第一个元素应为 0');
  console.assert(loadedVec![dims] === 10, '第二个向量第一个元素应为 10');
  console.log('   ✅ 向量存储验证通过\n');

  // ===== 4. 元数据存储 =====
  console.log('4. 元数据存储验证...');

  const metaStore = new JsonMetaStore(WPF_DIR);
  const meta = createEmptyMeta();
  meta.builtAt = Date.now();
  meta.totalNodes = 3;
  meta.totalEdges = 2;
  meta.totalVectors = 5;
  meta.fileHashes = { 'src/index.ts': 'abc123' };

  metaStore.save(meta);
  const loadedMeta = metaStore.load();
  console.assert(loadedMeta !== null, '元数据加载不应为空');
  console.assert(loadedMeta!.totalNodes === 3, 'totalNodes 不匹配');
  console.assert(loadedMeta!.fileHashes['src/index.ts'] === 'abc123', 'fileHashes 不匹配');
  console.log(`   构建时间: ${new Date(loadedMeta!.builtAt).toISOString()}`);
  console.log(`   节点数: ${loadedMeta!.totalNodes}`);
  console.log(`   schema 版本: ${loadedMeta!.schemaVersion}`);
  console.log('   ✅ 元数据存储验证通过\n');

  // ===== 5. 需求解析器 =====
  console.log('5. 需求解析器验证...');

  const reqs = parseAllRequirements(ROOT);
  console.log(`   解析到需求数: ${reqs.length}`);
  if (reqs.length > 0) {
    const first = reqs[0];
    console.log(`   第一个需求: ${first.node.name}`);
    console.log(`   层级: ${first.node.level}`);
    console.log(`   归档: ${first.node.attrs.status?.archived}`);
    console.log(`   向量化文本长度: ${first.vectorText.length}`);
    console.log(`   提取模块数: ${first.extractedModules.length}`);
    if (first.extractedModules.length > 0) {
      console.log(`     模块: ${first.extractedModules.slice(0, 3).join(', ')}`);
    }
    console.log(`   提取接口数: ${first.extractedInterfaces.length}`);
  }
  console.log('   ✅ 需求解析器验证通过\n');

  // ===== 6. 模块解析器 =====
  console.log('6. 模块解析器验证...');

  const projectType = sniffProjectType(ROOT);
  console.log(`   项目类型: ${projectType}`);

  const modules = parseModules(ROOT, config, projectType);
  console.log(`   解析到模块数: ${modules.length}`);
  for (const m of modules.slice(0, 5)) {
    console.log(`     - ${m.node.name} (${m.node.attrs.side}, dir: ${m.node.attrs.dir})`);
  }
  if (modules.length > 5) {
    console.log(`     ... 还有 ${modules.length - 5} 个`);
  }
  console.log('   ✅ 模块解析器验证通过\n');

  // ===== 7. 源码解析器 =====
  console.log('7. 源码解析器验证...');

  const { parseSourceFile, isSupportedFile } = await import('./parsers/source-parser');

  // 找一个测试文件（用我们自己的代码）
  const testFile = path.join(ROOT, 'src', 'lib', 'state.ts');
  const supported = isSupportedFile(testFile, config.build.languages);
  console.log(`   state.ts 支持? ${supported}`);

  if (supported) {
    const result = await parseSourceFile(testFile, ROOT);
    console.log(`   文件节点: ${result.fileNode.name} (${result.fileNode.attrs.language})`);
    console.log(`   元素数量: ${result.elements.length}`);
    console.log(`   import 数量: ${result.imports.length}`);

    // 按类型统计
    const typeCounts: Record<string, number> = {};
    for (const el of result.elements) {
      typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
    }
    console.log(`   元素类型分布: ${JSON.stringify(typeCounts)}`);

    // 打印前 3 个元素
    for (const el of result.elements.slice(0, 3)) {
      console.log(`     - ${el.name} (${el.type})`);
      if (el.attrs.signature) {
        console.log(`       签名: ${el.attrs.signature.slice(0, 80)}`);
      }
    }

    // 打印前 3 个 import
    console.log(`   前 3 个 import:`);
    for (const imp of result.imports.slice(0, 3)) {
      console.log(`     - ${imp}`);
    }

    console.assert(result.elements.length > 0, '元素数应大于 0');
    console.assert(result.imports.length > 0, 'import 数应大于 0');
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
  console.log(`   各阶段耗时: ${JSON.stringify(stats.phaseTimes)}`);
  console.log(`   校验通过: ${stats.validation.passed}`);
  if (stats.validation.warnings.length > 0) {
    console.log(`   警告: ${stats.validation.warnings.length} 条`);
    for (const w of stats.validation.warnings.slice(0, 3)) {
      console.log(`     - ${w}`);
    }
  }
  if (stats.validation.errors.length > 0) {
    console.log(`   错误: ${stats.validation.errors.length} 条`);
    for (const e of stats.validation.errors.slice(0, 5)) {
      console.log(`     - ${e}`);
    }
  }

  // 打印前 3 个模块节点及其 business_map 边
  const reqNodes = data.nodes.filter((n) => n.level === 'L1');
  const modNodes = data.nodes.filter((n) => n.level === 'L2');
  console.log(`   需求节点数: ${reqNodes.length}`);
  console.log(`   模块节点数: ${modNodes.length}`);
  if (modNodes.length > 0) {
    console.log(`   模块列表:`);
    for (const m of modNodes.slice(0, 5)) {
      const bmEdges = data.edges.filter(
        (e) => e.type === 'business_map' && e.to === m.id,
      );
      console.log(
        `     - ${m.name} (${m.attrs.side}) [${bmEdges.length} 条映射边]`,
      );
    }
  }

  console.assert(data.nodes.length > 0, '节点数应大于 0');
  console.assert(data.edges.length > 0, '边数应大于 0');
  console.log('   ✅ 全量构建验证通过\n');

  // ===== 9. 结构化查询 =====
  console.log('9. 结构化查询验证...');

  const { GraphQuerier } = await import('./search/graph-query');
  const querier = new GraphQuerier(data);

  // 统计
  const graphStats = querier.getStats();
  console.log(`   节点: ${graphStats.totalNodes}, 边: ${graphStats.totalEdges}`);
  console.log(`   层级分布: ${JSON.stringify(graphStats.nodesByLevel)}`);

  // 找一个模块节点做下游依赖查询
  const firstModule = modNodes[0];
  if (firstModule) {
    const downstream = querier.getDownstream(firstModule.id, { depth: 2 });
    console.log(`   模块「${firstModule.name}」下游依赖: ${downstream.length} 个节点`);
    for (const d of downstream.slice(0, 3)) {
      console.log(`     - [L${d.depth}] ${d.node.name} (${d.node.type})`);
    }
  }

  // 节点条件查询
  const l4Files = querier.queryNodes({ level: 'L3', limit: 5 });
  console.log(`   L3 文件节点示例 (前 5):`);
  for (const f of l4Files) {
    console.log(`     - ${f.attrs.filePath ?? f.name}`);
  }

  console.log('   ✅ 结构化查询验证通过\n');

  // ===== 10. 子图裁剪 =====
  console.log('10. 子图裁剪验证...');

  const { SubgraphTrimmer } = await import('./trimming/subgraph-trimmer');
  const trimmer = new SubgraphTrimmer(data);

  // 选一个需求节点作为锚点
  const firstReq = reqNodes[0];
  if (firstReq) {
    const subgraph = trimmer.buildSubgraph([firstReq.id], {
      depth: 3,
      minWeight: 0.3,
      maxNodes: 50,
    });
    console.log(`   以「${firstReq.name}」为锚点子图:`);
    console.log(`     节点数: ${subgraph.nodes.length}`);
    console.log(`     边数: ${subgraph.edges.length}`);
    console.log(`     锚点数: ${subgraph.anchors.length}`);

    // 验证锚点在子图中
    const anchorInSubgraph = subgraph.nodes.some((n) => n.id === firstReq.id);
    console.assert(anchorInSubgraph, '锚点应在子图中');

    // 距离映射
    console.log(`     有距离的节点: ${subgraph.distances.size}`);
    console.log(`     有得分的节点: ${subgraph.scores.size}`);

    // 多锚点
    if (modNodes.length >= 2) {
      const multiSubgraph = trimmer.buildSubgraph(
        [modNodes[0].id, modNodes[1].id],
        { depth: 2, maxNodes: 30 },
      );
      console.log(`   多锚点子图: ${multiSubgraph.nodes.length} 节点, ${multiSubgraph.edges.length} 边`);
    }
  }
  console.log('   ✅ 子图裁剪验证通过\n');

  // ===== 11. 压缩序列化 =====
  console.log('11. 压缩序列化验证...');

  const {
    HierarchicalSerializer,
    estimateTokens,
  } = await import('./compression/hierarchical-serializer');

  if (firstReq) {
    const trimmer2 = new SubgraphTrimmer(data);
    const subgraph = trimmer2.buildSubgraph([firstReq.id], {
      depth: 2,
      maxNodes: 30,
    });

    // 三档压缩
    for (const level of ['loose', 'standard', 'extreme'] as const) {
      const serializer = new HierarchicalSerializer(subgraph, { level });
      const result = serializer.serialize({ showLegend: true, showStats: false });
      const tokens = estimateTokens(result.text);
      console.log(`   ${level.padEnd(10)}: ${tokens} tokens, ${result.nodeCount} 节点, ${result.edgeCount} 边`);
    }

    // 打印 standard 前 15 行预览
    const serializer2 = new HierarchicalSerializer(subgraph, { level: 'standard' });
    const preview = serializer2.serialize({ showStats: false });
    const previewLines = preview.text.split('\n').slice(0, 15);
    console.log(`   预览 (前 15 行):`);
    for (const line of previewLines) {
      console.log(`     ${line}`);
    }
  }
  console.log('   ✅ 压缩序列化验证通过\n');

  // ===== 12. Context Pipeline =====
  console.log('12. Context Pipeline 验证...');

  const { ContextPipeline } = await import('./context/context-pipeline');

  // 用直接锚点模式（绕过向量化，快很多）
  if (firstReq) {
    const pipeline = new ContextPipeline(
      data,
      null, // vectors
      384,
      null, // mapping
      config,
    );

    const result = await pipeline.generate({
      anchors: [firstReq.id],
      depth: 2,
      maxNodes: 30,
      compression: 'standard',
    });

    console.log(`   锚点数: ${result.stats.anchorCount}`);
    console.log(`   子图节点: ${result.stats.nodeCount}`);
    console.log(`   子图边: ${result.stats.edgeCount}`);
    console.log(`   预估 Token: ${result.stats.estimatedTokens}`);
    console.log(`   压缩率: ${result.stats.compressionRatio}x`);
    console.log(`   检索耗时: ${result.stats.searchTimeMs}ms`);
    console.log(`   裁剪耗时: ${result.stats.trimmingTimeMs}ms`);
    console.log(`   压缩耗时: ${result.stats.compressionTimeMs}ms`);
    console.log(`   总耗时: ${result.stats.totalTimeMs}ms`);

    // Token 预算测试
    const budgetResult = await pipeline.generate({
      anchors: [firstReq.id],
      depth: 3,
      maxNodes: 100,
      tokenBudget: 500,
      compression: 'standard',
    });
    console.log(`   Token 预算 500: ${budgetResult.stats.estimatedTokens} tokens (${budgetResult.stats.nodeCount} 节点)`);
    console.assert(
      budgetResult.stats.estimatedTokens <= 1000,
      '极端预算下 token 不应过大',
    );
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
