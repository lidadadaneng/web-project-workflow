## ADDED Requirements

### Requirement: 端到端上下文生成
系统 SHALL 支持通过 `wpw graph context` 命令，输入自然语言查询，输出压缩后的结构化上下文文本，直接可用于 AI 编码场景。

#### Scenario: 基本上下文生成
- **WHEN** 执行 `wpw graph context "用户登录认证"`
- **THEN** 系统自动完成：语义检索 → 子图裁剪 → 骨架抽取 → 层级序列化
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
- **WHEN** 执行 `wpw graph context "登录" --level L3,L4`
- **THEN** 子图中仅包含 L3（文件）和 L4（元素）层级的节点

#### Scenario: 深度与权重控制
- **WHEN** 执行 `wpw graph context "登录" --depth 2 --min-weight 0.8`
- **THEN** 子图扩展深度不超过 2，仅使用权重 ≥ 0.8 的边

#### Scenario: 压缩等级控制
- **WHEN** 执行 `wpw graph context "登录" --compression extreme`
- **THEN** 输出使用极致压缩等级

#### Scenario: 归档过滤
- **WHEN** 执行 `wpw graph context "登录" --include-archived`
- **THEN** 结果中包含归档需求的相关节点

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
