## ADDED Requirements

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
