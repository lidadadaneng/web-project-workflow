## MODIFIED Requirements

### Requirement: 跨语言词汇加权
系统 SHALL 在 cosine 相似度之上叠加词汇加分 `lexBoost`，桥接"中文查询 ↔ 英文代码标识符"的跨语言匹配缺口。查询文本 SHALL 经 `CN_EN_MAP` 展开为英文等价词集合（如"注册"展开为 `register`），再与节点名/父名/文件路径/注释文本/JSDoc 做分级匹配。`lexBoost` 分级：查询词与节点名互含或精确匹配 +0.35；英文等价词为节点名前缀 +0.25；英文等价词包含于节点名 +0.15；英文等价词命中 parentName 或 filePath +0.10；英文等价词命中节点注释/JSDoc/中文别名 +0.08。`finalScore` 上限 1.0。

#### Scenario: 中文查询经词典命中英文标识符
- **WHEN** 执行 `wpw graph search "注册"`，存在组件节点 `RegisterView`
- **THEN** "注册"经 `CN_EN_MAP` 展开为 `register`，作为 `RegisterView` 名前缀命中
- **AND** 该节点 `lexBoost = 0.25`，最终得分 = cosine + 0.25（上限 1.0）
- **AND** `RegisterView` 排序高于无词汇命中的纯语义候选

#### Scenario: 精确名称匹配置顶
- **WHEN** 执行 `wpw graph search "RegisterView"`，存在同名组件节点
- **THEN** 该节点 `lexBoost = 0.35`（查询词与节点名精确匹配）
- **AND** 即使 cosine 相似度较低，最终得分亦足以使其进入 Top 结果

#### Scenario: 同名函数按父名区分
- **WHEN** 图谱含 `LoginView.onSubmit`、`RegisterView.onSubmit`、`ResetView.onSubmit` 三个同名 `onSubmit` 节点，查询"注册"
- **THEN** "注册"展开为 `register`，命中 `RegisterView.onSubmit` 的 parentName
- **AND** 该节点 `lexBoost = 0.10`，最终得分高于另两个 `onSubmit`
- **AND** 结果中可区分三者（节点信息含 parentName/filePath）

#### Scenario: 无等价词命中不加权
- **WHEN** 查询词不在 `CN_EN_MAP` 且与节点名无包含关系
- **THEN** `lexBoost = 0`，仅按 cosine 排序

#### Scenario: 中文注释命中加权
- **WHEN** 查询"注册"，某 Pinia action 节点 `register` 的 JSDoc 包含"用户注册"
- **THEN** 该节点因注释文本命中获得 `lexBoost = 0.08`
- **AND** 与名称命中叠加后总 `lexBoost` 不超过 0.35

### Requirement: 中文语义检索召回率
系统 SHALL 确保中文查询的语义检索质量不低于英文查询的同级别召回效果。中文查询 SHALL 触发与英文查询相同规模的上下文子图扩展（锚点数量 ≥ 英文查询的 50%，子图节点数 ≥ 英文查询的 50%）。实现手段包括但不限于：节点向量索引融合中文语义（双语 embedding 或中文文本字段独立 embedding）、节点元数据中包含中文别名/注释供词汇匹配、中文词典覆盖度扩充。

#### Scenario: 中文查询展开完整依赖链
- **WHEN** 执行 `wpw graph context "注册"`，项目中存在完整的注册流程依赖链（RegisterView → auth store → API 层）
- **THEN** 返回的上下文子图节点数 ≥ 英文查询 "register" 子图节点数的 50%
- **AND** 锚点节点中包含至少一个 L4 函数节点（而非仅靠 name-match 命中的 L3 文件节点）

#### Scenario: 中文查询锚点不唯一
- **WHEN** 执行 `wpw graph context "登录认证"`
- **THEN** 锚点数量 ≥ 2（至少命中组件节点 + store action 节点）
- **AND** 子图可展开上下游依赖关系

#### Scenario: 英文查询保持原有质量
- **WHEN** 执行 `wpw graph context "register"`
- **THEN** 检索质量和子图规模不低于改动前水平（回归保障）

## ADDED Requirements

### Requirement: 中文词典扩充
系统 SHALL 扩充 `CN_EN_MAP` 中英词典覆盖度，从现有词条扩展至 ≥ 100 条高频前端业务术语，涵盖认证、用户管理、表单、数据查询、权限、支付、通知等常见业务域。词典条目 SHALL 支持一对多映射（一个中文词对应多个英文等价词）。

#### Scenario: 词典覆盖常见业务域
- **WHEN** 查询"用户认证"、"表单验证"、"权限控制"、"数据分页"、"消息通知"等常见业务术语
- **THEN** 每个查询词均能在 `CN_EN_MAP` 中找到对应英文等价词
- **AND** 展开后的英文等价词数量 ≥ 2（覆盖常见同义词/变体）

#### Scenario: 词典一对多映射
- **WHEN** 中文词"用户"映射到 `user`、`account`、`member` 三个英文等价词
- **THEN** 词汇匹配时三个等价词均参与匹配
- **AND** 取最高匹配强度作为该中文词的 lexBoost 贡献
