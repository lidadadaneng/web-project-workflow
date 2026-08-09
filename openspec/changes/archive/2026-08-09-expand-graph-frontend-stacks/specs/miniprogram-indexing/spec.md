## Purpose

微信小程序的图谱索引能力。负责解析微信小程序项目的 WXML 模板、WXSS 样式、JS 逻辑层、JSON 配置，识别页面、组件、App 实例、路由关系，并建立组件引用和页面跳转等边关系。

## ADDED Requirements

### Requirement: 微信小程序项目识别
系统 SHALL 自动识别微信小程序项目。识别依据 SHALL 包括：项目根目录存在 `app.js` + `app.json` + `app.wxss` 三件套，或 `project.config.json` 中含 `miniprogramRoot` 配置。

#### Scenario: 标准小程序项目识别
- **WHEN** 项目根目录同时存在 `app.js`、`app.json`、`app.wxss`，且 `app.json` 含 `pages` 字段
- **THEN** 系统判定为微信小程序项目
- **AND** 启用小程序专用解析流程

#### Scenario: project.config.json 识别
- **WHEN** 项目根目录存在 `project.config.json` 且含 `miniprogramRoot` 字段
- **THEN** 系统根据 miniprogramRoot 定位小程序源码根目录
- **AND** 启用小程序专用解析流程

#### Scenario: 非小程序项目跳过
- **WHEN** 项目不满足小程序识别条件
- **THEN** 不启用小程序解析流程
- **AND** .wxml / .wxss 文件不被解析

### Requirement: App 实例解析
系统 SHALL 解析小程序的 `app.js` 和 `app.json`，生成 `mp-app` 类型的 L1 节点，提取全局配置、生命周期、全局数据。

#### Scenario: app.json 全局配置解析
- **WHEN** 解析 `app.json`
- **THEN** 生成 L1 级别的 `mp-app` 节点
- **AND** 从 `pages` 字段提取页面路由列表
- **AND** 从 `window` 字段提取全局窗口配置
- **AND** 从 `tabBar` 字段提取 tabBar 配置

#### Scenario: app.js 生命周期解析
- **WHEN** 解析 `app.js`，含 `App({ onLaunch, onShow, onHide, globalData })`
- **THEN** 识别 App 生命周期函数（onLaunch、onShow、onHide、onError）
- **AND** 每个生命周期生成 L3 节点，`parentName` = App
- **AND** 识别 globalData 中的全局数据属性

### Requirement: 页面节点解析
系统 SHALL 根据 `app.json` 的 `pages` 字段和页面文件，生成 `mp-page` 类型的 L2 节点，并解析页面的 JS 逻辑、WXML 模板、JSON 配置、WXSS 样式。

#### Scenario: 从 pages 配置生成页面节点
- **WHEN** `app.json` 的 `pages` 数组含 `["pages/index/index", "pages/detail/detail"]`
- **THEN** 为每个页面路径生成一个 `mp-page` 类型的 L2 节点
- **AND** 节点名 = 页面路径（如 `pages/index/index`）
- **AND** 页面节点与四个文件（.js/.json/.wxml/.wxss）建立关联

#### Scenario: 页面生命周期解析
- **WHEN** 页面 JS 文件含 `Page({ onLoad, onShow, onReady, onHide, onUnload })`
- **THEN** 每个生命周期函数生成 L3 节点，类型为 `mp-lifecycle`
- **AND** `parentName` = 页面名
- **AND** 节点携带 `filePath` 和签名信息

#### Scenario: 页面 data 解析
- **WHEN** 页面 JS 的 data 含 `{ list: [], loading: false }`
- **THEN** 每个 data 属性生成 `mp-data` 类型的 L3 节点
- **AND** `parentName` = 页面名

#### Scenario: 页面自定义方法解析
- **WHEN** 页面 JS 含 `onSubmit() { ... }`、`handleTap() { ... }` 等方法
- **THEN** 每个方法生成 `mp-method` 类型的 L3 节点
- **AND** `parentName` = 页面名

### Requirement: 自定义组件解析
系统 SHALL 识别小程序自定义组件（含 `Component({ ... })` 调用的 JS 文件 + .json 中 `component: true`），生成 `mp-component` 类型的 L2 节点。

#### Scenario: 组件文件识别
- **WHEN** 目录下含同名的 .js/.json/.wxml/.wxss 四个文件，且 .json 中 `"component": true`
- **THEN** 生成 `mp-component` 类型的 L2 节点
- **AND** 节点名 = 组件名（从目录或文件名推断）

#### Scenario: 组件 properties 解析
- **WHEN** 组件 JS 的 `properties` 含 `{ title: String, count: { type: Number, value: 0 } }`
- **THEN** 每个 property 生成 `mp-property` 类型的 L3 节点
- **AND** 节点携带类型信息和默认值（如有）

#### Scenario: 组件 methods 解析
- **WHEN** 组件 JS 的 `methods` 含方法定义
- **THEN** 每个方法生成 `mp-method` 类型的 L3 节点
- **AND** `parentName` = 组件名

#### Scenario: 组件生命周期解析
- **WHEN** 组件 JS 含 `lifetimes: { created, attached, detached }` 或 `pageLifetimes`
- **THEN** 每个生命周期生成 `mp-lifecycle` 类型的 L3 节点

### Requirement: WXML 模板解析
系统 SHALL 解析 WXML 模板文件，提取模板结构、组件引用、数据绑定、事件绑定，生成模板相关节点和边关系。

#### Scenario: 自定义组件引用识别
- **WHEN** WXML 中使用 `<my-component />` 且该组件在页面/组件的 json 配置中已声明
- **THEN** 在使用方（页面/组件）与被引用组件之间建立 `use-component` 边
- **AND** 边权重与使用频次正相关

#### Scenario: 内置组件识别
- **WHEN** WXML 中使用 `<view>`、`<text>`、`<button>`、`<input>` 等内置组件
- **THEN** 统计内置组件使用频次（不生成节点，作为页面/组件的属性）
- **AND** 页面/组件节点的 `attrs.builtinComponents` 包含使用的内置组件列表

#### Scenario: 事件绑定识别
- **WHEN** WXML 中含 `bindtap="handleTap"` 或 `bind:tap="handleTap"` 或 `catchtap="handleTap"`
- **THEN** 识别事件类型（tap）和处理函数名（handleTap）
- **AND** 在模板与对应的方法节点之间建立 `bind-event` 边

#### Scenario: 数据绑定识别
- **WHEN** WXML 中含 `{{ userInfo.name }}` 或 `{{ list.length }}`
- **THEN** 识别绑定的数据路径
- **AND** 在模板与对应的 data/property 节点之间建立 `bind-data` 边

### Requirement: 路由关系边
系统 SHALL 根据页面配置和代码中的跳转 API 调用，建立页面之间的 `navigate` 边关系。

#### Scenario: navigateTo 跳转识别
- **WHEN** 页面 JS 中调用 `wx.navigateTo({ url: '/pages/detail/detail?id=1' })`
- **THEN** 在当前页面节点与目标页面节点之间建立 `navigate` 边
- **AND** 边方向：源页面 → 目标页面
- **AND** 边权重根据调用次数计算

#### Scenario: redirectTo / switchTab / reLaunch 识别
- **WHEN** 代码中调用 `wx.redirectTo`、`wx.switchTab`、`wx.reLaunch`、`wx.navigateBack`
- **THEN** 同样建立 `navigate` 边
- **AND** 边的 `method` 属性标识跳转方式（navigateTo / redirectTo / switchTab 等）

#### Scenario: 组件内跳转识别
- **WHEN** 自定义组件中调用页面跳转 API
- **THEN** 通过组件所在页面推断源页面，建立 `navigate` 边

### Requirement: app.json 分包支持
系统 SHALL 支持解析微信小程序的分包配置（`subPackages` 字段），识别分包页面并归属到对应分包模块。

#### Scenario: 分包页面识别
- **WHEN** `app.json` 含 `subPackages: [{ root: 'packageA', pages: ['pages/a/a'] }]`
- **THEN** 分包内的页面节点携带 `subPackage` 属性
- **AND** 可按分包过滤查询页面

### Requirement: 向量索引覆盖
微信小程序相关节点（app、page、component、method、lifecycle、data、property）SHALL 参与向量索引构建。

#### Scenario: 小程序节点参与向量构建
- **WHEN** 执行 `wpw graph build` 且 embedding 开启
- **THEN** mp-app、mp-page、mp-component、mp-method、mp-lifecycle 等节点均生成向量

#### Scenario: 中文语义可命中页面
- **WHEN** 搜索"用户登录页"，存在页面节点且其注释或文件名包含登录相关语义
- **THEN** 该页面节点出现在搜索结果中
