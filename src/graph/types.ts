/**
 * 知识图谱核心类型定义
 *
 * 业务能力层 + 三层结构模型：
 *   C 层（Capability 业务能力） →  L1（模块） →  L2（文件） →  L3（代码元素）
 *   C 层与结构层之间为 business_map 边，不是 contain 层级包含
 */

// ==================== 节点类型 ====================

/** 节点层级 */
export type NodeLevel = 'C' | 'L1' | 'L2' | 'L3';

/** C 层能力节点类型 */
export const NODE_TYPE_CAPABILITY = 'capability';
/** L1 模块节点类型 */
export const NODE_TYPE_MODULE = 'module';
/** L2 文件节点类型 */
export const NODE_TYPE_FILE = 'file';
/** L3 函数节点类型 */
export const NODE_TYPE_FUNCTION = 'function';
/** L3 类节点类型 */
export const NODE_TYPE_CLASS = 'class';
/** L3 接口节点类型 */
export const NODE_TYPE_INTERFACE = 'interface';
/** L3 常量节点类型 */
export const NODE_TYPE_CONSTANT = 'constant';
/** L3 组件节点类型 */
export const NODE_TYPE_COMPONENT = 'component';
/** L2 Pinia Store 节点类型 */
export const NODE_TYPE_PINIA_STORE = 'pinia-store';
/** L3 Pinia Action 节点类型 */
export const NODE_TYPE_PINIA_ACTION = 'pinia-action';
/** L3 Pinia Getter 节点类型 */
export const NODE_TYPE_PINIA_GETTER = 'pinia-getter';
/** L3 Pinia State 节点类型 */
export const NODE_TYPE_PINIA_STATE = 'pinia-state';

/** 所有节点类型 */
export type NodeType =
  | typeof NODE_TYPE_CAPABILITY
  | typeof NODE_TYPE_MODULE
  | typeof NODE_TYPE_FILE
  | typeof NODE_TYPE_FUNCTION
  | typeof NODE_TYPE_CLASS
  | typeof NODE_TYPE_INTERFACE
  | typeof NODE_TYPE_CONSTANT
  | typeof NODE_TYPE_COMPONENT
  | typeof NODE_TYPE_PINIA_STORE
  | typeof NODE_TYPE_PINIA_ACTION
  | typeof NODE_TYPE_PINIA_GETTER
  | typeof NODE_TYPE_PINIA_STATE;

/** 模块所属端 */
export type ModuleSide = 'frontend' | 'backend' | 'shared' | 'unknown';

/** 需求功能条目（从 PRD/能力 spec 结构化提取） */
export interface RequirementFeature {
  /** 功能编号，如 F1、F2 */
  id: string;
  /** 功能名称 */
  name: string;
  /** 优先级，如 P0、P1 */
  priority?: string;
  /** 功能描述（含验收标准） */
  description?: string;
}

/** 节点扩展属性（JSON 存储，不同节点类型有不同字段） */
export interface NodeAttributes {
  // 通用
  description?: string;
  tags?: string[];

  // C 层能力
  features?: RequirementFeature[];  // 结构化功能条目（从 spec 提取）

  // L1 模块
  side?: ModuleSide;
  dir?: string;             // 模块根目录

  // L2 文件
  filePath?: string;
  language?: string;        // typescript / javascript / ...
  fileHash?: string;

  // L3 元素
  signature?: string;       // 函数/方法签名
  params?: Array<{ name: string; type?: string }>;
  returnType?: string;
  lineStart?: number;
  lineEnd?: number;
  parentName?: string;      // 所属类/接口名
  isExported?: boolean;
  annotations?: string[];   // 装饰器/注解
  jsDoc?: string;           // JSDoc 注释摘要
}

/** 图谱节点 */
export interface GraphNode {
  /** 全局唯一节点 ID */
  id: string;
  /** 层级 */
  level: NodeLevel;
  /** 节点类型 */
  type: NodeType;
  /** 节点名称 */
  name: string;
  /** 扩展属性 */
  attrs: NodeAttributes;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
}

// ==================== 边类型 ====================

/** 从属边（包含关系） */
export const EDGE_TYPE_CONTAIN = 'contain';
/** 调用边（函数/方法调用） */
export const EDGE_TYPE_CALL = 'call';
/** 导入边（文件间导入） */
export const EDGE_TYPE_IMPORT = 'import';
/** 继承边（类继承/接口实现） */
export const EDGE_TYPE_INHERIT = 'inherit';
/** 业务映射边（能力 ↔ 模块/文件/元素） */
export const EDGE_TYPE_BUSINESS_MAP = 'business_map';

/** 所有边类型 */
export type EdgeType =
  | typeof EDGE_TYPE_CONTAIN
  | typeof EDGE_TYPE_CALL
  | typeof EDGE_TYPE_IMPORT
  | typeof EDGE_TYPE_INHERIT
  | typeof EDGE_TYPE_BUSINESS_MAP;

/** 边的来源（用于追溯映射证据） */
export type EdgeSource =
  | 'structure'      // 结构解析（目录/AST）
  | 'doc-extract'    // 文档提取
  | 'semantic'       // 语义匹配
  | 'git-history'    // Git 历史追溯
  | 'name-match'     // 命名匹配
  | 'ai-refine';     // AI 校准

/** 图谱关系边（有向） */
export interface GraphEdge {
  /** 边 ID（from-type-to-source） */
  id: string;
  /** 起始节点 ID */
  from: string;
  /** 目标节点 ID */
  to: string;
  /** 关系类型 */
  type: EdgeType;
  /** 权重 0~1 */
  weight: number;
  /** 生成来源 */
  source: EdgeSource;
}

// ==================== 图谱数据 ====================

/** 完整图谱数据（内存结构） */
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** 内存图谱索引（用于快速查询） */
export interface GraphIndex {
  /** 节点 Map：id → node */
  nodeMap: Map<string, GraphNode>;
  /** 出边邻接表：nodeId → Edge[] */
  outEdges: Map<string, GraphEdge[]>;
  /** 入边邻接表：nodeId → Edge[] */
  inEdges: Map<string, GraphEdge[]>;
  /** 按层级分组的节点 ID */
  nodesByLevel: Map<NodeLevel, string[]>;
  /** 按类型分组的节点 ID */
  nodesByType: Map<NodeType, string[]>;
}

// ==================== 向量索引 ====================

/** 向量与节点的映射 */
export interface VectorMapping {
  /** 向量下标 → 节点 ID（与向量文件中下标一一对应） */
  indexToNodeId: string[];
  /** 节点 ID → 向量下标 */
  nodeIdToIndex: Map<string, number>;
}

// ==================== 配置类型 ====================

/** 构建配置 */
export interface GraphBuildConfig {
  /** 忽略目录（glob 模式） */
  ignore: string[];
  /** 支持的语言 */
  languages: string[];
  /** 模块根目录列表 */
  moduleRoots: string[];
  /** 通用目录（不作为业务模块） */
  commonDirs: string[];
}

/** 映射策略配置 */
export interface GraphMappingConfig {
  /** 映射模式：local 纯本地 / ai-refine AI 校准 */
  mode: 'local' | 'ai-refine';
  /** AI 模型名 */
  aiModel?: string;
  /** AI API Key */
  aiApiKey?: string;
  /** AI API Base URL */
  aiApiBase?: string;
  /** 语义匹配最小阈值（未设置时运行时回退 search.threshold） */
  semanticThreshold?: number;
  /** 语义匹配每个能力召回的 Top-K 候选目标（默认 5） */
  semanticTopK?: number;
  /** 是否启用 Git 历史追溯 */
  gitHistory: boolean;
  /** Git 最大回溯 commit 数 */
  gitMaxCommits: number;
  /** Git 历史文件频次下限，低于此频次不作为证据（默认 2，过滤单次修改噪声） */
  gitMinFreq?: number;
}

/** 检索配置 */
export interface GraphSearchConfig {
  /** 默认召回数量 */
  defaultLimit: number;
  /** 相似度阈值 */
  threshold: number;
  /** 置信度衰减系数 α（默认 3.0） */
  decayAlpha: number;
}

/** 子图裁剪配置 */
export interface GraphTrimmingConfig {
  /** 默认最大深度 */
  defaultDepth: number;
  /** 默认最小边权重 */
  minWeight: number;
  /** 默认节点上限 */
  maxNodes: number;
  /** 语义分权重 */
  semanticWeight: number;
  /** 结构重要度权重 */
  structuralWeight: number;
}

/** 压缩配置 */
export interface GraphCompressionConfig {
  /** 压缩等级 */
  level: 'loose' | 'standard' | 'extreme';
}

/** Embedding 配置 */
export interface GraphEmbeddingConfig {
  /** 是否启用向量生成 */
  enabled: boolean;
  /** 本地模型名称 */
  model: string;
  /** 向量维度 */
  dimensions: number;
  /** 模型下载镜像源（默认 huggingface，国内可选 modelscope） */
  mirror?: 'huggingface' | 'modelscope';
}

/** 手动模块定义 */
export interface ManualModuleDef {
  name: string;
  side?: ModuleSide;
  dir?: string;
  description?: string;
}

/** 图谱完整配置 */
export interface GraphConfig {
  build: GraphBuildConfig;
  mapping: GraphMappingConfig;
  search: GraphSearchConfig;
  trimming: GraphTrimmingConfig;
  compression: GraphCompressionConfig;
  embedding: GraphEmbeddingConfig;
  /** 手动模块定义（可选，覆盖自动推断） */
  modules: ManualModuleDef[];
}

// ==================== 子图 ====================

/** 子图数据 */
export interface Subgraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 锚点节点 ID */
  anchors: string[];
  /** 节点距离锚点的距离（锚点=0） */
  distances: Map<string, number>;
  /** 节点得分（语义分+结构重要度综合） */
  scores: Map<string, number>;
}

// ==================== 上下文输出 ====================

/** 上下文输出统计 */
export interface ContextStats {
  /** 锚点数量 */
  anchorCount: number;
  /** 子图节点数 */
  nodeCount: number;
  /** 子图边数 */
  edgeCount: number;
  /** 预估 Token 数 */
  estimatedTokens: number;
  /** 压缩率（原始文本 token / 压缩后 token） */
  compressionRatio: number;
  /** 检索耗时 ms */
  searchTimeMs: number;
  /** 裁剪耗时 ms */
  trimmingTimeMs: number;
  /** 压缩耗时 ms */
  compressionTimeMs: number;
  /** 总耗时 ms */
  totalTimeMs: number;
}

/** 上下文输出结果 */
export interface ContextResult {
  /** 锚点节点列表 */
  anchors: GraphNode[];
  /** 子图数据 */
  subgraph: Subgraph;
  /** 压缩后的文本（直接可喂给 LLM） */
  compressedText: string;
  /** 统计信息 */
  stats: ContextStats;
}

// ==================== 构建元数据 ====================

/** 构建元数据 */
export interface GraphMeta {
  /** 图谱 schema 版本 */
  schemaVersion: string;
  /** 构建时间 */
  builtAt: number;
  /** 节点总数 */
  totalNodes: number;
  /** 边总数 */
  totalEdges: number;
  /** 向量总数 */
  totalVectors: number;
  /** 文件哈希快照：路径 → SHA-256 */
  fileHashes: Record<string, string>;
  /** 配置版本（用于检测配置变更） */
  configVersion: string;
}

/** 当前 schema 版本（3.0.0：C+L1/L2/L3 架构） */
export const CURRENT_SCHEMA_VERSION = '3.0.0';

// ==================== 构建统计 ====================

/** 构建统计 */
export interface BuildStats {
  /** 各层级节点数 */
  nodesByLevel: Record<string, number>;
  /** 各类型边数 */
  edgesByType: Record<string, number>;
  /** 向量总数 */
  vectorCount: number;
  /** 总耗时 ms */
  totalTimeMs: number;
  /** 各阶段耗时 ms */
  phaseTimes: Record<string, number>;
  /** 校验结果 */
  validation: {
    passed: boolean;
    errors: string[];
    warnings: string[];
  };
}

// ==================== 向后兼容 ====================

/**
 * 旧层级值到新层级值的映射
 *   旧 L1 (需求)  →  C (能力)
 *   旧 L2 (模块)  →  L1 (模块)
 *   旧 L3 (文件)  →  L2 (文件)
 *   旧 L4 (元素)  →  L3 (元素)
 */
export const LEGACY_LEVEL_MAP: Record<string, NodeLevel> = {
  L1: 'C',
  L2: 'L1',
  L3: 'L2',
  L4: 'L3',
};
