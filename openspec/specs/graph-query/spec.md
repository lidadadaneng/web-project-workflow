## Purpose

知识图谱结构化查询能力。提供节点查询、依赖链路查询、最短路径查询、统计概览等功能，全部基于内存索引，零数据库依赖。

## Requirements

### Requirement: 节点精准查询
系统 SHALL 支持按 `node_id` 精准查询节点完整属性，以及按层级、节点类型、所属文件、所属模块等维度批量过滤查询节点。节点查询结果 SHALL 包含 `filePath` 和 `parentName` 字段（如适用），用于区分同名节点。

#### Scenario: 按 node_id 查询单个节点
- **WHEN** 执行 `wpw graph query --id <node_id>`
- **THEN** 返回该节点的全部属性（层级、类型、名称、扩展属性、时间戳等）
- **AND** 若节点有 `filePath` / `parentName` 属性则一并返回

#### Scenario: 按层级批量查询节点
- **WHEN** 执行 `wpw graph query --level L3`
- **THEN** 返回所有 L3 层级的节点列表
- **AND** 支持 `--limit` 参数限制返回数量
- **AND** 每个节点信息包含 `filePath` 字段

#### Scenario: 新层级值被接受
- **WHEN** 执行 `wpw graph query --level C,L1,L2,L3`
- **THEN** 所有层级值均被正确识别
- **AND** 返回对应层级的节点

#### Scenario: 旧层级值向后兼容
- **WHEN** 用户使用旧层级值 L1/L2/L3/L4
- **THEN** 系统输出警告，说明层级命名已变更
- **AND** 尝试映射：旧 L1→C，旧 L2→L1，旧 L3→L2，旧 L4→L3

#### Scenario: 查询不存在的节点
- **WHEN** 执行 `wpw graph query --id <不存在的 node_id>`
- **THEN** 返回空结果并输出提示

### Requirement: 节点类型命名适配
节点类型输出 SHALL 与新层级体系保持一致。

#### Scenario: capability 类型为 C 层
- **WHEN** 查询 C 层节点
- **THEN** 节点 type 字段为 `capability`
- **AND** 节点 level 字段为 `C`

#### Scenario: 原 requirement 类型移除
- **WHEN** 遍历所有节点类型
- **THEN** 不存在 `requirement` 类型
- **AND** 新增 `capability` 类型

### Requirement: 按节点类型查询
系统 SHALL 支持按节点类型过滤查询，新增 `capability` 类型选项。

#### Scenario: 按 capability 类型查询
- **WHEN** 执行 `wpw graph query --type capability`
- **THEN** 返回所有 C 层能力节点

#### Scenario: 多类型混合查询
- **WHEN** 执行 `wpw graph query --type capability,function`
- **THEN** 返回能力节点和函数节点的混合结果

### Requirement: 依赖链路查询
系统 SHALL 支持查询指定节点的上游依赖、下游依赖列表，可配置查询深度与权重阈值；并支持查询两个节点之间的最短关联路径。

#### Scenario: 查询下游依赖
- **WHEN** 执行 `wpw graph query --downstream <node_id> --depth 2 --min-weight 0.7`
- **THEN** 返回从该节点出发、深度 ≤ 2、边权重 ≥ 0.7 的所有下游依赖节点
- **AND** 每条结果包含目标节点、路径深度、累计权重

#### Scenario: 查询上游依赖
- **WHEN** 执行 `wpw graph query --upstream <node_id> --depth 1`
- **THEN** 返回所有直接依赖该节点的上游节点

#### Scenario: 查询两节点最短路径
- **WHEN** 执行 `wpw graph query --path --from <node_id_a> --to <node_id_b>`
- **THEN** 返回两节点之间的最短依赖链路（节点序列 + 边序列）
- **AND** 若两节点不连通，返回空路径

### Requirement: 图谱统计概览
系统 SHALL 支持通过 `wpw graph stat` 命令输出图谱核心统计指标。

#### Scenario: 查看图谱统计
- **WHEN** 用户执行 `wpw graph stat`
- **THEN** 输出各层级节点数量（C/L1/L2/L3）、各类关系边数量、向量索引规模、最后构建时间
- **AND** 若图谱不存在，输出提示信息并建议执行 `wpw graph build`

### Requirement: JSON 输出格式
所有查询命令 SHALL 支持 `--json` 参数，输出结构化 JSON 格式供程序调用。语义检索结果的 JSON 输出 SHALL 包含 `filePath` 和 `parentName` 字段（当节点存在这些属性时）。

#### Scenario: JSON 格式输出查询结果
- **WHEN** 在任意 graph 查询命令后添加 `--json` 参数
- **THEN** 标准输出为合法 JSON 格式
- **AND** 包含查询结果与状态信息

#### Scenario: 搜索结果 JSON 含去歧义信息
- **WHEN** 执行 `wpw graph search "onSubmit" --json`，返回多个同名函数节点
- **THEN** JSON 中每个结果对象包含 `filePath` 和 `parentName` 字段
- **AND** 消费方可通过 `parentName + "/" + name` 唯一标识每个结果

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

### Requirement: 指定图谱查询
`wpw graph query` SHALL 接受 `--graph <stack>` 参数，仅在指定图谱内查询。缺省时查询 `default` 图谱。

#### Scenario: 指定图谱结构化查询
- **WHEN** 执行 `wpw graph query --level L2 --graph backend-springboot`
- **THEN** 仅在 `backend-springboot` 图谱内查询 L2 节点
- **AND** 不返回其他图谱的节点

#### Scenario: 指定图谱上下游查询
- **WHEN** 执行 `wpw graph query --downstream <nodeId> --graph frontend-vue`
- **THEN** 在 `frontend-vue` 图谱内追溯下游依赖
- **AND** 跨图谱不追溯

#### Scenario: 缺省查询 default 图谱
- **WHEN** 执行 `wpw graph query --level L2`（无 `--graph`）
- **THEN** 查询 `default` 图谱

#### Scenario: 图谱不存在时报错
- **WHEN** 执行 `wpw graph query --graph nonexistent`
- **THEN** 输出错误"图谱 nonexistent 不存在"并提示 `wpw graph list`
- **AND** 退出码非 0
