## ADDED Requirements

### Requirement: 自然语言语义召回
系统 SHALL 支持将自然语言查询文本转换为语义向量，与向量索引中所有节点向量计算余弦相似度，按相似度降序返回 Top-N 候选节点。

#### Scenario: 语义检索返回相关节点
- **WHEN** 执行 `wpw graph search "用户登录认证" --limit 10 --threshold 0.6`
- **THEN** 返回相似度 ≥ 0.6 的节点列表，按相似度降序排列
- **AND** 每个结果包含节点信息与相似度分值
- **AND** 结果数量不超过召回数量上限

#### Scenario: 无匹配结果
- **WHEN** 执行语义检索，传入的查询文本与所有节点相似度均低于阈值
- **THEN** 返回空列表

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
