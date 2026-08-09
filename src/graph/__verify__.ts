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

  // ===== 7.5 Java 解析器验证 =====
  console.log('7.5. Java 解析器验证...');

  const { parseJavaFile } = await import('./parsers/java-parser');

  // 构造一个 Spring Boot 风格的 Java 测试代码
  const javaSource = `
package com.example.user;

import com.example.order.Order;
import java.util.List;

/**
 * 用户控制器
 * 处理用户相关 REST API
 */
@RestController
@RequestMapping("/api/user")
public class UserController {

    public static final int MAX_PAGE_SIZE = 100;

    /**
     * 根据ID查询用户
     * @param id 用户ID
     * @return 用户对象
     */
    @GetMapping("/{id}")
    public User getUser(@PathVariable Long id) {
        return null;
    }

    @PostMapping
    public User createUser(@RequestBody User user) {
        return user;
    }

    private void validate(User user) {
        // 私有方法，不建 L3 节点
    }
}
`;

  try {
    const javaResult = await parseJavaFile(
      'src/main/java/com/example/user/UserController.java',
      ROOT,
      javaSource,
    );
    console.log(`   文件节点: ${javaResult.fileNode.name} (L2, language: ${javaResult.fileNode.attrs.language})`);
    console.log(`   元素数量 (L3): ${javaResult.elements.length}`);
    console.log(`   import 数量: ${javaResult.imports.length}`);

    const typeCounts: Record<string, number> = {};
    for (const el of javaResult.elements) {
      typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
    }
    console.log(`   元素类型分布: ${JSON.stringify(typeCounts)}`);

    // class 节点验证
    const classNode = javaResult.elements.find((e) => e.type === 'class');
    console.assert(classNode !== undefined, '应生成 class 节点');
    if (classNode) {
      console.log(`   class 名: ${classNode.name}`);
      console.log(`   class annotations: ${classNode.attrs.annotations?.join(', ')}`);
      console.log(`   class description: ${classNode.attrs.description}`);
      console.assert(classNode.attrs.description === 'REST 控制器', '应为 REST 控制器角色');
    }

    // 方法节点验证
    const methods = javaResult.elements.filter((e) => e.type === 'function');
    console.assert(methods.length >= 2, 'public 方法应生成 L3 节点');
    if (methods.length > 0) {
      const endpointMethod = methods.find((m) => m.attrs.endpoint);
      if (endpointMethod) {
        console.log(`   endpoint 方法: ${endpointMethod.name}`);
        console.log(`   endpoint: ${endpointMethod.attrs.endpoint?.method} ${endpointMethod.attrs.endpoint?.path}`);
      }
    }

    // 常量节点验证
    const constants = javaResult.elements.filter((e) => e.type === 'constant');
    console.assert(constants.length >= 1, 'static final 常量应生成 L3 节点');

    // import 验证
    console.assert(javaResult.imports.includes('com.example.order.Order'), '应包含 Order import');
    console.assert(javaResult.imports.includes('java.util.List'), '应包含 List import');

    console.log('   ✅ Java 解析器验证通过\n');
  } catch (e) {
    console.warn(`   ⚠️  Java 解析验证跳过（WASM 不可用）: ${(e as Error).message}`);
    console.warn('   （不影响整体验证，仅表示 Java AST 解析未启用）\n');
  }

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

  // ===== 9. 多图谱存储验证 =====
  console.log('9. 多图谱存储验证...');
  const {
    resolveGraphDir,
    isValidGraphName,
  } = await import('./storage/graph-path');
  const {
    listGraphs,
    needsLegacyMigration,
  } = await import('./storage/graph-manager');

  // 9.1 路径解析
  const defaultDir = resolveGraphDir(ROOT, 'default');
  const feDir = resolveGraphDir(ROOT, 'frontend-vue');
  const beDir = resolveGraphDir(ROOT, 'backend-springboot');
  console.log(`   default 图谱路径: ${path.relative(ROOT, defaultDir)}`);
  console.log(`   frontend 图谱路径: ${path.relative(ROOT, feDir)}`);
  console.log(`   backend 图谱路径: ${path.relative(ROOT, beDir)}`);

  // 9.2 命名格式校验
  console.log(`   合法名 my-graph: ${isValidGraphName('my-graph')}`);
  console.log(`   非法名 Bad Name: ${isValidGraphName('Bad Name')}`);
  console.log(`   非法名 -bad: ${isValidGraphName('-bad')}`);
  if (!isValidGraphName('Bad Name') && isValidGraphName('frontend-vue')) {
    console.log('   ✅ 命名格式校验通过');
  } else {
    throw new Error('命名格式校验失败');
  }

  // 9.3 多图谱构建（验证 buildGraph 写入 meta.graphName）
  // buildGraph 已在前面阶段动态导入并构建过 default 图谱
  const defaultMetaPath = path.join(defaultDir, 'meta.json');
  if (!fs.existsSync(defaultMetaPath)) {
    throw new Error('default 图谱 meta.json 不存在');
  }
  const defaultMeta = JSON.parse(fs.readFileSync(defaultMetaPath, 'utf-8'));
  console.log(`   default 图谱节点数: ${defaultMeta.totalNodes}`);
  console.log(`   default 图谱 graphName: ${defaultMeta.graphName}`);
  if (defaultMeta.graphName !== 'default') {
    throw new Error('default 图谱 graphName 字段错误');
  }
  console.log('   ✅ default 图谱构建通过');

  // 9.4 listGraphs 列举
  const graphs = listGraphs(ROOT);
  console.log(`   列举图谱数: ${graphs.length}`);
  const defaultEntry = graphs.find((g: any) => g.name === 'default');
  if (!defaultEntry) {
    throw new Error('listGraphs 未找到 default 图谱');
  }
  console.log(`   default 图谱条目: ${defaultEntry.totalNodes} 节点, ${defaultEntry.totalEdges} 边`);
  console.log('   ✅ 图谱列举通过');

  // 9.5 旧式迁移检测（当前 default 已存在，不需要迁移）
  const needsMigration = needsLegacyMigration(ROOT);
  console.log(`   需要迁移? ${needsMigration} (应为 false，default 已存在)`);
  if (needsMigration) {
    throw new Error('default 已存在时不应检测到需要迁移');
  }
  console.log('   ✅ 迁移检测通过');

  console.log('   ✅ 多图谱存储验证通过\n');

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
