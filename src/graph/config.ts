/**
 * 图谱配置读取与默认值
 *
 * 从 workflow.config.yaml 的 graph 配置段读取配置，
 * 与默认值合并，返回完整的 GraphConfig。
 */
import { loadConfig } from '../lib/config';
import type {
  GraphConfig,
  GraphBuildConfig,
  GraphMappingConfig,
  GraphSearchConfig,
  GraphTrimmingConfig,
  GraphCompressionConfig,
  GraphEmbeddingConfig,
} from './types';

// ==================== 默认配置 ====================

const DEFAULT_BUILD: GraphBuildConfig = {
  ignore: [
    'node_modules',
    'dist',
    'build',
    '.git',
    'wpw/knowledge/graph',
    '.next',
    '.nuxt',
    'coverage',
    'target',
  ],
  languages: ['typescript', 'javascript', 'vue', 'java'],
  stateManagers: ['pinia'],
  frameworks: [],
  moduleRoots: ['src/modules', 'src/pages', 'src/views', 'src/main/java'],
  commonDirs: [
    // 通用工具
    'utils',
    'helpers',
    'common',
    'shared',
    'lib',
    'tools',
    // 资源
    'assets',
    'styles',
    'css',
    'images',
    'fonts',
    'static',
    'public',
    // 类型与常量
    'types',
    'constants',
    'config',
    'typings',
    'interfaces',
    'enums',
    // React/Vue
    'hooks',
    'composables',
    'directives',
    'pipes',
    // 后端基础设施
    'guards',
    'interceptors',
    'middlewares',
    'filters',
    'pipes',
    'decorators',
    'dto',
    'entities',
    'entity',
    'models',
    'database',
    'migrations',
    // Spring Boot 技术分层（不作为业务模块）
    'controller',
    'controllers',
    'service',
    'services',
    'repository',
    'repositories',
    'mapper',
    'mappers',
    'dao',
    'vo',
    'bo',
    'pojo',
    // 测试
    'test',
    'tests',
    '__tests__',
    'spec',
    'specs',
    '__specs__',
    'mock',
    'mocks',
    'fixtures',
    // 模板
    'templates',
    'template',
    // 其他
    'graph', // 图谱子系统自身代码，不算业务模块
    'i18n',
    'locale',
    'locales',
    'polyfills',
    'vendor',
  ],
};

const DEFAULT_MAPPING: GraphMappingConfig = {
  mode: 'local',
  semanticTopK: 5,
  // 共能力边：每个能力下取前 5 个文件两两相连（最多 10 对 / 能力）。
  // 5 是扫描出来的：K 从 5 放宽到 12（覆盖该能力全部通过阈值的映射目标）时，
  // 离线 Recall@10 不再提高，而导航文本 token 从 1574 涨到 2060（+31%），
  // 边际的几个文件只带来噪声。见 6.4.7 的共能力边小节。
  couplingMaxFilesPerCapability: 5,
  gitHistory: true,
  gitMaxCommits: 1000,
  gitMinFreq: 2,
};

const DEFAULT_SEARCH: GraphSearchConfig = {
  defaultLimit: 10,
  threshold: 0.5,
  decayAlpha: 3.0,
};

const DEFAULT_TRIMMING: GraphTrimmingConfig = {
  defaultDepth: 3,
  minWeight: 0.7,
  // 0.7 是按结构边的量级定的（contain 0.9、import 0.75）。business_map 边的权重
  // 是语义相似度融合值，构建侧上限 0.7、实测集中在 0.33~0.43，全部低于 0.7，
  // 若沿用同一阈值则业务映射边整类不可通行、C 层锚点只能返回自身。
  minWeightByType: {
    business_map: 0.3,
    // 共能力边的权重取两侧 business_map 的较弱值，量纲与 business_map 相同（实测 0.30~0.55），
    // 因此沿用同一阈值，不引入新的量纲假设。
    sibling: 0.3,
  },
  // 上限只是防爆量的护栏，真正的约束是 tokenBudget（超预算时管线会依次降压缩、
  // 减上限、减深度）。100 在允许路径中途换向后会先被撞满，把新够得着的节点又裁掉，
  // 所以放宽到 200；按 3.1 万 token 的预算，200 节点在 standard 压缩下仍在预算内。
  maxNodes: 200,
  semanticWeight: 0.6,
  structuralWeight: 0.4,
};

const DEFAULT_COMPRESSION: GraphCompressionConfig = {
  level: 'standard',
};

const DEFAULT_EMBEDDING: GraphEmbeddingConfig = {
  enabled: true,
  model: 'Xenova/bge-small-zh-v1.5',
  dimensions: 512,
  mirror: 'huggingface',
};

const DEFAULT_CONFIG: GraphConfig = {
  build: DEFAULT_BUILD,
  mapping: DEFAULT_MAPPING,
  search: DEFAULT_SEARCH,
  trimming: DEFAULT_TRIMMING,
  compression: DEFAULT_COMPRESSION,
  embedding: DEFAULT_EMBEDDING,
  modules: [],
};

// ==================== 配置读取 ====================

/**
 * 读取图谱配置
 *
 * @param root 项目根目录
 * @returns 完整的图谱配置（用户配置与默认值合并）
 */
export function loadGraphConfig(root: string): GraphConfig {
  const wfConfig = loadConfig(root);
  // 从 workflow.config.yaml 中读取 graph 字段
  const userGraph = (wfConfig as any).graph || {};

  return {
    build: {
      ...DEFAULT_BUILD,
      ...(userGraph.build || {}),
      ignore: userGraph.build?.ignore ?? DEFAULT_BUILD.ignore,
      languages: userGraph.build?.languages ?? DEFAULT_BUILD.languages,
      stateManagers: userGraph.build?.stateManagers ?? DEFAULT_BUILD.stateManagers,
      frameworks: userGraph.build?.frameworks ?? DEFAULT_BUILD.frameworks,
      moduleRoots: userGraph.build?.moduleRoots ?? DEFAULT_BUILD.moduleRoots,
      commonDirs: userGraph.build?.commonDirs ?? DEFAULT_BUILD.commonDirs,
    },
    mapping: {
      ...DEFAULT_MAPPING,
      ...(userGraph.mapping || {}),
    },
    search: {
      ...DEFAULT_SEARCH,
      ...(userGraph.search || {}),
    },
    trimming: {
      ...DEFAULT_TRIMMING,
      ...(userGraph.trimming || {}),
      // 按键合并：用户只覆盖 business_map 一类时，其余类型的默认阈值仍生效
      minWeightByType: {
        ...DEFAULT_TRIMMING.minWeightByType,
        ...(userGraph.trimming?.minWeightByType || {}),
      },
    },
    compression: {
      ...DEFAULT_COMPRESSION,
      ...(userGraph.compression || {}),
    },
    embedding: {
      ...DEFAULT_EMBEDDING,
      ...(userGraph.embedding || {}),
      enabled: userGraph.embedding?.enabled ?? DEFAULT_EMBEDDING.enabled,
      mirror: userGraph.embedding?.mirror ?? DEFAULT_EMBEDDING.mirror,
    },
    modules: userGraph.modules ?? [],
  };
}

/**
 * 获取默认配置（用于测试或无配置场景）
 */
export function getDefaultGraphConfig(): GraphConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}
