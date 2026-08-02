## MODIFIED Requirements

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

## ADDED Requirements

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
