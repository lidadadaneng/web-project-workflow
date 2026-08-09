## ADDED Requirements

### Requirement: 新增节点类型纳入语义检索
语义检索 SHALL 自动纳入 Vuex、Redux、微信小程序、uni-app 四类新增节点类型，用户可通过 `--type` 参数按类型过滤。

#### Scenario: 语义检索 Vuex action
- **WHEN** 执行 `wpw graph search "用户登录" --type vuex-action`
- **THEN** 仅在 vuex-action 类型节点中进行语义检索
- **AND** 返回匹配的 action 节点列表

#### Scenario: 语义检索 Redux slice
- **WHEN** 执行 `wpw graph search "用户状态管理" --type redux-slice`
- **THEN** 返回语义匹配的 redux-slice 节点

#### Scenario: 语义检索小程序页面
- **WHEN** 执行 `wpw graph search "订单详情页" --type mp-page`
- **THEN** 返回语义匹配的 mp-page 节点
- **AND** 页面标题（navigationBarTitleText）参与向量匹配

#### Scenario: 语义检索 uni-app 页面
- **WHEN** 执行 `wpw graph search "商品列表" --type uni-page`
- **THEN** 返回语义匹配的 uni-page 节点
- **AND** 页面路径和标题都参与语义匹配

### Requirement: 全类型混合检索
不指定 `--type` 时，语义检索 SHALL 在所有节点类型（包括新增类型）中混合检索并统一排序。

#### Scenario: 跨状态管理检索 action
- **WHEN** 执行 `wpw graph search "登录" --level L3`
- **THEN** 返回结果中可同时包含 pinia-action、vuex-action、redux-action 节点
- **AND** 按相似度统一排序

### Requirement: 节点向量质量保障
新增节点类型的向量文本 SHALL 包含足够的语义信息，确保中文检索效果。store/slice 节点向量 SHALL 包含名称 + 所属文件路径 + 描述/注释；页面节点向量 SHALL 包含页面路径 + 页面标题 + 描述。

#### Scenario: 页面节点中文检索质量
- **WHEN** 搜索"个人中心"，存在页面标题为"个人中心"的 mp-page 或 uni-page 节点
- **THEN** 该页面节点出现在 Top 5 结果中
- **AND** 相似度得分不低于 0.6

#### Scenario: 状态管理 action 检索质量
- **WHEN** 搜索"提交表单"，存在相关的 vuex-action 或 redux-action 节点
- **THEN** 该 action 节点出现在 Top 10 结果中
