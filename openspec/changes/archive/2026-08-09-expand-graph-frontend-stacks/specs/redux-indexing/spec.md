## Purpose

Redux / Redux Toolkit 状态管理的图谱索引能力。负责从 React/Next.js 等项目的 Redux 代码中提取 store、slice、reducer、action、selector 等语义节点，并建立与组件调用方的边关系。

## ADDED Requirements

### Requirement: Redux 文件识别
系统 SHALL 自动识别项目中的 Redux 相关文件。识别依据 SHALL 包括：文件路径匹配 `store/` / `stores/` / `redux/` / `slices/` 目录、文件内容包含 `configureStore` 或 `createSlice` 或 `createReducer` 或 `createAction` 调用。

#### Scenario: slices 目录自动识别
- **WHEN** 文件位于 `src/store/slices/` 或 `src/redux/features/` 目录下，且含 `createSlice(...)` 调用
- **THEN** 系统按 Redux slice 格式解析
- **AND** 若文件不含 Redux 特征，退化为普通 TS/JS 解析

#### Scenario: store 配置文件识别
- **WHEN** 文件包含 `configureStore({ ... })` 或 `createStore(...)` 调用
- **THEN** 系统识别为 Redux store 配置文件
- **AND** 从 reducer 字段中提取已注册的 slice 信息

#### Scenario: 非 Redux 文件跳过
- **WHEN** 文件不含 Redux 特征且不在相关目录
- **THEN** 按普通 TS/JS 文件解析
- **AND** 不生成任何 redux-* 类型节点

### Requirement: Redux Toolkit Slice 解析
系统 SHALL 支持解析 `createSlice` 定义的 slice，提取 name、reducers、extraReducers，并生成对应的 slice 节点和 reducer/action 节点。

#### Scenario: createSlice 基本解析
- **WHEN** 文件含 `createSlice({ name: 'user', initialState, reducers: { setUser, logout } })`
- **THEN** 生成 L2 级别的 `redux-slice` 节点（节点名 = slice name）
- **AND** reducers 对象中的每个函数生成 `redux-reducer` 类型的 L3 节点
- **AND** 同时生成对应的 `redux-action` 节点（action type = `${sliceName}/${reducerName}`）

#### Scenario: extraReducers 识别
- **WHEN** slice 的 extraReducers 中通过 builder.addCase 响应其他 slice 的 action
- **THEN** 识别响应的 action type
- **AND** 在当前 slice 的 reducer 与对应 action 之间建立关系（可选）

#### Scenario: initialState 属性识别
- **WHEN** slice 的 initialState 为对象 `{ user: null, loading: false }`
- **THEN** 为每个顶层属性生成 `redux-state` 类型的 L3 节点
- **AND** 节点名 = 属性名，`parentName` = slice 名

### Requirement: createAction / createReducer 原生 API 解析
系统 SHALL 支持解析 Redux Toolkit 的 `createAction` 和 `createReducer` 原生 API，生成对应的 action 和 reducer 节点。

#### Scenario: createAction 解析
- **WHEN** 文件含 `const increment = createAction('counter/increment')`
- **THEN** 生成 `redux-action` 类型的 L3 节点
- **AND** 节点名 = action type（`counter/increment`）

#### Scenario: createReducer 解析
- **WHEN** 文件含 `createReducer(initialState, builder => { builder.addCase(action, reducer) })`
- **THEN** 为每个 case 的处理函数生成 `redux-reducer` 节点
- **AND** 关联对应的 action 节点

### Requirement: Selector 解析
系统 SHALL 识别 Reselect 的 `createSelector` 和普通的 selector 函数，生成 `redux-selector` 类型的节点。

#### Scenario: createSelector 解析
- **WHEN** 文件含 `const selectUser = createSelector(state => state.user, user => user.data)`
- **THEN** 生成 `redux-selector` 类型的 L3 节点
- **AND** 节点名 = selector 名（`selectUser`）
- **AND** `parentName` = 所属 slice 名或文件名

#### Scenario: 简单 selector 函数识别
- **WHEN** 文件含 `const selectUser = state => state.user`（命名以 select 开头且参数为 state）
- **THEN** 生成 `redux-selector` 类型的 L3 节点

### Requirement: Redux 节点层级与边关系
Redux slice SHALL 作为 L2 级别的节点存在（与文件节点同级）。slice 节点与文件节点建立 `contain` 边；state/reducer/action/selector 节点与 slice 节点建立 `contain` 边。

#### Scenario: slice 节点层级
- **WHEN** 图谱构建完成
- **THEN** redux-slice 节点层级为 L2，类型为 `redux-slice`
- **AND** 与 file 节点层级相同

#### Scenario: 元素与 slice 的关系
- **WHEN** reducer `setUser` 属于 `user` slice
- **THEN** `redux-reducer:setUser` 与 `redux-slice:user` 之间存在 `contain` 边
- **AND** 边方向：redux-slice → redux-reducer

### Requirement: 组件与 Redux 调用建边
系统 SHALL 识别组件中对 Redux 的使用（useSelector、useDispatch、connect、mapStateToProps、mapDispatchToProps），在组件节点与对应的 selector/action 节点之间建立 `call` 边。

#### Scenario: useSelector 调用识别
- **WHEN** 组件中 `const user = useSelector(selectUser)`
- **THEN** 组件节点与 `redux-selector:selectUser` 之间建立 `call` 边

#### Scenario: useDispatch + action 调用识别
- **WHEN** 组件中 `dispatch(setUser(userData))` 且 setUser 来自某 slice
- **THEN** 组件节点与 `redux-action:user/setUser` 之间建立 `call` 边

#### Scenario: connect 高阶组件识别
- **WHEN** 组件使用 `connect(mapStateToProps, mapDispatchToProps)(Component)`
- **THEN** 从 mapStateToProps 中识别使用的 selector，建立 `call` 边
- **AND** 从 mapDispatchToProps 中识别 dispatch 的 action，建立 `call` 边

### Requirement: 向量索引覆盖
Redux 相关节点（slice、state、reducer、action、selector）SHALL 参与向量索引构建。

#### Scenario: Redux 节点参与向量构建
- **WHEN** 执行 `wpw graph build` 且 embedding 开启
- **THEN** redux-slice、redux-state、redux-reducer、redux-action、redux-selector 节点均生成向量

#### Scenario: 中文语义可命中 Redux
- **WHEN** 搜索"用户信息"，存在 `redux-selector:selectUser` 且注释包含用户信息
- **THEN** 该 selector 节点出现在搜索结果中
