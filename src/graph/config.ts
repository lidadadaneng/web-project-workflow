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
  maxNodes: 100,
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
