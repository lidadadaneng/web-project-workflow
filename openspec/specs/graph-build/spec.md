## Purpose

知识图谱构建与多语言源码解析能力。负责从项目代码中提取能力、模块、文件、代码元素四层节点，构建关系边，并生成语义向量索引。采用 C（能力）+ L1/L2/L3（结构）双层架构。

## Requirements

### Requirement: 向量索引构建集成
图谱构建流程 SHALL 集成向量索引生成，全量构建时自动为所有支持的节点生成语义向量并持久化。节点向量生成 SHALL 融合节点名称、所属文件路径、父节点名、注释/JSDoc 文本，以提升中文语义检索效果。

#### Scenario: 全量构建生成向量
- **WHEN** 执行 `wpw graph build` 且 embedding.enabled 为 true
- **THEN** 系统在构建完图谱结构后，自动为 C/L1/L2/L3 节点生成向量
- **AND** L3 节点的向量输入文本包含 `filePath + " " + parentName + " " + nodeName + " " + commentText`
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
- **AND** 没有 L3 元素节点
- **AND** 不报错

#### Scenario: import 边生成支持所有格式
- **WHEN** 构建 import 边时
- **THEN** TS/TSX/JS/JSX/Vue 文件的 import 语句都被正确提取
- **AND** 跨格式的 import 关系（如 .vue import .ts）正确建立

### Requirement: Pinia store 索引
图谱构建 SHALL 支持解析 Pinia store 文件（Options API 和 Setup API 两种风格），将 store 及其 actions/getters/state 作为节点纳入图谱，并建立与组件调用方的边关系。

#### Scenario: Options API store 解析
- **WHEN** 解析 `.js` / `.ts` 文件，存在 `defineStore('useXxxStore', { state, actions, getters })` 调用
- **THEN** 生成 L2 级别的 store 节点（类型 `pinia-store`，节点名 = store id）
- **AND** 每个 action 函数生成 L3 节点（类型 `pinia-action`），`parentName` = store 名
- **AND** 每个 getter 生成 L3 节点（类型 `pinia-getter`）
- **AND** state 属性生成 L3 节点（类型 `pinia-state`）
- **AND** store 节点与文件节点建立 contains 边
- **AND** action/getter/state 节点与 store 节点建立 contains 边

#### Scenario: Setup API store 解析
- **WHEN** 解析 `.js` / `.ts` 文件，存在 `defineStore('useXxxStore', () => { ... })` 调用（第二个参数为函数）
- **THEN** 生成 L2 级别的 store 节点（类型 `pinia-store`）
- **AND** 从返回对象中识别 actions（函数类型）、state（ref/reactive 包装的响应式数据）
- **AND** 生成相应的 L3 节点，属性与 Options API 一致

#### Scenario: 组件调用 Pinia action 建边
- **WHEN** Vue 组件或 TS 文件中 `import { useXxxStore } from '@/stores/xxx'` 并调用 `xxxStore.someAction()`
- **THEN** 组件节点与对应的 `pinia-action` 节点建立 `calls` 边
- **AND** 边权重根据调用频次或上下文重要性设置（默认 0.6）

#### Scenario: 非 store 文件不生成 pinia 节点
- **WHEN** 解析普通 `.ts` / `.js` 工具函数文件
- **THEN** 不生成 pinia-store / pinia-action 节点
- **AND** 仅按原有规则提取函数/常量等 L3 节点

### Requirement: 函数节点上下文属性
所有 L3 函数节点（普通函数、组件方法、Pinia action）SHALL 携带 `filePath` 和 `parentName` 属性，用于搜索结果去歧义。`parentName` 为该函数所属的上层容器名（组件名、类名、store 名或模块文件名）。

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
- **THEN** 语义映射回填阶段对每个 C 层能力节点检索相似 L1/L2 节点
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
系统 SHALL 通过多源证据融合自动建立业务能力（C 层）与模块/文件/代码元素（L1/L2/L3）之间的 `business_map` 关联边，无需手动标注。证据来源 SHALL 包括：文档提取（doc-extract）、语义匹配（semantic）、Git 历史追溯（git-history）、命名匹配（name-match）；AI 校准（ai-refine）为可选增强（首版不实现）。同一目标被多源命中时，系统 SHALL 采用 noisy-OR 公式聚合权重：`finalWeight = 1 − ∏(1 − baseWeightᵢ)`，上限 0.95。

#### Scenario: 文档提取证据
- **WHEN** 能力 spec（Purpose / Requirements 章节）中抽取到模块名且该模块存在于图谱
- **THEN** 生成 `source: 'doc-extract'` 证据，baseWeight 0.85
- **AND** 参与该能力的 noisy-OR 权重聚合

#### Scenario: 语义匹配证据
- **WHEN** 向量索引存在且能力节点向量与某 L1/L2 节点向量的余弦相似度 ≥ 语义映射阈值
- **THEN** 生成 `source: 'semantic'` 证据，baseWeight 由相似度线性映射（上限 0.7）
- **AND** 每个能力取相似度 Top-K（默认 5）个候选目标
- **AND** 仅对 L1 模块节点与 L2 文件节点生成语义证据（不对 L3 元素逐一生成，控制规模）

#### Scenario: Git 历史追溯证据
- **WHEN** 项目为 Git 仓库且 `mapping.gitHistory` 为 true
- **THEN** 系统按能力名与抽取关键词调用 `git log` 检索匹配 commit
- **AND** 统计这些 commit 修改的文件频次
- **AND** 对频次 ≥ `mapping.gitMinFreq`（默认 2）的文件节点生成 `source: 'git-history'` 证据，baseWeight 由频次归一化映射（上限 0.7）

#### Scenario: 命名匹配证据
- **WHEN** 能力名（含中文）与目标节点名经中英文词典（≥30 词条）或前缀/包含匹配命中
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

### Requirement: Schema 版本 3.0.0
图谱 schema 版本 SHALL 升级到 3.0.0，标识 C+L1/L2/L3 层级命名体系与能力层来源的破坏性变更。

#### Scenario: 旧版本图谱不兼容自动重建
- **WHEN** 执行 `wpw graph update` 且已有图谱 schema 版本 < 3.0.0
- **THEN** 系统自动降级为全量构建
- **AND** 输出降级提示信息，说明原因是层级架构变更为 C+L1/L2/L3

#### Scenario: 全新构建写入 3.0.0
- **WHEN** 执行 `wpw graph build` 或 `wpw graph rebuild`
- **THEN** meta.json 中 schemaVersion 字段写入 `3.0.0`

### Requirement: 四层节点模型重命名
图谱节点层级命名 SHALL 从 L1/L2/L3/L4 调整为 C/L1/L2/L3。原 L1（需求）改为 C 层（业务能力），原 L2/L3/L4 分别提升为 L1/L2/L3。

#### Scenario: 层级枚举值更新
- **WHEN** 查询节点层级类型
- **THEN** 合法的层级值为 `C | L1 | L2 | L3`
- **AND** 不再使用 `L4` 层级值

#### Scenario: 结构层级包含关系
- **WHEN** 构建 contain 边
- **THEN** 包含链为 L1 模块 ⊃ L2 文件 ⊃ L3 代码元素
- **AND** C 层与结构层之间为 business_map 边，不是 contain 边

#### Scenario: 统计输出适配新命名
- **WHEN** 执行 `wpw graph stat` 输出节点层级分布
- **THEN** 输出键为 C、L1、L2、L3
- **AND** C 层统计业务能力节点数，L1 统计模块节点数

### Requirement: C 层能力节点解析器
图谱构建 SHALL 包含 C 层能力节点解析器，从 wpw/specs/ 目录读取 OpenSpec 格式的能力规范并生成节点。

#### Scenario: 从 specs 目录解析能力节点
- **WHEN** 构建图谱且 wpw/specs/ 目录存在
- **THEN** 遍历 specs 下的每个子目录
- **AND** 每个包含 spec.md 的子目录生成一个 C 层能力节点
- **AND** 节点名 = 子目录名（kebab-case）
- **AND** description 从 spec 的 Purpose 章节提取

#### Scenario: 空 specs 目录正常构建
- **WHEN** wpw/specs/ 目录不存在或为空
- **THEN** C 层节点数为 0
- **AND** 图谱构建正常完成，无错误

### Requirement: 能力节点中文描述与结构化功能
C 层能力节点 SHALL 携带 `description` 属性存储能力描述，以及 `features` 数组存储从 spec 中结构化提取的功能条目。

#### Scenario: Purpose 作为描述
- **WHEN** 解析能力 spec
- **THEN** 节点 `attrs.description` 字段为 spec 的 Purpose 章节内容摘要
- **AND** 长度限制在合理范围内（约 200 字符）

#### Scenario: Requirements 结构化提取
- **WHEN** spec 包含 Requirements 章节
- **THEN** 节点 `attrs.features` 数组包含结构化功能条目
- **AND** 每个条目包含 id、name、priority、description 字段

### Requirement: 增量更新支持能力变更检测
`wpw graph update` SHALL 检测能力层面的变更（新增、修改、删除），并同步更新图谱中的 C 层能力节点及关联边。

#### Scenario: 检测到新增能力
- **WHEN** 执行 `wpw graph update` 且 wpw/specs/ 下有新增的能力 spec
- **THEN** 系统解析新能力，生成 C 层节点
- **AND** 建立该能力与模块/文件的 business_map 边

#### Scenario: 检测到能力修改
- **WHEN** 执行 `wpw graph update` 且某能力 spec 的内容有变更
- **THEN** 系统更新该能力节点的 description 和 features 属性
- **AND** 重建相关的 business_map 边

#### Scenario: 检测到能力删除
- **WHEN** 执行 `wpw graph update` 且某能力 spec 被删除
- **THEN** 系统移除对应的 C 层能力节点及其所有关联边

#### Scenario: 仅能力变更、无源码变更时也更新
- **WHEN** 执行 `wpw graph update` 且源码文件无变更，但能力 spec 有变更
- **THEN** 系统仍执行能力层面的更新
- **AND** 不返回 null（不再因"无文件变更"直接跳过）
