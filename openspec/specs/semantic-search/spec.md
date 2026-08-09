## Purpose

基于语义向量的自然语言检索能力。将查询文本转换为向量，与图谱节点向量计算余弦相似度，支持多条件组合过滤。集成置信度衰减加权锚点选择算法。

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
- **AND** 锚点节点中包含至少一个 L3 函数节点（而非仅靠 name-match 命中的 L2 文件节点）

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
- **THEN** 词汇匹配时三个等价词都参与匹配
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

#### Scenario: 仅检索 C 层能力节点
- **WHEN** 执行 `wpw graph search "登录" --level C`
- **THEN** 仅返回 C 层业务能力节点中语义匹配的结果

#### Scenario: 仅检索后端模块节点
- **WHEN** 执行 `wpw graph search "认证" --level L1 --side backend`
- **THEN** 仅返回后端模块节点中语义匹配的结果

#### Scenario: C 层可被检索
- **WHEN** 执行 `wpw graph search "<query>" --level C`
- **THEN** 仅在 C 层能力节点中进行语义检索
- **AND** 返回匹配的能力节点列表

#### Scenario: 多层混合检索
- **WHEN** 执行 `wpw graph search "<query>" --level C,L1,L2,L3`
- **THEN** 在所有层级节点中进行语义检索
- **AND** 结果按相似度混合排序

### Requirement: 检索性能
单次语义检索（含向量生成、相似度计算、排序）端到端总耗时 SHALL ≤ 300ms（含 CLI 进程启动）。

#### Scenario: 万级节点检索性能
- **WHEN** 图谱包含万级节点，执行语义检索
- **THEN** 端到端总耗时 ≤ 300ms

### Requirement: 置信度衰减加权锚点选择
语义检索 SHALL 支持置信度衰减加权算法，在生成锚点时根据 C 层置信度动态调整 L1 层权重。

#### Scenario: 高 C 层置信度时 L1 被压制
- **WHEN** C 层最高相似度 >= 0.8
- **THEN** L1 节点的有效得分乘以衰减权重 ~0.09（α=3.0）
- **AND** L1 节点在锚点排序中优先级降低

#### Scenario: 低 C 层置信度时 L1 兜底
- **WHEN** C 层最高相似度 <= 0.2 或 C 层为空
- **THEN** L1 节点有效得分权重 >= ~0.55（α=3.0）
- **AND** L1 节点在锚点选择中发挥兜底作用

#### Scenario: L2/L3 不受衰减影响
- **WHEN** 应用置信度衰减
- **THEN** L2 和 L3 层节点的相似度得分保持原值
- **AND** 仅 L1 层节点得分被乘以衰减权重

### Requirement: 衰减系数可配置
置信度衰减的衰减系数 α SHALL 可通过配置调整。

#### Scenario: 默认衰减系数
- **WHEN** 未配置衰减系数
- **THEN** α 默认值为 3.0

#### Scenario: 自定义衰减系数
- **WHEN** 配置 `graph.search.decayAlpha: 2.0`
- **THEN** 系统使用 α=2.0 进行衰减计算
- **AND** L1 权重衰减更平缓

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

### Requirement: 指定图谱语义检索
`wpw graph search` SHALL 接受 `--graph <stack>` 参数，仅在指定图谱的向量索引内检索。缺省时检索 `default` 图谱。

#### Scenario: 指定图谱语义检索
- **WHEN** 执行 `wpw graph search "用户登录" --graph frontend-vue`
- **THEN** 仅在 `frontend-vue` 图谱的向量索引内检索
- **AND** 不返回其他图谱的节点

#### Scenario: 指定后端图谱检索
- **WHEN** 执行 `wpw graph search "推荐接口" --graph backend-springboot`
- **THEN** 仅在 `backend-springboot` 图谱内检索
- **AND** 返回 Java 方法/类等后端节点

#### Scenario: 缺省检索 default 图谱
- **WHEN** 执行 `wpw graph search "登录"`（无 `--graph`）
- **THEN** 检索 `default` 图谱

#### Scenario: 指定图谱无向量索引
- **WHEN** 执行 `wpw graph search "x" --graph backend-springboot`，但该图谱向量索引不存在（构建时 embedding 关闭）
- **THEN** 输出提示该图谱无向量索引
- **AND** 建议重新 `wpw graph build --name backend-springboot --root <dir>` 开启 embedding
