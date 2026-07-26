## Purpose

知识图谱构建与多语言源码解析能力。负责从项目代码中提取需求、模块、文件、代码元素四层节点，构建关系边，并生成语义向量索引。

## Requirements

### Requirement: 向量索引构建集成
图谱构建流程 SHALL 集成向量索引生成，全量构建时自动为所有支持的节点生成语义向量并持久化。节点向量生成 SHALL 融合节点名称、所属文件路径、父节点名、注释/JSDoc 文本，以提升中文语义检索效果。

#### Scenario: 全量构建生成向量
- **WHEN** 执行 `wpw graph build` 且 embedding.enabled 为 true
- **THEN** 系统在构建完图谱结构后，自动为 L1/L2/L3/L4 节点生成向量
- **AND** L4 节点的向量输入文本包含 `filePath + " " + parentName + " " + nodeName + " " + commentText`
- **AND** 向量索引与 mapping 持久化到 `wpw/knowledge/graph/index/` 目录
- **AND** meta.json 中 totalVectors 字段正确更新

#### Scenario: 向量构建失败降级
- **WHEN** Embedding 模型下载或加载失败
- **THEN** 系统跳过向量生成，输出警告信息
- **AND** 图谱结构数据正常保存
- **AND** `wpw graph search` 提示向量索引不存在
- **AND** `wpw graph context` 的 `--anchors` 模式仍可正常使用

#### Scenario: 增量更新重建向量
- **WHEN** 执行 `wpw graph update` 且有文件变更
- **THEN** 向量索引全量重建（首版简化实现）
- **AND** 与全量构建的向量结果一致

#### Scenario: 关闭向量生成
- **WHEN** 配置 `graph.embedding.enabled: false`
- **THEN** 构建流程跳过向量生成阶段
- **AND** 构建速度更快

### Requirement: Embedding 模型镜像源配置
系统 SHALL 支持配置 Embedding 模型下载镜像源，以适配不同网络环境（如国内无法访问 HuggingFace）。

#### Scenario: 默认 HuggingFace 源
- **WHEN** 未配置 `graph.embedding.mirror` 或配置为 `huggingface`
- **THEN** 系统从 HuggingFace（huggingface.co）下载模型

#### Scenario: 切换 ModelScope 镜像
- **WHEN** 配置 `graph.embedding.mirror: modelscope`
- **THEN** 系统从 ModelScope（modelscope.cn）下载模型
- **AND** 下载的模型与 HuggingFace 源等价
- **AND** 模型缓存后后续构建无需重复下载

#### Scenario: 查询与构建使用同一模型
- **WHEN** 执行 `wpw graph search` 或 `wpw graph context` 语义检索
- **THEN** 查询向量生成使用与构建时相同的模型名与镜像源
- **AND** 从配置中读取，确保查询向量与索引向量维度一致

### Requirement: 多前端语言支持
源码解析器 SHALL 支持 TypeScript、TSX、JavaScript、JSX、Vue SFC 五种前端主流文件格式。

#### Scenario: TypeScript 文件解析
- **WHEN** 解析 `.ts` 文件
- **THEN** 使用 tree-sitter-typescript 解析
- **AND** 提取函数、类、接口、常量、类型别名
- **AND** 函数节点携带 `filePath`、`parentName`（所属模块/类/store）属性

#### Scenario: TSX 文件解析
- **WHEN** 解析 `.tsx` 文件
- **THEN** 使用 tree-sitter-tsx（独立 WASM）解析
- **AND** 提取函数、组件、类、接口、常量
- **AND** 首字母大写的函数标记为组件类型

#### Scenario: JavaScript 文件解析
- **WHEN** 解析 `.js` / `.mjs` / `.cjs` 文件
- **THEN** 使用 tree-sitter-javascript 解析
- **AND** 提取函数、类、常量
- **AND** 若文件为 Pinia store 格式，额外提取 store 结构（见 Pinia 索引需求）

#### Scenario: JSX 文件解析
- **WHEN** 解析 `.jsx` 文件
- **THEN** 使用 tree-sitter-javascript 解析（原生支持 JSX）
- **AND** 提取函数、组件、类、常量
- **AND** 首字母大写的函数标记为组件类型

#### Scenario: Vue SFC 文件解析
- **WHEN** 解析 `.vue` 文件
- **THEN** 系统提取 `<script>` 或 `<script setup>` 块内容
- **AND** 如果 `lang="ts"`，用 TypeScript 解析；否则用 JavaScript 解析
- **AND** 文件节点标记为 Vue 组件
- **AND** 组件名从文件名推断（PascalCase）
- **AND** 组件内的函数/方法节点携带 `parentName` = 组件名

#### Scenario: Vue SFC 无 script 块
- **WHEN** 解析的 `.vue` 文件没有 `<script>` 块
- **THEN** 仍生成文件节点（标记为 Vue 组件）
- **AND** 没有 L4 元素节点
- **AND** 不报错

#### Scenario: import 边生成支持所有格式
- **WHEN** 构建 import 边时
- **THEN** TS/TSX/JS/JSX/Vue 文件的 import 语句都被正确提取
- **AND** 跨格式的 import 关系（如 .vue import .ts）正确建立

### Requirement: Pinia store 索引
图谱构建 SHALL 支持解析 Pinia store 文件（Options API 和 Setup API 两种风格），将 store 及其 actions/getters/state 作为节点纳入图谱，并建立与组件调用方的边关系。

#### Scenario: Options API store 解析
- **WHEN** 解析 `.js` / `.ts` 文件，存在 `defineStore('useXxxStore', { state, actions, getters })` 调用
- **THEN** 生成 L3 级别的 store 节点（类型 `pinia-store`，节点名 = store id）
- **AND** 每个 action 函数生成 L4 节点（类型 `pinia-action`），`parentName` = store 名
- **AND** 每个 getter 生成 L4 节点（类型 `pinia-getter`）
- **AND** state 属性生成 L4 节点（类型 `pinia-state`）
- **AND** store 节点与文件节点建立 contains 边
- **AND** action/getter/state 节点与 store 节点建立 contains 边

#### Scenario: Setup API store 解析
- **WHEN** 解析 `.js` / `.ts` 文件，存在 `defineStore('useXxxStore', () => { ... })` 调用（第二个参数为函数）
- **THEN** 生成 L3 级别的 store 节点（类型 `pinia-store`）
- **AND** 从返回对象中识别 actions（函数类型）、state（ref/reactive 包装的响应式数据）
- **AND** 生成相应的 L4 节点，属性与 Options API 一致

#### Scenario: 组件调用 Pinia action 建边
- **WHEN** Vue 组件或 TS 文件中 `import { useXxxStore } from '@/stores/xxx'` 并调用 `xxxStore.someAction()`
- **THEN** 组件节点与对应的 `pinia-action` 节点建立 `calls` 边
- **AND** 边权重根据调用频次或上下文重要性设置（默认 0.6）

#### Scenario: 非 store 文件不生成 pinia 节点
- **WHEN** 解析普通 `.ts` / `.js` 工具函数文件
- **THEN** 不生成 pinia-store / pinia-action 节点
- **AND** 仅按原有规则提取函数/常量等 L4 节点

### Requirement: 函数节点上下文属性
所有 L4 函数节点（普通函数、组件方法、Pinia action）SHALL 携带 `filePath` 和 `parentName` 属性，用于搜索结果去歧义。`parentName` 为该函数所属的上层容器名（组件名、类名、store 名或模块文件名）。

#### Scenario: 重名函数可区分
- **WHEN** 图谱中存在多个同名函数节点（如三个 `onSubmit`）
- **THEN** 每个节点的 `filePath` 和 `parentName` 属性各不相同
- **AND** 搜索结果展示时可通过 `parentName/nodeName` 格式区分

#### Scenario: 独立文件中的顶层函数
- **WHEN** 函数定义在工具函数文件顶层，不属于任何类/组件/store
- **THEN** `parentName` = 文件名（不含扩展名）
- **AND** `filePath` = 文件相对路径

### Requirement: aggregateWeights 返回溯源信息
`aggregateWeights` 函数 SHALL 在返回聚合权重的同时，返回每个目标的最权威证据源，供 `business_map` 边溯源标签使用。返回值 SHALL 包含权重映射与来源映射，二者键一致。

#### Scenario: 返回权重与来源
- **WHEN** 调用 `aggregateWeights(evidences)` 处理含多源命中的证据集合
- **THEN** 返回值包含每个目标节点的聚合权重
- **AND** 返回值包含每个目标节点的最权威证据源
- **AND** 调用方据此设置 `business_map` 边的 `source` 字段，而非依赖证据数组顺序

### Requirement: 语义映射回填阶段
`buildGraph` 流程 SHALL 在向量索引构建完成后，新增"语义映射回填"阶段，将语义相似性转化为 `business_map` 证据并参与聚合。该阶段 SHALL 在 `business_map` 边生成主流程内完成，无需单独的图谱重建。

#### Scenario: 向量存在时回填
- **WHEN** 执行 `wpw graph build` 且向量索引构建成功
- **THEN** 语义映射回填阶段对每个 L1 需求节点检索相似 L2/L3 节点
- **AND** 生成的 semantic 证据与 doc-extract/git-history/name-match 证据一并喂入 noisy-OR 聚合

#### Scenario: 向量缺失时降级
- **WHEN** 向量索引构建失败或 `embedding.enabled: false`
- **THEN** 跳过语义映射回填阶段
- **AND** 仍基于 doc-extract/git-history/name-match 三源聚合生成 `business_map` 边
- **AND** 输出提示"语义映射源已跳过"

#### Scenario: 非 Git 仓库降级
- **WHEN** 项目非 Git 仓库或 `mapping.gitHistory: false`
- **THEN** 跳过 Git 历史追溯
- **AND** 仍基于其余源聚合生成 `business_map` 边

### Requirement: 业务-代码多源证据映射
系统 SHALL 通过多源证据融合自动建立业务需求（L1）与模块/文件/代码元素（L2/L3/L4）之间的 `business_map` 关联边，无需手动标注。证据来源 SHALL 包括：文档提取（doc-extract）、语义匹配（semantic）、Git 历史追溯（git-history）、命名匹配（name-match）；AI 校准（ai-refine）为可选增强（首版不实现）。同一目标被多源命中时，系统 SHALL 采用 noisy-OR 公式聚合权重：`finalWeight = 1 − ∏(1 − baseWeightᵢ)`，上限 0.95。

#### Scenario: 文档提取证据
- **WHEN** 需求文档（PRD 依赖模块字段 / Design 模块划分表 / 接口设计章节）中抽取到模块名且该模块存在于图谱
- **THEN** 生成 `source: 'doc-extract'` 证据，baseWeight 0.85
- **AND** 参与该需求的 noisy-OR 权重聚合

#### Scenario: 语义匹配证据
- **WHEN** 向量索引存在且需求节点向量与某 L2/L3 节点向量的余弦相似度 ≥ 语义映射阈值
- **THEN** 生成 `source: 'semantic'` 证据，baseWeight 由相似度线性映射（上限 0.7）
- **AND** 每个需求取相似度 Top-K（默认 5）个候选目标
- **AND** 仅对 L2 模块节点与 L3 文件节点生成语义证据（不对 L4 元素逐一生成，控制规模）

#### Scenario: Git 历史追溯证据
- **WHEN** 项目为 Git 仓库且 `mapping.gitHistory` 为 true
- **THEN** 系统按需求名与抽取关键词调用 `git log` 检索匹配 commit
- **AND** 统计这些 commit 修改的文件频次
- **AND** 对频次 ≥ `mapping.gitMinFreq`（默认 2）的文件节点生成 `source: 'git-history'` 证据，baseWeight 由频次归一化映射（上限 0.7）

#### Scenario: 命名匹配证据
- **WHEN** 需求名（含中文）与目标节点名经中英文词典（≥30 词条）或前缀/包含匹配命中
- **THEN** 生成 `source: 'name-match'` 证据，baseWeight 依匹配强度（直接包含 0.6 / 前缀 0.5 / 词典 0.45），上限 0.7

#### Scenario: 多源 noisy-OR 聚合
- **WHEN** 同一目标节点被多个证据源命中
- **THEN** 系统按 `1 − ∏(1 − wᵢ)` 聚合最终权重，上限 0.95
- **AND** 多源命中的权重严格高于任一单源权重（除非已达上限）

#### Scenario: 低权重边剪枝
- **WHEN** 某目标聚合后权重 < 0.3
- **THEN** 不生成 `business_map` 边

### Requirement: business_map 边溯源标签
每条 `business_map` 边 SHALL 携带 `source` 字段，记录支撑该边的最权威证据来源。证据源权威性排名 SHALL 为：structure(10) > doc-extract(8) > ai-refine(7) > git-history(5) > semantic(4) > name-match(2)。当多源命中同一目标时，`source` 取排名最高者。

#### Scenario: 多源命中取最权威源
- **WHEN** 同一目标同时被 semantic（rank 4）与 doc-extract（rank 8）命中
- **THEN** 生成的 `business_map` 边 `source` 字段为 `doc-extract`
- **AND** 与证据被收集的顺序无关（不受 push 顺序影响）

#### Scenario: 单源命中保留该源
- **WHEN** 目标仅被 name-match 命中
- **THEN** 边 `source` 字段为 `name-match`
