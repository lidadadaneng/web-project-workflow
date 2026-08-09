## ADDED Requirements

### Requirement: Vuex / Redux 节点类型查询
系统 SHALL 支持按 Vuex 和 Redux 相关的节点类型过滤查询，包括 vuex-store、vuex-state、vuex-mutation、vuex-action、vuex-getter、redux-slice、redux-state、redux-reducer、redux-action、redux-selector。

#### Scenario: 查询所有 Vuex store
- **WHEN** 执行 `wpw graph query --type vuex-store`
- **THEN** 返回所有 vuex-store 类型的节点列表
- **AND** 每个节点包含 store 名、所属文件路径等信息

#### Scenario: 查询所有 Redux action
- **WHEN** 执行 `wpw graph query --type redux-action`
- **THEN** 返回所有 redux-action 类型的节点列表

#### Scenario: 多类型混合查询含新类型
- **WHEN** 执行 `wpw graph query --type pinia-action,vuex-action,redux-action`
- **THEN** 返回三种状态管理的 action 节点混合结果

### Requirement: 微信小程序节点类型查询
系统 SHALL 支持按微信小程序相关节点类型过滤查询，包括 mp-app、mp-page、mp-component、mp-method、mp-lifecycle、mp-data、mp-property。

#### Scenario: 查询所有小程序页面
- **WHEN** 执行 `wpw graph query --type mp-page`
- **THEN** 返回所有 mp-page 类型的节点列表
- **AND** 每个节点包含页面路径、所属分包（如有）等信息

#### Scenario: 查询所有自定义组件
- **WHEN** 执行 `wpw graph query --type mp-component`
- **THEN** 返回所有 mp-component 类型的节点列表

#### Scenario: 按分包过滤页面
- **WHEN** 执行 `wpw graph query --type mp-page --subpackage packageA`
- **THEN** 仅返回 packageA 分包下的页面节点

### Requirement: uni-app 节点类型查询
系统 SHALL 支持按 uni-app 相关节点类型过滤查询，包括 uni-page。

#### Scenario: 查询所有 uni-app 页面
- **WHEN** 执行 `wpw graph query --type uni-page`
- **THEN** 返回所有 uni-page 类型的节点列表
- **AND** 每个节点包含页面路径、页面标题、分包信息等

#### Scenario: 按平台过滤条件编译节点
- **WHEN** 执行 `wpw graph query --platform mp-weixin`
- **THEN** 仅返回标记为微信小程序平台的条件编译代码节点

### Requirement: 路由边查询
系统 SHALL 支持查询页面之间的 `navigate` 边，识别页面跳转关系。

#### Scenario: 查询页面下游跳转
- **WHEN** 执行 `wpw graph query --downstream <page_node_id> --edge-type navigate`
- **THEN** 返回从该页面出发的所有 navigate 边目标节点
- **AND** 结果包含跳转方式（navigateTo / redirectTo / switchTab 等）

#### Scenario: 查询页面上游来源
- **WHEN** 执行 `wpw graph query --upstream <page_node_id> --edge-type navigate`
- **THEN** 返回所有可跳转到该页面的上游页面节点

### Requirement: 组件引用边查询
系统 SHALL 支持查询组件引用关系（use-component 边）。

#### Scenario: 查询页面使用的组件
- **WHEN** 执行 `wpw graph query --downstream <page_id> --edge-type use-component`
- **THEN** 返回该页面引用的所有自定义组件节点

#### Scenario: 查询组件被哪些页面使用
- **WHEN** 执行 `wpw graph query --upstream <component_id> --edge-type use-component`
- **THEN** 返回所有引用该组件的页面/组件节点

### Requirement: 图谱统计含新节点类型
`wpw graph stat` 命令的统计输出 SHALL 包含新增的节点类型分布。

#### Scenario: 统计输出含新节点类型
- **WHEN** 执行 `wpw graph stat`
- **THEN** 边类型分布中包含 navigate、use-component、bind-event、bind-data 等新增边类型
- **AND** 节点类型可以通过 `wpw graph query --type <type>` 逐一验证
