/**
 * 向量生成与索引构建
 *
 * 基于 @xenova/transformers 本地生成语义向量，
 * 构建二进制向量索引 + 节点映射关系。
 *
 * 哪些节点生成向量：
 * - L1 需求节点（需求描述文本）
 * - L2 模块节点（模块名 + 职责描述）
 * - L3 文件节点（文件名 + 顶层注释）
 * - L4 函数/类/接口/组件节点（名称 + 签名 + JSDoc）
 *
 * 常量节点不生成向量（信息太少）。
 */
import type { GraphNode, VectorMapping } from '../types';

/** 向量构建结果 */
export interface VectorBuildResult {
  /** 向量数据（连续存储的 float32 数组） */
  vectors: Float32Array;
  /** 向量维度 */
  dimensions: number;
  /** 向量与节点的映射 */
  mapping: VectorMapping;
}

/**
 * 获取节点的向量化文本
 *
 * 返回 null 表示该节点不需要生成向量。
 */
export function getNodeVectorText(node: GraphNode): string | null {
  switch (node.type) {
    case 'requirement': {
      // 需求：名称 + 描述 + 标签
      const parts = [node.name];
      if (node.attrs.description) parts.push(node.attrs.description);
      if (node.attrs.tags?.length) parts.push(node.attrs.tags.join(', '));
      return parts.join('\n');
    }

    case 'module': {
      // 模块：名称 + 职责描述
      const parts = [node.name];
      if (node.attrs.description) parts.push(node.attrs.description);
      if (node.attrs.side) parts.push(`所属端: ${node.attrs.side}`);
      return parts.join('\n');
    }

    case 'file': {
      // 文件：文件名 + 路径
      return `${node.attrs.filePath ?? node.name}\n${node.name}`;
    }

    case 'function':
    case 'component':
    case 'pinia-action':
    case 'pinia-getter': {
      // 函数/组件/Pinia action & getter：名称 + 签名 + JSDoc + 所属文件路径（提升同名义函数区分度）
      const parts = [node.name];
      if (node.attrs.signature) parts.push(node.attrs.signature);
      if (node.attrs.jsDoc) parts.push(node.attrs.jsDoc);
      if (node.attrs.parentName) parts.push(`属于: ${node.attrs.parentName}`);
      if (node.attrs.filePath) parts.push(node.attrs.filePath);
      return parts.join('\n');
    }

    case 'class':
    case 'interface': {
      // 类/接口：名称 + 签名 + JSDoc + 所属文件
      const parts = [node.name];
      if (node.attrs.signature) parts.push(node.attrs.signature);
      if (node.attrs.jsDoc) parts.push(node.attrs.jsDoc);
      if (node.attrs.filePath) parts.push(node.attrs.filePath);
      return parts.join('\n');
    }

    case 'pinia-store': {
      // Pinia Store：名称 + 描述 + 路径
      const parts = [node.name, 'Pinia 状态管理'];
      if (node.attrs.description) parts.push(node.attrs.description);
      if (node.attrs.filePath) parts.push(node.attrs.filePath);
      return parts.join('\n');
    }

    case 'pinia-state': {
      // Pinia state：名称 + 所属 store + 路径
      const parts = [node.name];
      if (node.attrs.parentName) parts.push(`store: ${node.attrs.parentName}`);
      if (node.attrs.jsDoc) parts.push(node.attrs.jsDoc);
      if (node.attrs.filePath) parts.push(node.attrs.filePath);
      return parts.join('\n');
    }

    case 'constant':
    default:
      // 常量等不生成向量（信息密度低）
      return null;
  }
}

/**
 * 从节点列表中筛选需要生成向量的节点，并提取文本
 */
export function prepareVectorTexts(nodes: GraphNode[]): {
  nodeIds: string[];
  texts: string[];
} {
  const nodeIds: string[] = [];
  const texts: string[] = [];

  for (const node of nodes) {
    const text = getNodeVectorText(node);
    if (text && text.trim().length > 0) {
      nodeIds.push(node.id);
      texts.push(text);
    }
  }

  return { nodeIds, texts };
}

// ==================== 向量化（基于 Transformers.js） ====================

let pipelinePromise: Promise<any> | null = null;
let modelName = 'Xenova/all-MiniLM-L6-v2';
let configuredMirror: 'huggingface' | 'modelscope' | undefined;

/** 设置模型名称（必须在第一次调用前设置） */
export function setEmbeddingModel(name: string): void {
  modelName = name;
  pipelinePromise = null;
}

/**
 * 设置模型下载镜像源
 *
 * 支持：
 *   - huggingface（默认）
 *   - modelscope（国内镜像，速度更快）
 *
 * 必须在第一次调用 pipeline 前设置。
 */
export function setEmbeddingMirror(mirror: 'huggingface' | 'modelscope'): void {
  configuredMirror = mirror;
  pipelinePromise = null;
}

/**
 * 配置 transformers 的远程源
 */
async function configureTransformersEnv(): Promise<void> {
  const { env } = await import('@xenova/transformers');

  if (configuredMirror === 'modelscope') {
    // ModelScope 镜像
    env.remoteHost = 'https://www.modelscope.cn';
    env.remotePathTemplate = 'models/{model}/resolve/master/';
  }
  // 默认就是 huggingface，不用改
}

/**
 * 懒加载 embedding pipeline
 */
async function getPipeline(): Promise<any> {
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    // 动态导入，避免打包时体积过大
    const { pipeline } = await import('@xenova/transformers');

    // 配置镜像源（如果设置了）
    await configureTransformersEnv();

    return await pipeline('feature-extraction', modelName, {
      quantized: true,
    });
  })();

  return pipelinePromise;
}

/**
 * 计算余弦相似度（用于语义检索测试和工具函数）
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 为一批文本生成向量
 *
 * @param texts 文本列表
 * @param modelName 模型名称
 * @returns 向量矩阵（一维数组，按行存储）+ 维度数
 */
export async function buildVectors(
  texts: string[],
  modelName?: string,
): Promise<{ vectors: Float32Array; dimensions: number }> {
  if (texts.length === 0) {
    return { vectors: new Float32Array(), dimensions: 384 };
  }

  if (modelName) {
    setEmbeddingModel(modelName);
  }

  const extractor = await getPipeline();

  // 批量生成
  const output = await extractor(texts, {
    pooling: 'mean',
    normalize: true,
  });

  // 输出是 Tensor，转成 Float32Array
  const data: Float32Array = output.data;
  const dimensions = output.dims[output.dims.length - 1];

  return { vectors: data, dimensions };
}

/**
 * 为图谱节点生成向量并构建映射
 *
 * @param nodes 节点列表
 * @param modelName 模型名称（可选，覆盖默认值）
 * @param mirror 镜像源（可选，huggingface / modelscope）
 */
export async function buildNodeVectors(
  nodes: GraphNode[],
  modelName?: string,
  mirror?: 'huggingface' | 'modelscope',
): Promise<VectorBuildResult> {
  if (mirror) {
    setEmbeddingMirror(mirror);
  }
  const { nodeIds, texts } = prepareVectorTexts(nodes);
  const { vectors, dimensions } = await buildVectors(texts, modelName);

  const indexToNodeId = nodeIds;
  const nodeIdToIndex = new Map<string, number>();
  nodeIds.forEach((id, i) => nodeIdToIndex.set(id, i));

  return {
    vectors,
    dimensions,
    mapping: {
      indexToNodeId,
      nodeIdToIndex,
    },
  };
}
