/**
 * 知识图谱子系统入口
 *
 * 导出公共类型与核心 API，供上层模块调用。
 *
 * 子系统架构：
 *   存储层     storage/     — JSONL 图谱 + 二进制向量 + 元数据
 *   解析器层   parsers/     — 需求/模块/源码解析
 *   构建引擎   builders/    — 节点/边生成、全量/增量构建、向量构建
 *   查询检索   search/      — 结构化查询 + 语义检索
 *   子图裁剪   trimming/    — 双向 BFS、结构重要度、节点/Token 裁剪
 *   压缩序列化 compression/ — 骨架抽取、层级序列化、Token 估算
 *   上下文     context/     — 端到端 Context Pipeline
 *   CLI 命令   commands/    — wpw graph 子命令组
 */

// ==================== 类型 ====================

export * from './types';

// ==================== 配置 ====================

export { loadGraphConfig, getDefaultGraphConfig } from './config';

// ==================== 存储层 ====================

export {
  JsonlGraphStore,
  buildGraphIndex,
  type GraphStore,
} from './storage/graph-store';
export { BinaryVectorStore, type VectorStore } from './storage/vector-store';
export { VectorMappingStore } from './storage/mapping-store';
export { JsonMetaStore, createEmptyMeta } from './storage/meta-store';
export {
  resolveGraphDir,
  getGraphBaseDir,
  isValidGraphName,
  isReservedGraphName,
  graphExists,
  GRAPH_NAME_RULES,
} from './storage/graph-path';
export {
  listGraphs,
  removeGraph,
  needsLegacyMigration,
  migrateLegacyGraph,
  type MigrationResult,
} from './storage/graph-manager';

// ==================== 构建引擎 ====================

export {
  buildGraph,
  updateGraph,
  rebuildGraph,
  validateGraph,
  type BuildResult,
} from './builders/graph-builder';
export { generateNodeId, buildNode } from './builders/node-builder';
export { EdgeBuilder, aggregateWeights } from './builders/edge-builder';
export {
  buildNodeVectors,
  buildVectors,
  cosineSimilarity,
  getNodeVectorText,
  setEmbeddingModel,
  type VectorBuildResult,
} from './builders/vector-builder';

// ==================== 查询与检索 ====================

export { GraphQuerier } from './search/graph-query';
export type {
  QueryOptions,
  DependencyOptions,
  DependencyResult,
  PathResult,
  GraphStats,
} from './search/graph-query';
export { SemanticSearcher, vectorizeQuery } from './search/semantic-search';
export type { SearchResult, SearchOptions } from './search/semantic-search';

// ==================== 子图裁剪 ====================

export { SubgraphTrimmer, trimmingConfigToOptions } from './trimming/subgraph-trimmer';
export type { SubgraphOptions } from './trimming/subgraph-trimmer';

// ==================== 压缩序列化 ====================

export {
  HierarchicalSerializer,
  estimateTokens,
  getCompressionLevel,
} from './compression/hierarchical-serializer';
export type {
  CompressionLevel,
  SerializeOptions,
  SerializeResult,
} from './compression/hierarchical-serializer';
export {
  extractSkeleton,
  formatSkeletonLine,
  distanceToSkeletonLevel,
} from './compression/skeleton-extractor';
export type { SkeletonLevel, SkeletonResult } from './compression/skeleton-extractor';

// ==================== Context Pipeline ====================

export { ContextPipeline } from './context/context-pipeline';
export type { ContextOptions } from './context/context-pipeline';

// ==================== CLI ====================

export { registerGraph } from './commands/graph';
