## Purpose

端到端上下文生成 Pipeline。整合语义检索、置信度衰减锚点选择、子图裁剪、骨架抽取、层级序列化，输出可直接喂给 LLM 的结构化上下文文本。

## Requirements

### Requirement: 端到端上下文生成
系统 SHALL 支持通过 `wpw graph context` 命令，输入自然语言查询，输出压缩后的结构化上下文文本，直接可用于 AI 编码场景。

#### Scenario: 基本上下文生成
- **WHEN** 执行 `wpw graph context "用户登录认证"`
- **THEN** 系统自动完成：语义检索 → 置信度衰减锚点选择 → 子图裁剪 → 骨架抽取 → 层级序列化
- **AND** 输出格式化的结构化上下文文本

#### Scenario: JSON 模式输出
- **WHEN** 执行 `wpw graph context "用户登录认证" --json`
- **THEN** 输出 JSON 格式，包含：锚点列表、子图节点边、压缩文本、统计信息
- **AND** JSON 格式合法，可被程序直接解析

### Requirement: Token 预算约束
系统 SHALL 支持传入最大 Token 预算，自动调整裁剪与压缩粒度，保证输出文本不超出 Token 限制。

#### Scenario: Token 预算内输出
- **WHEN** 执行 `wpw graph context "登录" --token-budget 8000`
- **THEN** 系统迭代调整子图大小与压缩等级
- **AND** 最终输出文本的预估 Token 数 ≤ 预算值

#### Scenario: 预算不足降级
- **WHEN** 传入的 Token 预算过小，即使极致压缩也无法容纳核心锚点
- **THEN** 输出核心锚点的极简信息
- **AND** 返回警告标识提示预算不足

### Requirement: 多锚点支持
系统 SHALL 支持同时传入多个查询或多个锚点节点，生成合并的子图上下文。

#### Scenario: 多查询合并
- **WHEN** 执行 `wpw graph context "登录,注册,密码找回" --multi`
- **THEN** 分别检索每个查询的锚点，合并后生成统一子图
- **AND** 输出结果去重

#### Scenario: 直接指定锚点
- **WHEN** 执行 `wpw graph context --anchors elem:abc123,mod:def456`
- **THEN** 跳过语义检索，直接以指定节点为锚点生成子图

### Requirement: 丰富的过滤选项
系统 SHALL 支持通过参数控制上下文生成的各个环节。

#### Scenario: 层级过滤
- **WHEN** 执行 `wpw graph context "登录" --level L2,L3`
- **THEN** 子图中仅包含 L2（文件）和 L3（元素）层级的节点

#### Scenario: 深度与权重控制
- **WHEN** 执行 `wpw graph context "登录" --depth 2 --min-weight 0.8`
- **THEN** 子图扩展深度不超过 2，仅使用权重 ≥ 0.8 的边

#### Scenario: 语义检索阈值控制
- **WHEN** 执行 `wpw graph context "登录" --threshold 0.4`
- **THEN** 语义检索仅召回相似度 ≥ 0.4 的节点作为锚点
- **AND** 覆盖配置中的默认阈值，适配中文模型较低的相似度分布

#### Scenario: 压缩等级控制
- **WHEN** 执行 `wpw graph context "登录" --compression extreme`
- **THEN** 输出使用极致压缩等级

#### Scenario: C 层作为上下文入口
- **WHEN** 执行 `wpw graph context "<query>" --level C`
- **THEN** 仅在 C 层能力节点中检索锚点
- **AND** 子图从 C 层沿 business_map 边扩展到结构层

### Requirement: 置信度衰减锚点选择集成
上下文生成管线 SHALL 集成置信度衰减加权算法，在语义检索后、锚点选择前应用衰减。

#### Scenario: 默认启用衰减加权
- **WHEN** 执行 `wpw graph context` 且通过语义检索获取锚点
- **THEN** 自动应用置信度衰减加权算法
- **AND** L1 层节点得分根据 C 层置信度动态调整

#### Scenario: 指定锚点时跳过衰减
- **WHEN** 使用 `--anchors` 参数直接指定锚点 ID
- **THEN** 跳过语义检索和置信度衰减
- **AND** 直接使用指定的锚点节点

#### Scenario: 多查询模式每层独立衰减
- **WHEN** 使用 `--multi` 模式进行多查询检索
- **THEN** 每个查询独立计算 C 层置信度和 L1 衰减
- **AND** 合并锚点后去重

### Requirement: 子图扩展路径适配
子图扩展逻辑 SHALL 适配新的层级关系，C 层通过 business_map 连接到结构层。

#### Scenario: C 层锚点扩展路径
- **WHEN** 锚点包含 C 层能力节点
- **THEN** 扩展沿 business_map 边进入 L1/L2/L3 结构层
- **AND** 随后在结构层内沿 contain/import/call 边继续扩展

#### Scenario: 结构层锚点扩展路径不变
- **WHEN** 锚点仅包含 L1/L2/L3 结构层节点
- **THEN** 扩展路径与原有逻辑一致：contain + import + call
- **AND** 不涉及 C 层

### Requirement: 压缩输出层级命名更新
上下文压缩输出的层级标记 SHALL 适配新的命名体系。

#### Scenario: 压缩文本使用新层级标记
- **WHEN** 生成压缩上下文文本
- **THEN** 节点层级显示为 C、L1、L2、L3
- **AND** C 层节点标注为 [能力]，L1 标注为 [模块]，L2 标注为 [文件]，L3 标注为 [元素]

### Requirement: 统计与可观测性
系统 SHALL 在输出中包含各环节的统计信息，便于评估效果与性能。

#### Scenario: 统计信息输出
- **WHEN** 执行 `wpw graph context` 命令
- **THEN** 输出（或 JSON 中包含）以下统计信息：
  - 锚点数量、子图节点数、子图边数
  - 预估 Token 数、压缩率
  - 检索耗时、裁剪耗时、压缩耗时、总耗时
- **AND** 统计信息不干扰正文内容（JSON 模式独立字段，文本模式放在首尾）

### Requirement: 图谱不存在时降级
系统 SHALL 在图谱不存在时给出明确提示，而非报错。

#### Scenario: 图谱不存在
- **WHEN** 项目中未构建过图谱，执行 `wpw graph context`
- **THEN** 输出清晰的提示信息，建议执行 `wpw graph build`
- **AND** 退出码为非零值

### Requirement: 指定图谱生成上下文
`wpw graph context` SHALL 接受 `--graph <stack>` 参数，仅在指定图谱内检索锚点、裁剪子图、生成上下文。缺省时使用 `default` 图谱。

#### Scenario: 指定图谱生成上下文
- **WHEN** 执行 `wpw graph context "推荐接口" --graph backend-springboot --token-budget 4000`
- **THEN** 在 `backend-springboot` 图谱内检索锚点并裁剪子图
- **AND** 生成的上下文仅含后端节点

#### Scenario: 指定前端图谱生成上下文
- **WHEN** 执行 `wpw graph context "购物车" --graph frontend-vue`
- **THEN** 在 `frontend-vue` 图谱内生成上下文
- **AND** 仅含前端节点

#### Scenario: 缺省使用 default 图谱
- **WHEN** 执行 `wpw graph context "登录"`（无 `--graph`）
- **THEN** 使用 `default` 图谱

### Requirement: AI 层决定检索哪个图谱
图谱选择由 AI 层（`/wpw:map`）根据问题语义决定，CLI 仅提供 `--graph` 原语。AI 层 SHALL 根据问题涉及的技术栈选择对应图谱发起 context 生成；跨端问题 SHALL 由 AI 层发起多次单图谱 context 生成并自行聚合。

#### Scenario: AI 选择后端图谱
- **WHEN** AI 层判断问题"推荐算法怎么实现的"涉及后端
- **THEN** AI 层发起 `wpw graph context "推荐算法" --graph backend-springboot`
- **AND** 不查询前端图谱

#### Scenario: 跨端问题 AI 多图谱聚合
- **WHEN** AI 层判断问题"前端如何调用推荐接口"涉及前后端
- **THEN** AI 层分别发起 `--graph frontend-vue` 与 `--graph backend-springboot` 的 context 生成
- **AND** CLI 不做跨图谱联合检索（首版由 AI 层聚合）

#### Scenario: 图谱不存在时降级
- **WHEN** AI 层发起 `--graph <stack>` 但该图谱不存在
- **THEN** CLI 输出错误并提示 `wpw graph list`
- **AND** AI 层可回退到 `default` 图谱或提示用户构建
