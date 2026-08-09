## Purpose

uni-app 的图谱索引能力。在 Vue 解析基础上扩展，识别 uni-app 项目的 `pages.json` 路由配置、uni.* API 调用、平台特定生命周期、条件编译代码块，建立页面路由关系和跨平台代码映射。

## ADDED Requirements

### Requirement: uni-app 项目识别
系统 SHALL 自动识别 uni-app 项目。识别依据 SHALL 包括：项目根目录存在 `pages.json` + `manifest.json` + `App.vue` 三件套，或 `package.json` 中含 `@dcloudio/uni-` 相关依赖。

#### Scenario: 标准 uni-app 项目识别
- **WHEN** 项目同时存在 `pages.json`、`manifest.json`、`App.vue`，且 `pages.json` 含 `pages` 数组
- **THEN** 系统判定为 uni-app 项目
- **AND** 启用 uni-app 专用解析扩展

#### Scenario: package.json 依赖识别
- **WHEN** `package.json` 的 dependencies 或 devDependencies 含 `@dcloudio/uni-app` 或 `@dcloudio/uni-cli-*`
- **THEN** 系统判定为 uni-app 项目
- **AND** 启用 uni-app 专用解析扩展

#### Scenario: 非 uni-app 项目跳过
- **WHEN** 项目不满足 uni-app 识别条件
- **THEN** 不启用 uni-app 解析扩展
- **AND** 按普通 Vue 项目解析

### Requirement: pages.json 路由解析
系统 SHALL 解析 `pages.json`，提取页面路由、TabBar、分包配置，生成 `uni-page` 类型的 L2 节点和路由边关系。

#### Scenario: 页面路由节点生成
- **WHEN** `pages.json` 的 `pages` 数组含 `{ path: 'pages/index/index', style: { navigationBarTitleText: '首页' } }`
- **THEN** 为每个页面生成 `uni-page` 类型的 L2 节点
- **AND** 节点名 = 页面路径
- **AND** 页面标题（navigationBarTitleText）作为节点 description 的一部分
- **AND** 页面节点与对应的 .vue 文件节点建立关联

#### Scenario: TabBar 识别
- **WHEN** `pages.json` 含 `tabBar: { list: [{ pagePath, text, iconPath }] }`
- **THEN** 每个 tabBar 页面标记 `isTabBar: true` 属性
- **AND** tabBar 页面之间建立 `tab-switch` 边（互相可达）

#### Scenario: 分包页面识别
- **WHEN** `pages.json` 含 `subPackages: [{ root: 'packageA', pages: [...] }]`
- **THEN** 分包内的页面节点携带 `subPackage: 'packageA'` 属性
- **AND** 可按分包过滤查询页面

#### Scenario: 全局配置解析
- **WHEN** `pages.json` 含 `globalStyle` 配置
- **THEN** 全局配置信息挂在 `uni-app` 根节点上
- **AND** 不作为独立节点

### Requirement: uni.* API 调用识别
系统 SHALL 识别代码中对 `uni.*` API 的调用，将调用方节点与对应的 API 类别建立关联。API 类别包括：路由、网络、存储、界面、设备等。

#### Scenario: 路由 API 调用识别
- **WHEN** 组件或业务代码中调用 `uni.navigateTo({ url: '/pages/detail/detail' })`
- **THEN** 在调用方页面/组件与目标页面之间建立 `navigate` 边
- **AND** 边方向：源 → 目标，边属性包含跳转方式

#### Scenario: 网络 API 调用识别
- **WHEN** 代码中调用 `uni.request({ url: '/api/user', method: 'GET' })`
- **THEN** 调用方节点标记 `usesNetworkApi: true`
- **AND** 提取请求 URL 和 method 作为节点属性

#### Scenario: 存储 API 调用识别
- **WHEN** 代码中调用 `uni.setStorageSync('token', token)` 或 `uni.getStorageSync('userInfo')`
- **THEN** 调用方节点标记使用的存储 key 列表

### Requirement: 生命周期识别
系统 SHALL 识别 uni-app 特有的页面生命周期（onLoad、onShow、onReady、onHide、onUnload、onPullDownRefresh、onReachBottom 等）和应用生命周期（onLaunch、onShow、onHide）。

#### Scenario: 页面生命周期函数识别
- **WHEN** 页面 Vue 文件的 `onLoad`、`onShow`、`onPullDownRefresh` 等方法定义在 `<script setup>` 或 options API 中
- **THEN** 这些方法的 L3 节点标记 `isUniLifecycle: true`
- **AND** `lifecycleType` 属性标识具体生命周期类型

#### Scenario: App.vue 应用生命周期识别
- **WHEN** `App.vue` 中定义了 `onLaunch`、`onShow`、`onHide`
- **THEN** 这些函数标记为应用级生命周期
- **AND** 归属到 uni-app 根节点

### Requirement: 条件编译识别
系统 SHALL 识别 uni-app 的条件编译代码块（`#ifdef` / `#ifndef` / `#endif`），标记代码所属的平台（H5、MP-WEIXIN、MP-ALIPAY、APP-PLUS 等）。

#### Scenario: 条件编译块识别
- **WHEN** 代码中含 `#ifdef MP-WEIXIN` ... `#endif` 块
- **THEN** 块内定义的函数/组件标记 `platform: 'mp-weixin'` 属性
- **AND** 跨平台通用代码不标记 platform

#### Scenario: 多平台代码区分
- **WHEN** 同一文件中有多个 `#ifdef` 块分别对应不同平台
- **THEN** 每个平台的代码元素分别标记对应平台
- **AND** 可按平台过滤查询节点

### Requirement: 组件与页面关系
系统 SHALL 识别 uni-app 页面中引用的自定义组件，建立页面与组件的引用关系。

#### Scenario: 组件引用识别
- **WHEN** 页面 Vue 文件中 import 并使用了自定义组件 `<my-card />`
- **THEN** 在页面节点与组件节点之间建立 `use-component` 边
- **AND** 复用 Vue 解析器的组件识别能力

### Requirement: 向量索引覆盖
uni-app 相关节点（page、组件、API 关联的方法、生命周期方法）SHALL 参与向量索引构建。页面节点的向量文本 SHALL 包含页面路径、页面标题、页面描述。

#### Scenario: uni-app 节点参与向量构建
- **WHEN** 执行 `wpw graph build` 且 embedding 开启
- **THEN** uni-page 节点和其他 uni-app 相关节点均生成向量

#### Scenario: 中文语义可命中页面
- **WHEN** 搜索"商品详情页"，存在页面节点且其标题或描述包含"商品详情"
- **THEN** 该页面节点出现在搜索结果中
