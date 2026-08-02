/**
 * graph 子命令组
 *
 * 提供知识图谱的构建、查询、检索、上下文生成等功能。
 *
 * 子命令：
 *   wpw graph build     — 全量构建图谱
 *   wpw graph update    — 增量更新图谱
 *   wpw graph rebuild   — 强制重建图谱
 *   wpw graph stat      — 查看图谱统计
 *   wpw graph query     — 结构化查询
 *   wpw graph search    — 语义检索
 *   wpw graph context   — 端到端上下文生成
 */
import * as path from 'path';
import { Command } from 'commander';
import { loadGraphConfig } from '../config';
import { JsonlGraphStore } from '../storage/graph-store';
import { BinaryVectorStore } from '../storage/vector-store';
import { VectorMappingStore } from '../storage/mapping-store';
import { JsonMetaStore } from '../storage/meta-store';
import { GraphQuerier } from '../search/graph-query';
import { SemanticSearcher } from '../search/semantic-search';
import { ContextPipeline } from '../context/context-pipeline';
import type { BuildStats, NodeLevel } from '../types';
import { LEGACY_LEVEL_MAP } from '../types';
import type { BuildProgress } from '../builders/graph-builder';

function getWpfDir(root: string): string {
  return path.join(root, 'wpw', 'knowledge', 'graph');
}

/**
 * 将层级参数转换为新层级（向后兼容）
 *   旧 L1 → C, 旧 L2 → L1, 旧 L3 → L2, 旧 L4 → L3
 */
function normalizeLevels(levels: string[]): string[] {
  const validLevels: NodeLevel[] = ['C', 'L1', 'L2', 'L3'];
  const validSet = new Set(validLevels);
  const legacySet = new Set(['L1', 'L2', 'L3', 'L4']);

  let hasLegacy = false;
  const result: string[] = [];

  for (const lvl of levels) {
    if (validSet.has(lvl as NodeLevel)) {
      result.push(lvl);
    } else if (legacySet.has(lvl)) {
      const mapped = LEGACY_LEVEL_MAP[lvl];
      if (mapped) {
        result.push(mapped);
        hasLegacy = true;
      }
    } else {
      result.push(lvl); // 原样保留，交给下游过滤
    }
  }

  if (hasLegacy) {
    console.warn(`[警告] 检测到旧层级值（L1/L2/L3/L4），已自动映射为新层级（C/L1/L2/L3）。建议更新命令参数。`);
  }

  return result;
}

/**
 * 注册 graph 子命令组
 */
export function registerGraph(program: Command): void {
  const graph = program.command('graph').description('知识图谱管理与查询');

  registerBuild(graph);
  registerUpdate(graph);
  registerRebuild(graph);
  registerStat(graph);
  registerQuery(graph);
  registerSearch(graph);
  registerContext(graph);
}

// ==================== build ====================

function registerBuild(graph: Command): void {
  graph
    .command('build')
    .description('全量构建知识图谱')
    .option('--json', 'JSON 输出')
    .option('--no-progress', '禁用进度条')
    .action(async (opts: { json?: boolean; progress: boolean }) => {
      const root = process.cwd();
      const { buildGraph } = await import('../builders/graph-builder');

      const useProgress = opts.progress && !opts.json && process.stderr.isTTY;
      const bar = useProgress ? createProgressBar() : null;

      const result = await buildGraph(root, (p) => {
        bar?.update(p);
      });

      bar?.finish();

      if (opts.json) {
        console.log(JSON.stringify(formatBuildOutput(result.stats), null, 2));
      } else {
        printBuildStats(result.stats);
      }
    });
}

// ==================== 进度条 ====================

interface ProgressBar {
  update(progress: BuildProgress): void;
  finish(): void;
}

function createProgressBar(): ProgressBar {
  const width = 30;
  let lastPhase = '';

  function render(p: BuildProgress) {
    const pct = Math.round(p.overall * 100);
    const filled = Math.round(p.overall * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
    const detail = p.detail ? `  ${p.detail}` : '';

    // 当阶段变化时，换行显示新阶段
    if (lastPhase && lastPhase !== p.phase) {
      process.stderr.write('\n');
    }
    lastPhase = p.phase;

    const line = `\r${bar} ${pct.toString().padStart(3)}%  ${p.phaseLabel}${detail}`;
    process.stderr.write(line.padEnd(100).slice(0, 100));
  }

  return {
    update(p) {
      render(p);
    },
    finish() {
      process.stderr.write('\n\n');
    },
  };
}

// ==================== update ====================

function registerUpdate(graph: Command): void {
  graph
    .command('update')
    .description('增量更新知识图谱')
    .option('--json', 'JSON 输出')
    .action(async (opts: { json?: boolean }) => {
      const root = process.cwd();
      const { updateGraph } = await import('../builders/graph-builder');

      const result = await updateGraph(root);

      if (!result) {
        if (opts.json) {
          console.log(JSON.stringify({ updated: false, reason: 'no changes detected' }));
        } else {
          console.log('图谱已是最新，无需更新。');
        }
        return;
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            { updated: true, ...formatBuildOutput(result.stats) },
            null,
            2,
          ),
        );
      } else {
        console.log('增量更新完成。');
        printBuildStats(result.stats);
      }
    });
}

// ==================== rebuild ====================

function registerRebuild(graph: Command): void {
  graph
    .command('rebuild')
    .description('强制重建知识图谱（清空后全量构建）')
    .option('--json', 'JSON 输出')
    .option('--no-progress', '禁用进度条')
    .action(async (opts: { json?: boolean; progress: boolean }) => {
      const root = process.cwd();
      const { rebuildGraph } = await import('../builders/graph-builder');

      const useProgress = opts.progress && !opts.json && process.stderr.isTTY;
      const bar = useProgress ? createProgressBar() : null;

      const result = await rebuildGraph(root, (p) => {
        bar?.update(p);
      });

      bar?.finish();

      if (opts.json) {
        console.log(JSON.stringify(formatBuildOutput(result.stats), null, 2));
      } else {
        console.log('强制重建完成。');
        printBuildStats(result.stats);
      }
    });
}

// ==================== stat ====================

function registerStat(graph: Command): void {
  graph
    .command('stat')
    .description('查看图谱统计信息')
    .option('--json', 'JSON 输出')
    .action((opts: { json?: boolean }) => {
      const root = process.cwd();
      const wpfDir = getWpfDir(root);

      const graphStore = new JsonlGraphStore(wpfDir);
      const metaStore = new JsonMetaStore(wpfDir);

      if (!graphStore.exists()) {
        console.error('图谱不存在，请先执行 wpw graph build');
        process.exit(1);
      }

      const data = graphStore.load();
      const meta = metaStore.load();
      const querier = new GraphQuerier(data);

      const stats = querier.getStats(meta?.totalVectors ?? 0, meta?.builtAt);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              ...stats,
              schemaVersion: meta?.schemaVersion,
              configVersion: meta?.configVersion,
            },
            null,
            2,
          ),
        );
      } else {
        console.log('=== 图谱统计 ===');
        console.log(`节点总数: ${stats.totalNodes}`);
        console.log(`边总数: ${stats.totalEdges}`);
        console.log(`向量数: ${stats.totalVectors}`);
        console.log('');
        console.log('节点层级分布:');
        for (const [level, count] of Object.entries(stats.nodesByLevel)) {
          console.log(`  ${level}: ${count}`);
        }
        console.log('');
        console.log('边类型分布:');
        for (const [type, count] of Object.entries(stats.edgesByType)) {
          console.log(`  ${type}: ${count}`);
        }
        if (meta) {
          console.log('');
          console.log(`构建时间: ${new Date(meta.builtAt).toLocaleString()}`);
          console.log(`Schema 版本: ${meta.schemaVersion}`);
        }
      }
    });
}

// ==================== query ====================

function registerQuery(graph: Command): void {
  graph
    .command('query')
    .description('结构化查询节点与依赖')
    .option('-l, --level <levels>', '按层级过滤，逗号分隔（C,L1,L2,L3）')
    .option('-t, --type <types>', '按节点类型过滤，逗号分隔')
    .option('--limit <n>', '返回数量上限', '20')
    .option('--offset <n>', '偏移量', '0')
    .option('--downstream <nodeId>', '查询某节点的下游依赖')
    .option('--upstream <nodeId>', '查询某节点的上游依赖')
    .option('--path <from,to>', '查询两节点间最短路径（逗号分隔两个 ID）')
    .option('--depth <n>', '依赖查询最大深度', '3')
    .option('--min-weight <f>', '最小边权重', '0')
    .option('--json', 'JSON 输出')
    .action((opts) => {
      const root = process.cwd();
      const wpfDir = getWpfDir(root);

      const graphStore = new JsonlGraphStore(wpfDir);
      if (!graphStore.exists()) {
        console.error('图谱不存在，请先执行 wpw graph build');
        process.exit(1);
      }

      const data = graphStore.load();
      const querier = new GraphQuerier(data);

      // 最短路径查询
      if (opts.path) {
        const [fromId, toId] = String(opts.path).split(',').map((s) => s.trim());
        const path = querier.getShortestPath(fromId, toId, {
          depth: Number(opts.depth),
          minWeight: Number(opts.minWeight),
        });
        if (opts.json) {
          console.log(JSON.stringify(path, null, 2));
        } else if (!path) {
          console.log(`未找到从 ${fromId} 到 ${toId} 的路径`);
        } else {
          console.log(`路径 (${path.length} 步):`);
          for (let i = 0; i < path.nodes.length; i++) {
            const node = path.nodes[i];
            const edge = path.edges[i];
            console.log(`  ${i + 1}. [${node.level}] ${node.name} (${node.type})`);
            if (edge) {
              console.log(`     ↓ ${edge.type} (权重: ${edge.weight})`);
            }
          }
        }
        return;
      }

      // 下游依赖查询
      if (opts.downstream) {
        const result = querier.getDownstream(String(opts.downstream), {
          depth: Number(opts.depth),
          minWeight: Number(opts.minWeight),
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`下游依赖 (${result.length} 个节点):`);
          for (const r of result) {
            console.log(
              `  [L${r.depth}] ${r.node.name} (${r.node.type}, 权重: ${r.avgWeight.toFixed(2)})`,
            );
          }
        }
        return;
      }

      // 上游依赖查询
      if (opts.upstream) {
        const result = querier.getUpstream(String(opts.upstream), {
          depth: Number(opts.depth),
          minWeight: Number(opts.minWeight),
        });
        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`上游依赖 (${result.length} 个节点):`);
          for (const r of result) {
            console.log(
              `  [L${r.depth}] ${r.node.name} (${r.node.type}, 权重: ${r.avgWeight.toFixed(2)})`,
            );
          }
        }
        return;
      }

      // 普通节点查询
      const levelOpt = opts.level
        ? normalizeLevels(String(opts.level).split(',').map((s) => s.trim())) as any
        : undefined;
      const typeOpt = opts.type
        ? String(opts.type).split(',').map((s) => s.trim()) as any
        : undefined;

      const nodes = querier.queryNodes({
        level: levelOpt,
        type: typeOpt,
        limit: Number(opts.limit),
        offset: Number(opts.offset),
      });

      if (opts.json) {
        console.log(JSON.stringify(nodes, null, 2));
      } else {
        console.log(`查询结果 (${nodes.length} 个节点):`);
        for (const node of nodes) {
          const extra = node.attrs.filePath || node.attrs.side || '';
          console.log(
            `  [${node.level}] ${node.name} (${node.type})${extra ? ` — ${extra}` : ''}`,
          );
        }
      }
    });
}

// ==================== search ====================

function registerSearch(graph: Command): void {
  graph
    .command('search <query>')
    .description('语义检索图谱节点')
    .option('-l, --limit <n>', '返回数量上限', '10')
    .option('-t, --threshold <f>', '相似度阈值', '0.5')
    .option('--level <levels>', '按层级过滤')
    .option('--type <types>', '按节点类型过滤')
    .option('--include-archived', '包含归档需求')
    .option('--json', 'JSON 输出')
    .action(async (query: string, opts) => {
      const root = process.cwd();
      const wpfDir = getWpfDir(root);

      const graphStore = new JsonlGraphStore(wpfDir);
      const vectorStore = new BinaryVectorStore(wpfDir);
      const mappingStore = new VectorMappingStore(wpfDir);

      if (!graphStore.exists()) {
        console.error('图谱不存在，请先执行 wpw graph build');
        process.exit(1);
      }

      if (!vectorStore.exists()) {
        console.error('向量索引不存在，请先执行 wpw graph build');
        process.exit(1);
      }

      const config = loadGraphConfig(root);
      const data = graphStore.load();
      const vectors = vectorStore.load();
      const dimensions = vectorStore.getDimensions() ?? config.embedding.dimensions;
      const mapping = mappingStore.load();

      if (!vectors || !mapping) {
        console.error('向量索引或映射加载失败');
        process.exit(1);
      }

      // 设置查询向量的模型和镜像，确保和构建时一致
      const { setEmbeddingModel, setEmbeddingMirror } = await import('../builders/vector-builder');
      setEmbeddingModel(config.embedding.model);
      if (config.embedding.mirror) {
        setEmbeddingMirror(config.embedding.mirror);
      }

      const querier = new GraphQuerier(data);
      const searcher = new SemanticSearcher(querier, vectors, dimensions, mapping);

      const levelOpt = opts.level
        ? normalizeLevels(String(opts.level).split(',').map((s) => s.trim()))
        : undefined;
      const typeOpt = opts.type
        ? String(opts.type).split(',').map((s) => s.trim())
        : undefined;

      const results = await searcher.search(query, {
        limit: Number(opts.limit),
        threshold: Number(opts.threshold),
        level: levelOpt,
        type: typeOpt,
      });

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
      } else {
        console.log(`语义检索「${query}」(${results.length} 条结果):`);
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const displayName = r.node.attrs.parentName
            ? `${r.node.attrs.parentName}/${r.node.name}`
            : r.node.name;
          const fileInfo = r.node.attrs.filePath
            ? ` [${r.node.attrs.filePath}]`
            : '';
          console.log(
            `  ${i + 1}. [${r.node.level}] ${displayName} (${r.node.type})${fileInfo} — 相似度: ${(r.score * 100).toFixed(1)}%`,
          );
        }
      }
    });
}

// ==================== context ====================

function registerContext(graph: Command): void {
  graph
    .command('context [query]')
    .description('端到端上下文生成（语义检索 → 子图裁剪 → 压缩序列化）')
    .option('--anchors <ids>', '直接指定锚点节点 ID（逗号分隔），跳过语义检索')
    .option('--multi', '多查询模式（query 用逗号分隔）')
    .option('--token-budget <n>', 'Token 预算上限')
    .option('--depth <n>', '子图扩展深度')
    .option('--min-weight <f>', '最小边权重')
    .option('--max-nodes <n>', '节点数量上限')
    .option('--compression <level>', '压缩等级: loose/standard/extreme')
    .option('--level <levels>', '按层级过滤')
    .option('--type <types>', '按节点类型过滤')
    .option('--include-archived', '包含归档需求')
    .option('--anchor-limit <n>', '每个查询召回的锚点数量', '5')
    .option('--threshold <f>', '语义检索相似度阈值', '0.6')
    .option('--json', 'JSON 输出完整结果')
    .action(async (query: string | undefined, opts) => {
      const root = process.cwd();
      const wpfDir = getWpfDir(root);
      const config = loadGraphConfig(root);

      const graphStore = new JsonlGraphStore(wpfDir);
      const vectorStore = new BinaryVectorStore(wpfDir);
      const mappingStore = new VectorMappingStore(wpfDir);

      if (!graphStore.exists()) {
        console.error('图谱不存在，请先执行 wpw graph build');
        process.exit(1);
      }

      const data = graphStore.load();

      // 向量索引可选
      let vectors: Float32Array | null = null;
      let dimensions = 384;
      let mapping: any = null;

      if (vectorStore.exists()) {
        vectors = vectorStore.load();
        dimensions = vectorStore.getDimensions() ?? 384;
        mapping = mappingStore.load();
      }

      const pipeline = new ContextPipeline(data, vectors, dimensions, mapping, config);

      const anchors = opts.anchors
        ? String(opts.anchors).split(',').map((s: string) => s.trim())
        : undefined;

      const compression = opts.compression as any;
      const levelOpt = opts.level
        ? normalizeLevels(String(opts.level).split(',').map((s: string) => s.trim()))
        : undefined;
      const typeOpt = opts.type
        ? String(opts.type).split(',').map((s: string) => s.trim())
        : undefined;

      const result = await pipeline.generate({
        query,
        anchors,
        multi: !!opts.multi,
        tokenBudget: opts.tokenBudget ? Number(opts.tokenBudget) : undefined,
        depth: opts.depth ? Number(opts.depth) : undefined,
        minWeight: opts.minWeight ? Number(opts.minWeight) : undefined,
        maxNodes: opts.maxNodes ? Number(opts.maxNodes) : undefined,
        compression,
        level: levelOpt,
        type: typeOpt,
        includeArchived: !!opts.includeArchived,
        anchorLimit: Number(opts.anchorLimit),
        threshold: opts.threshold ? Number(opts.threshold) : undefined,
      });

      if (opts.json) {
        // JSON 模式：输出完整结果（含子图数据）
        const output = {
          anchors: result.anchors,
          subgraph: {
            nodes: result.subgraph.nodes,
            edges: result.subgraph.edges,
            anchorIds: result.subgraph.anchors,
          },
          compressedText: result.compressedText,
          stats: result.stats,
        };
        console.log(JSON.stringify(output, null, 2));
      } else {
        // 文本模式：输出压缩文本 + 底部统计
        console.log(result.compressedText);
        console.log('');
        console.log('--- 统计 ---');
        console.log(`锚点数: ${result.stats.anchorCount}`);
        console.log(`子图节点: ${result.stats.nodeCount}`);
        console.log(`子图边: ${result.stats.edgeCount}`);
        console.log(`预估 Token: ${result.stats.estimatedTokens}`);
        console.log(`压缩率: ${result.stats.compressionRatio}x`);
        console.log(`总耗时: ${result.stats.totalTimeMs}ms`);
      }
    });
}

// ==================== 辅助函数 ====================

function formatBuildStats(stats: BuildStats): any {
  return {
    nodesByLevel: stats.nodesByLevel,
    edgesByType: stats.edgesByType,
    vectorCount: stats.vectorCount,
    totalTimeMs: stats.totalTimeMs,
    phaseTimes: stats.phaseTimes,
    validation: stats.validation,
  };
}

function formatBuildOutput(stats: BuildStats): any {
  return {
    success: stats.validation.passed,
    ...formatBuildStats(stats),
  };
}

function printBuildStats(stats: BuildStats): void {
  console.log('=== 构建完成 ===');
  console.log(`总耗时: ${stats.totalTimeMs}ms`);
  console.log('');
  console.log('节点层级分布:');
  for (const [level, count] of Object.entries(stats.nodesByLevel)) {
    console.log(`  ${level}: ${count}`);
  }
  console.log('');
  console.log('边类型分布:');
  for (const [type, count] of Object.entries(stats.edgesByType)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('');
  console.log(`向量数: ${stats.vectorCount}`);
  console.log('');
  console.log('各阶段耗时:');
  for (const [phase, time] of Object.entries(stats.phaseTimes)) {
    console.log(`  ${phase}: ${time}ms`);
  }
  if (stats.validation.warnings.length > 0) {
    console.log('');
    console.log(`警告 (${stats.validation.warnings.length} 条):`);
    for (const w of stats.validation.warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }
  if (!stats.validation.passed) {
    console.log('');
    console.log(`错误 (${stats.validation.errors.length} 条):`);
    for (const e of stats.validation.errors) {
      console.log(`  ✗ ${e}`);
    }
  }
}
