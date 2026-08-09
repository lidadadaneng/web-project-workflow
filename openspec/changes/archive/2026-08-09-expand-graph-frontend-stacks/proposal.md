## Why

当前图谱的源码解析只覆盖了 Vue + Pinia 生态的深度语义识别，对 Vuex、Redux、微信小程序、uni-app 等广泛使用的前端技术栈要么只有语言级解析、要么完全不识别，导致这些项目的业务图谱缺少状态管理语义和页面路由关系，上下文生成质量下降。需要扩展图谱的前端技术栈覆盖范围，让更多类型的前端项目能产出高质量的结构化知识图谱。

## What Changes

- 新增 Vuex 状态管理解析器，识别 store / state / mutation / action / getter 节点
- 新增 Redux / Redux Toolkit 状态管理解析器，识别 store / slice / reducer / action / selector 节点
- 新增微信小程序解析支持：.wxml 模板解析 + Page/Component/App 语义识别 + 页面路由关系
- 新增 uni-app 解析支持：基于 Vue 解析器扩展，识别 pages.json 路由、uni.* API、生命周期等
- 在 graph-query 中支持按状态管理类型、页面类型等新节点类型过滤
- 语义检索和上下文生成自动纳入新节点类型

## Capabilities

### New Capabilities

- `vuex-indexing`: Vuex 状态管理的图谱索引能力，识别 Vuex store 定义并生成状态管理语义节点
- `redux-indexing`: Redux / Redux Toolkit 状态管理的图谱索引能力，识别 slice / reducer / action / selector 等语义节点
- `miniprogram-indexing`: 微信小程序的图谱索引能力，解析 WXML 模板、页面/组件语义、app.json 路由关系
- `uniapp-indexing`: uni-app 的图谱索引能力，在 Vue 解析基础上识别 uni-app 特有路由、API、生命周期

### Modified Capabilities

- `graph-build`: 构建流程新增 Vuex/Redux/小程序/uni-app 解析步骤，source-parser 分发逻辑扩展，支持的语言/框架配置项扩展
- `graph-query`: 新增节点类型（vuex-* / redux-* / mp-page / mp-component / uniapp-*）的查询过滤支持
- `semantic-search`: 新增节点类型纳入语义检索范围，向量索引包含新节点类型

## Impact

- `src/graph/parsers/`：新增 4 个解析器（vuex-parser、redux-parser、miniprogram-parser、uniapp-parser）
- `src/graph/parsers/source-parser.ts`：扩展文件分发逻辑，新增 .wxml 等文件类型支持
- `src/graph/types.ts`：新增 10+ 个节点类型常量和类型定义
- `src/graph/config.ts`：默认语言/框架配置扩展，新增状态管理和小程序相关配置项
- `src/graph/builders/graph-builder.ts`：构建流程中新增各解析器的调用
- `src/graph/builders/edge-builder.ts`：新增路由边（page-navigate）、组件引用边等关系
- 测试文件：新增对应解析器的单元测试
