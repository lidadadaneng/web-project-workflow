## ADDED Requirements

### Requirement: Vuex store 索引
图谱构建 SHALL 支持解析 Vuex store 文件（含模块化 store），将 store 及其 state/mutations/actions/getters 作为节点纳入图谱，并建立与组件调用方的边关系。

#### Scenario: Vuex 根 store 解析
- **WHEN** 解析 `.js` / `.ts` 文件，存在 `new Vuex.Store({ modules, state, mutations, actions, getters })` 调用
- **THEN** 生成 L2 级别的 store 节点（类型 `vuex-store`）
- **AND** 每个子模块也生成独立的 `vuex-store` 节点
- **AND** state 属性生成 `vuex-state` 类型的 L3 节点
- **AND** mutation 函数生成 `vuex-mutation` 类型的 L3 节点
- **AND** action 函数生成 `vuex-action` 类型的 L3 节点
- **AND** getter 生成 `vuex-getter` 类型的 L3 节点
- **AND** store 节点与文件节点建立 contain 边
- **AND** 子元素节点与 store 节点建立 contain 边

#### Scenario: 模块化 store 文件解析
- **WHEN** 解析 `src/store/modules/user.js`，文件导出 `{ state, mutations, actions, getters, namespaced }`
- **THEN** 生成 `vuex-store` 节点，节点名 = 模块名
- **AND** 子元素节点类型同上
- **AND** `namespaced: true` 时节点携带命名空间标记

#### Scenario: 组件调用 Vuex 建边
- **WHEN** Vue 组件中通过 `this.$store.dispatch('user/login')` 或 `mapActions` 调用 Vuex action
- **THEN** 组件节点与对应的 `vuex-action` 节点建立 `call` 边
- **AND** `commit` 调用与 `vuex-mutation` 节点建立 `call` 边

#### Scenario: 非 Vuex 文件不生成 vuex 节点
- **WHEN** 解析普通 `.js` / `.ts` 工具函数文件
- **THEN** 不生成 vuex-* 类型节点
- **AND** 仅按原有规则提取函数/常量等 L3 节点

### Requirement: Redux / Redux Toolkit 索引
图谱构建 SHALL 支持解析 Redux 及 Redux Toolkit 代码，识别 store、slice、reducer、action、selector，并作为节点纳入图谱。

#### Scenario: createSlice 解析
- **WHEN** 解析 `.ts` / `.js` 文件，存在 `createSlice({ name, initialState, reducers, extraReducers })` 调用
- **THEN** 生成 L2 级别的 `redux-slice` 节点（节点名 = slice name）
- **AND** reducer 函数生成 `redux-reducer` 类型的 L3 节点
- **AND** 自动生成的 action 生成 `redux-action` 类型的 L3 节点
- **AND** initialState 顶层属性生成 `redux-state` 类型的 L3 节点

#### Scenario: createAction / createReducer 解析
- **WHEN** 文件中存在 `createAction('type')` 或 `createReducer(initialState, builder => {...})`
- **THEN** 生成对应的 `redux-action` / `redux-reducer` 节点

#### Scenario: selector 解析
- **WHEN** 文件中存在 `createSelector(...)` 或命名以 `select` 开头且参数含 state 的函数
- **THEN** 生成 `redux-selector` 类型的 L3 节点

#### Scenario: 组件使用 Redux 建边
- **WHEN** React 组件中使用 `useSelector(selectXxx)` 或 `useDispatch()` 后 dispatch action
- **THEN** 组件节点与对应的 `redux-selector` / `redux-action` 节点建立 `call` 边

### Requirement: 微信小程序解析支持
图谱构建 SHALL 支持解析微信小程序项目的 WXML、JS、JSON 文件，生成页面、组件、App 等节点，并建立路由跳转、组件引用等边关系。

#### Scenario: 小程序项目自动识别
- **WHEN** 项目根目录存在 `app.js` + `app.json` + `app.wxss`，且 `app.json` 含 `pages` 字段
- **THEN** 系统自动启用小程序解析流程
- **AND** `project.config.json` 的 `miniprogramRoot` 被正确识别

#### Scenario: App 与页面节点生成
- **WHEN** 解析小程序项目
- **THEN** 生成 1 个 `mp-app` 类型的 L1 节点
- **AND** 根据 `app.json` 的 `pages` 生成 N 个 `mp-page` 类型的 L2 节点
- **AND** 页面 JS 中的 data/methods/lifecycle 生成对应的 L3 节点

#### Scenario: 自定义组件解析
- **WHEN** 小程序项目中存在含 `Component({...})` 的 JS 文件 + 对应 `.json` 中 `component: true`
- **THEN** 生成 `mp-component` 类型的 L2 节点
- **AND** properties / methods / lifetimes 生成对应的 L3 节点

#### Scenario: WXML 模板解析
- **WHEN** 解析 `.wxml` 文件
- **THEN** 识别自定义组件引用，建立 `use-component` 边
- **AND** 识别事件绑定（bindtap 等），建立 `bind-event` 边
- **AND** 识别数据绑定（{{ }}），建立 `bind-data` 边

#### Scenario: 路由跳转边
- **WHEN** 代码中调用 `wx.navigateTo` / `wx.redirectTo` / `wx.switchTab` / `wx.reLaunch`
- **THEN** 在源页面与目标页面之间建立 `navigate` 边
- **AND** 边属性包含跳转方式（method）

### Requirement: uni-app 解析支持
图谱构建 SHALL 在 Vue 解析基础上扩展支持 uni-app 项目，识别 `pages.json` 路由、uni.* API、生命周期、条件编译。

#### Scenario: uni-app 项目自动识别
- **WHEN** 项目存在 `pages.json` + `manifest.json` + `App.vue`，或 package.json 含 `@dcloudio/uni-*` 依赖
- **THEN** 系统自动启用 uni-app 解析扩展
- **AND** 在 Vue 解析结果基础上叠加 uni-app 语义

#### Scenario: pages.json 路由解析
- **WHEN** 解析 `pages.json`
- **THEN** 为每个页面生成 `uni-page` 类型的 L2 节点
- **AND** 页面标题（navigationBarTitleText）纳入节点描述
- **AND** 分包页面标记 `subPackage` 属性
- **AND** TabBar 页面之间建立 `tab-switch` 边

#### Scenario: uni.* API 调用识别
- **WHEN** 代码中调用 `uni.navigateTo` / `uni.request` / `uni.setStorageSync` 等
- **THEN** 路由 API 调用触发 `navigate` 边生成
- **AND** 网络 API 调用标记请求 URL 和 method
- **AND** 存储 API 调用标记使用的 storage key

#### Scenario: 条件编译识别
- **WHEN** 代码中含 `#ifdef MP-WEIXIN` / `#ifdef H5` 等条件编译块
- **THEN** 块内定义的函数/组件标记 `platform` 属性
- **AND** 可按平台维度过滤查询

### Requirement: 扩展的默认语言/框架配置
图谱构建的默认配置 SHALL 扩展支持的语言和框架选项，用户可在 `graph.build.languages` 中配置是否启用各扩展解析器。

#### Scenario: 状态管理解析器可配置
- **WHEN** 配置 `graph.build.stateManagers: ['pinia', 'vuex', 'redux']`
- **THEN** 构建时仅启用配置中列出的状态管理解析器
- **AND** 默认值为 `['pinia']`（向后兼容）

#### Scenario: 小程序解析器可配置
- **WHEN** 配置 `graph.build.frameworks: ['miniprogram', 'uniapp']`
- **THEN** 构建时启用对应框架的解析扩展
- **AND** 默认值为 `[]`（即自动嗅探）

#### Scenario: 自动嗅探模式
- **WHEN** 未显式配置状态管理和框架
- **THEN** 系统自动嗅探项目类型并启用对应解析器
- **AND** 嗅探结果在构建输出中显示
