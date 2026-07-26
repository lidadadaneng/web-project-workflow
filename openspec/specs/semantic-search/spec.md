## Purpose

基于语义向量的自然语言检索能力。将查询文本转换为向量，与图谱节点向量计算余弦相似度，支持多条件组合过滤。

## Requirements

### Requirement: 自然语言语义召回
系统 SHALL 支持将自然语言查询文本转换为语义向量，与向量索引中所有节点向量计算余弦相似度，并叠加跨语言词汇加权得到最终得分，按最终得分降序返回 Top-N 候选节点。最终得分 `finalScore = cosineSim + lexBoost`，上限 1.0；无词汇命中时 `lexBoost = 0`，退化为纯语义排序（向后兼容）。

#### Scenario: 语义检索返回相关节点
- **WHEN** 执行 `wpw graph search "用户登录认证" --limit 10 --threshold 0.6`
- **THEN** 返回最终得分 ≥ 0.6 的节点列表，按最终得分降序排列
- **AND** 每个结果包含节点信息与最终得分分值
- **AND** 结果数量不超过召回数量上限

#### Scenario: 无匹配结果
- **WHEN** 执行语义检索，传入的查询文本与所有节点的最终得分均低于阈值
- **THEN** 返回空列表

#### Scenario: 纯语义场景不受词汇加权影响
- **WHEN** 查询词无中英文等价词命中任何节点名/父名/路径
- **THEN** 各节点 `lexBoost = 0`，最终得分等于 cosine 相似度
- **AND** 排序结果与纯语义检索一致

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

### Requirement: 查询跨语言展开复用 CN_EN_MAP
系统 SHALL 复用 `mapping-sources.ts` 的中英词典 `CN_EN_MAP` 进行查询词的跨语言展开，避免维护两套词典。展开函数 SHALL 导出为 `expandQueryToEnglish(query)`，返回查询词及其英文等价词集合。

#### Scenario: 中文查询词展开
- **WHEN** 调用 `expandQueryToEnglish("用户注册")`
- **THEN** 返回集合含原词 "用户注册"、拆分中文词 "用户"/"注册" 及其英文等价词 `user`/`account`/`member`/`register` 等

#### Scenario: 英文查询词原样保留
- **WHEN** 调用 `expandQueryToEnglish("login")`
- **THEN** 返回集合含 "login"（无中文需翻译）

### Requirement: 多条件组合检索
系统 SHALL 支持「语义相似度 + 层级 + 节点类型」组合过滤，提升检索精准度。

#### Scenario: 仅检索 L1 需求节点
- **WHEN** 执行 `wpw graph search "登录" --level L1`
- **THEN** 仅返回 L1 业务需求节点中语义匹配的结果

#### Scenario: 仅检索后端模块节点
- **WHEN** 执行 `wpw graph search "认证" --level L2 --side backend`
- **THEN** 仅返回后端模块节点中语义匹配的结果

### Requirement: 检索性能
单次语义检索（含向量生成、相似度计算、排序）端到端总耗时 SHALL ≤ 300ms（含 CLI 进程启动）。

#### Scenario: 万级节点检索性能
- **WHEN** 图谱包含万级节点，执行语义检索
- **THEN** 端到端总耗时 ≤ 300ms

### Requirement: 归档需求过滤
系统 SHALL 支持通过配置控制是否在语义检索结果中过滤归档需求。

#### Scenario: 过滤归档需求
- **WHEN** `workflow.config.yaml` 中配置 `graph.search.excludeArchived: true`，执行语义检索
- **THEN** 返回结果中不包含已归档的 L1 需求节点及其关联子节点

#### Scenario: 包含归档需求
- **WHEN** `workflow.config.yaml` 中配置 `graph.search.excludeArchived: false`，执行语义检索
- **THEN** 返回结果中包含所有匹配节点，包括归档需求

### Requirement: 本地 Embedding 默认
系统 SHALL 默认使用本地 Embedding 模型进行语义检索，不调用付费 API。

#### Scenario: 默认本地检索
- **WHEN** 使用默认配置执行 `wpw graph search`
- **THEN** 使用本地 Embedding 模型生成查询向量
- **AND** 不发起任何外部 API 调用

### Requirement: JSON 输出格式
语义检索命令 SHALL 支持 `--json` 参数，输出结构化 JSON 格式。

#### Scenario: JSON 格式输出检索结果
- **WHEN** 执行 `wpw graph search <query> --json`
- **THEN** 标准输出为合法 JSON 格式，包含命中节点列表与相似度分值
