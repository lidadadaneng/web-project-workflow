## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: 跨语言词汇加权
系统 SHALL 在 cosine 相似度之上叠加词汇加分 `lexBoost`，桥接"中文查询 ↔ 英文代码标识符"的跨语言匹配缺口。查询文本 SHALL 经 `CN_EN_MAP` 展开为英文等价词集合（如"注册"展开为 `register`），再与节点名/父名/文件路径做分级匹配。`lexBoost` 分级：查询词与节点名互含或精确匹配 +0.35；英文等价词为节点名前缀 +0.25；英文等价词包含于节点名 +0.15；英文等价词命中 parentName 或 filePath +0.10。`finalScore` 上限 1.0。

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

### Requirement: 查询跨语言展开复用 CN_EN_MAP
系统 SHALL 复用 `mapping-sources.ts` 的中英词典 `CN_EN_MAP` 进行查询词的跨语言展开，避免维护两套词典。展开函数 SHALL 导出为 `expandQueryToEnglish(query)`，返回查询词及其英文等价词集合。

#### Scenario: 中文查询词展开
- **WHEN** 调用 `expandQueryToEnglish("用户注册")`
- **THEN** 返回集合含原词 "用户注册"、拆分中文词 "用户"/"注册" 及其英文等价词 `user`/`account`/`member`/`register` 等

#### Scenario: 英文查询词原样保留
- **WHEN** 调用 `expandQueryToEnglish("login")`
- **THEN** 返回集合含 "login"（无中文需翻译）
