## Purpose

Pinia store 解析与索引能力。负责从 Vue 项目的 Pinia store 文件中提取 store 定义、actions、getters、state，并将其作为知识图谱节点纳入，同时建立与组件调用方的边关系。

## Requirements

### Requirement: Pinia store 文件识别
系统 SHALL 自动识别项目中的 Pinia store 文件。识别依据 SHALL 包括：文件路径匹配 `stores/` 或 `store/` 目录、文件内容包含 `defineStore` 调用。两种条件满足其一即可触发 Pinia 解析流程。

#### Scenario: stores 目录下的文件自动识别
- **WHEN** 文件位于 `src/stores/` 或 `src/store/` 目录下
- **THEN** 系统优先按 Pinia store 格式解析
- **AND** 若文件不包含 `defineStore`，退化为普通 JS/TS 解析

#### Scenario: 任意路径的 defineStore 识别
- **WHEN** 文件不在 stores 目录下，但内容包含 `defineStore(...)` 调用
- **THEN** 系统按 Pinia store 解析
- **AND** 生成 pinia-store 节点及其子节点

#### Scenario: 非 store 文件跳过 pinia 解析
- **WHEN** 文件既不在 store 目录下，也不含 `defineStore` 调用
- **THEN** 按普通 JS/TS 文件解析
- **AND** 不生成任何 pinia-* 类型节点

### Requirement: Options API 风格解析
对于 `defineStore(id, { state, getters, actions })` 形式的 Options API store，系统 SHALL 正确解析 state 属性、getters 函数、actions 函数，并分别生成对应类型的 L4 节点。

#### Scenario: state 属性解析
- **WHEN** store 的 state 函数返回对象 `{ user: null, token: '', permissions: [] }`
- **THEN** 为每个返回属性生成 `pinia-state` 类型的 L4 节点
- **AND** 节点名 = 属性名，`parentName` = store id

#### Scenario: actions 函数解析
- **WHEN** store 的 actions 对象包含 `login()`、`logout()`、`register(userData)` 等方法
- **THEN** 为每个方法生成 `pinia-action` 类型的 L4 节点
- **AND** 节点名 = 方法名，`parentName` = store id
- **AND** 节点携带 `filePath` 属性

#### Scenario: getters 解析
- **WHEN** store 的 getters 对象包含 `isLoggedIn`、`userName` 等计算属性
- **THEN** 为每个 getter 生成 `pinia-getter` 类型的 L4 节点
- **AND** 节点名 = getter 名，`parentName` = store id

### Requirement: Setup API 风格解析
对于 `defineStore(id, () => { ... return { ... } })` 形式的 Setup API store，系统 SHALL 从返回对象中识别 actions（函数）和 state（响应式数据），并生成对应节点。

#### Scenario: Setup store 返回对象解析
- **WHEN** Setup 函数返回 `{ user, token, login, logout, isLoggedIn }`
- **THEN** 函数类型的返回值（login、logout）标记为 `pinia-action`
- **AND** computed 包装的返回值（isLoggedIn）标记为 `pinia-getter`
- **AND** ref/reactive 包装的返回值（user、token）标记为 `pinia-state`
- **AND** 无法确定类型的返回值默认标记为 `pinia-state`

### Requirement: store 节点层级与边关系
Pinia store SHALL 作为 L3 级别的模块类节点存在（与文件节点同级或略高于文件节点）。store 节点 SHALL 与其定义文件建立 `defined_in` 边；action/getter/state 节点 SHALL 与 store 节点建立 `contains` 边。

#### Scenario: store 节点层级
- **WHEN** 图谱构建完成
- **THEN** pinia-store 节点层级为 L3，类型为 `pinia-store`
- **AND** 与文件节点（L3，type=file）层级相同但类型不同

#### Scenario: store 与文件的关系
- **WHEN** store 定义在 `src/stores/auth.js` 文件中
- **THEN** pinia-store 节点与 file 节点之间建立 `defined_in` 边
- **AND** 边方向：store → file

#### Scenario: action 与 store 的关系
- **WHEN** action `login` 属于 `useAuthStore`
- **THEN** `pinia-action:login` 与 `pinia-store:useAuthStore` 之间存在 `contained_in` 边
- **AND** 边方向：action → store

### Requirement: 组件调用 Pinia 建边
系统 SHALL 识别组件或业务代码中对 Pinia store actions 的调用，并在调用方节点与 action 节点之间建立 `calls` 边。

#### Scenario: 组合式 API 调用识别
- **WHEN** 组件中 `const authStore = useAuthStore()` 并调用 `authStore.login(form)`
- **THEN** 组件节点与 `pinia-action:login` 之间建立 `calls` 边
- **AND** 边权重默认 0.6

#### Scenario: mapActions 调用识别
- **WHEN** 组件使用 `mapActions('auth', ['login', 'logout'])`
- **THEN** 组件节点与对应 action 节点各建立一条 `calls` 边

#### Scenario: 跨 store 调用
- **WHEN** 一个 store 中 import 并调用另一个 store 的 action
- **THEN** 两个 action 节点之间建立 `calls` 边
- **AND** 边方向：调用方 action → 被调用方 action

### Requirement: 向量索引覆盖
Pinia store 相关节点（store 本身、actions、getters、state）SHALL 参与向量索引构建。action 节点的向量文本 SHALL 包含 action 名 + store 名 + JSDoc 注释（如有），以支持中文语义检索。

#### Scenario: Pinia 节点参与向量构建
- **WHEN** 执行 `wpw graph build` 且 embedding 开启
- **THEN** pinia-store、pinia-action、pinia-getter、pinia-state 节点均生成向量
- **AND** 向量索引 mapping 中包含这些节点的 id

#### Scenario: 中文语义可命中 Pinia action
- **WHEN** 搜索"用户登录"，存在 `pinia-action:login` 且其 JSDoc 包含"用户登录认证"
- **THEN** 该 action 节点出现在搜索结果中
- **AND** 排名不低于 Top 10
