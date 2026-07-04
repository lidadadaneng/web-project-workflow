/**
 * 六阶段工作流 Schema 定义（内置 CLI，不可由用户修改）。
 *
 * 定义 BRD → PRD → Explore → Design → Plan → Test 六个 artifact 及其依赖关系。
 * 依赖分两类：
 *   - dependsOn：强依赖，前置阶段必须 done 才能进入
 *   - optionalDeps：弱依赖，有则读取作为输入，无则跳过
 *
 * 见 design.md 的 Dependency Graphs (DAG) 章节。
 */

export type ArtifactId =
  | 'brd'
  | 'prd'
  | 'explore'
  | 'design'
  | 'plan'
  | 'testplan';

export type ArtifactStatus =
  | 'pending' // 未开始
  | 'outlining' // 大纲生成中
  | 'confirmed' // 大纲已确认
  | 'done' // 已落盘完成
  | 'skipped'; // 已跳过（仅 skippable 阶段）

export interface ArtifactDef {
  id: ArtifactId;
  name: string; // 中文名
  dependsOn: ArtifactId[]; // 强依赖
  optionalDeps: ArtifactId[]; // 弱依赖
  file: string; // 文件名模板，{name} 替换为需求名
  phase: string; // 阶段层标识
  skippable?: boolean; // 可跳过（explore）
  inputMode?: 'hybrid'; // BRD 特有：有输入整理/无输入问答
  output?: 'options'; // Explore 特有：产出候选方案不拍板
  requiresConfirmation?: boolean; // Design 特有：需用户拍板后进入
}

export interface SchemaDef {
  name: string;
  description: string;
  artifacts: ArtifactDef[];
  apply: {
    requires: ArtifactId[]; // 进入 apply 的门禁
    tasksFrom: ArtifactId; // 任务来源 artifact
  };
  phases: {
    confirmation: boolean; // 落盘前大纲确认
    humanize: boolean; // 去机器腔
  };
}

export const sixPhaseSchema: SchemaDef = {
  name: 'wpw-six-phase',
  description: 'Web Project Workflow - BRD → PRD → Explore → Design → Plan → Test',
  artifacts: [
    {
      id: 'brd',
      name: '业务需求文档',
      dependsOn: [],
      optionalDeps: [],
      file: 'BRD-{name}.md',
      phase: 'business',
      inputMode: 'hybrid',
    },
    {
      id: 'prd',
      name: '产品需求文档',
      dependsOn: ['brd'],
      optionalDeps: [],
      file: 'PRD-{name}.md',
      phase: 'product',
    },
    {
      id: 'explore',
      name: '技术方案探索',
      dependsOn: ['prd'],
      optionalDeps: [],
      file: 'Explore-{name}.md',
      phase: 'exploration',
      skippable: true,
      output: 'options',
    },
    {
      id: 'design',
      name: '技术方案设计',
      dependsOn: ['prd'],
      optionalDeps: ['explore'],
      file: 'Design-{name}.md',
      phase: 'design',
      requiresConfirmation: true,
    },
    {
      id: 'plan',
      name: '开发计划',
      dependsOn: ['design'],
      optionalDeps: [],
      file: 'Plan-{name}.md',
      phase: 'plan',
    },
    {
      id: 'testplan',
      name: '测试方案',
      dependsOn: ['design', 'plan'],
      optionalDeps: [],
      file: 'TestPlan-{name}.md',
      phase: 'test',
    },
  ],
  apply: {
    requires: ['plan'],
    tasksFrom: 'plan',
  },
  phases: {
    confirmation: true,
    humanize: true,
  },
};

/** 内置 schema 注册表（未来可扩展多 schema） */
export const schemas: Record<string, SchemaDef> = {
  [sixPhaseSchema.name]: sixPhaseSchema,
};

export function getSchema(name: string): SchemaDef {
  const s = schemas[name];
  if (!s) throw new Error(`未知 schema: ${name}`);
  return s;
}

export function getArtifact(schema: SchemaDef, id: ArtifactId): ArtifactDef {
  const a = schema.artifacts.find((x) => x.id === id);
  if (!a) throw new Error(`未知 artifact: ${id}`);
  return a;
}

export function resolveFileName(artifact: ArtifactDef, name: string): string {
  return artifact.file.replace('{name}', name);
}

/** 列出所有 artifact id（按定义顺序） */
export function listArtifactIds(schema: SchemaDef): ArtifactId[] {
  return schema.artifacts.map((a) => a.id);
}
