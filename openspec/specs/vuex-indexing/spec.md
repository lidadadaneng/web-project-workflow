# vuex-indexing Specification

## Purpose

Vuex 状态管理的图谱索引能力。负责从 Vue 2 项目的 Vuex store 文件中提取 store 模块定义、state、mutations、actions、getters，并作为知识图谱节点纳入，建立与组件调用方的边关系。

## Requirements

### Requirement: Vuex store 文件识别
系统 SHALL 自动识别项目中的 Vuex store 文件。识别依据 SHALL 包括：文件路径匹配 `store/` 或 `stores/` 目录、文件内容包含 `new Vuex.Store(...)` 或 `Vuex.Store` 或模块化导出（导出对象含 state/mutations/actions/getters）。

#### Scenario: store 目录下的文件自动识别
- **WHEN** 文件位于 `src/store/` 或 `src/stores/` 目录下，且导出含 state/mutations/actions/getters 的对象
- **THEN** 系统按 Vuex store 格式解析
- **AND** 若文件不含 Vuex 特征，退化为普通 JS/TS 解析

#### Scenario: 根 store 文件识别
- **WHEN** 文件包含 `new Vuex.Store({ ... })` 实例化调用
- **THEN** 系统按 Vuex 根 store 解析
- **AND** 识别 modules 字段中的子模块

#### Scenario: 非 store 文件跳过 vuex 解析
- **WHEN** 文件既不在 store 目录下，也不含 Vuex 特征
- **THEN** 按普通 JS/TS 文件解析
- **AND** 不生成任何 vuex-* 类型节点

### Requirement: Vuex 模块化解析
系统 SHALL 支持 Vuex 模块化结构，根 store 的 `modules` 字段下的每个子模块 SHALL 被解析为独立的 vuex-store 节点，支持嵌套模块。

#### Scenario: 根 store 模块识别
- **WHEN** 根 store 配置含 `modules: { user, cart, app }`
- **THEN** 为每个子模块生成一个 `vuex-store` 类型的 L2 节点
- **AND** 节点名 = 模块名（如 `user`、`cart`）
- **AND** 根 store 本身也生成一个 vuex-store 节点（名 root 或从文件名推断）

#### Scenario: 嵌套模块解析
- **WHEN** 模块 A 的 modules 中包含模块 B
- **THEN** 模块 B 作为独立 vuex-store 节点存在
- **AND** 节点名带命名空间前缀（如 `a/b`）或通过 parentName 表达嵌套关系

#### Scenario: 命名空间识别
- **WHEN** 模块配置含 `namespaced: true`
- **THEN** 该 store 节点的 `namespaced` 属性为 true
- **AND** action/mutation/getter 名带命名空间前缀（如 `user/login`）

### Requirement: state / mutations / actions / getters 解析
系统 SHALL 从 Vuex store 配置对象中解析 state 属性、mutations 函数、actions 函数、getters 计算属性，并分别生成对应类型的 L3 节点。

#### Scenario: state 属性解析
- **WHEN** store 的 state 为对象或返回对象的函数，含 `{ user: null, token: '' }`
- **THEN** 为每个属性生成 `vuex-state` 类型的 L3 节点
- **AND** 节点名 = 属性名，`parentName` = store 名

#### Scenario: mutations 解析
- **WHEN** store 的 mutations 对象含 `SET_USER(state, user)`、`SET_TOKEN(state, token)`
- **THEN** 为每个 mutation 生成 `vuex-mutation` 类型的 L3 节点
- **AND** 节点名 = mutation 名，`parentName` = store 名
- **AND** 节点携带 `filePath` 属性和签名信息

#### Scenario: actions 解析
- **WHEN** store 的 actions 对象含 `login({ commit }, payload)`、`logout({ commit })`
- **THEN** 为每个 action 生成 `vuex-action` 类型的 L3 节点
- **AND** 节点名 = action 名，`parentName` = store 名
- **AND** 节点携带 `filePath` 属性和签名信息

#### Scenario: getters 解析
- **WHEN** store 的 getters 对象含 `isLoggedIn: state => !!state.user`
- **THEN** 为每个 getter 生成 `vuex-getter` 类型的 L3 节点
- **AND** 节点名 = getter 名，`parentName` = store 名

### Requirement: Vuex 节点层级与边关系
Vuex store SHALL 作为 L2 级别的节点存在（与文件节点同级）。store 节点与文件节点建立 `contain` 边（文件 ⊃ store）；state/mutation/action/getter 节点与 store 节点建立 `contain` 边（store ⊃ 元素）。

#### Scenario: store 节点层级
- **WHEN** 图谱构建完成
- **THEN** vuex-store 节点层级为 L2，类型为 `vuex-store`
- **AND** 与 file 节点（L2，type=file）层级相同

#### Scenario: store 与文件的关系
- **WHEN** store 定义在 `src/store/user.js` 文件中
- **THEN** file 节点与 vuex-store 节点之间建立 `contain` 边
- **AND** 边方向：file → vuex-store

#### Scenario: 元素与 store 的关系
- **WHEN** action `login` 属于 `user` store
- **THEN** `vuex-action:login` 与 `vuex-store:user` 之间存在 `contain` 边
- **AND** 边方向：vuex-store → vuex-action

### Requirement: 组件调用 Vuex 建边
系统 SHALL 识别组件或业务代码中对 Vuex actions/mutations 的调用，并在调用方节点与对应 action/mutation 节点之间建立 `call` 边。

#### Scenario: dispatch 调用识别
- **WHEN** 组件中调用 `this.$store.dispatch('user/login', payload)` 或 `useStore().dispatch('user/login')`
- **THEN** 组件节点与 `vuex-action:user/login` 之间建立 `call` 边
- **AND** 边权重默认 0.6

#### Scenario: commit 调用识别
- **WHEN** 组件中调用 `this.$store.commit('user/SET_USER', user)`
- **THEN** 组件节点与 `vuex-mutation:user/SET_USER` 之间建立 `call` 边

#### Scenario: mapActions / mapMutations 辅助函数识别
- **WHEN** 组件使用 `mapActions('user', ['login', 'logout'])` 或 `mapMutations('user', ['SET_USER'])`
- **THEN** 组件节点与对应 action/mutation 节点各建立一条 `call` 边

### Requirement: 向量索引覆盖
Vuex 相关节点（store、state、mutation、action、getter）SHALL 参与向量索引构建。action/mutation 节点的向量文本 SHALL 包含节点名 + store 名 + 注释（如有）。

#### Scenario: Vuex 节点参与向量构建
- **WHEN** 执行 `wpw graph build` 且 embedding 开启
- **THEN** vuex-store、vuex-state、vuex-mutation、vuex-action、vuex-getter 节点均生成向量
- **AND** 向量索引 mapping 中包含这些节点的 id

#### Scenario: 中文语义可命中 Vuex action
- **WHEN** 搜索"用户登录"，存在 `vuex-action:user/login` 且其注释包含"用户登录"
- **THEN** 该 action 节点出现在搜索结果中
