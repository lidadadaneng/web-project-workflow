## MODIFIED Requirements

### Requirement: 四层节点模型重命名
图谱节点层级命名 SHALL 从 L1/L2/L3/L4 调整为 C/L1/L2/L3。原 L1（需求）改为 C 层（业务能力），原 L2/L3/L4 分别提升为 L1/L2/L3。

#### Scenario: 层级枚举值更新
- **WHEN** 查询节点层级类型
- **THEN** 合法的层级值为 `C | L1 | L2 | L3`
- **AND** 不再使用 `L4` 层级值

#### Scenario: 结构层级包含关系
- **WHEN** 构建 contain 边
- **THEN** 包含链为 L1 模块 ⊃ L2 文件 ⊃ L3 代码元素
- **AND** C 层与结构层之间为 business_map 边，不是 contain 边

#### Scenario: 统计输出适配新命名
- **WHEN** 执行 `wpw graph stat` 输出节点层级分布
- **THEN** 输出键为 C、L1、L2、L3
- **AND** C 层统计业务能力节点数，L1 统计模块节点数

### Requirement: Schema 版本 3.0.0
图谱 schema 版本 SHALL 升级到 3.0.0，标识层级命名体系与 C 层来源的破坏性变更。

（注：本需求正文已含 SHALL）

#### Scenario: 旧版本图谱不兼容
- **WHEN** 执行 `wpw graph update` 且已有图谱 schema 版本 < 3.0.0
- **THEN** 系统自动降级为全量构建
- **AND** 输出降级提示信息，说明原因是层级架构变更

#### Scenario: 全新构建写入 3.0.0
- **WHEN** 执行 `wpw graph build` 或 `wpw graph rebuild`
- **THEN** meta.json 中 schemaVersion 字段写入 `3.0.0`

### Requirement: 需求节点移出图谱
需求节点（原 L1 requirement）SHALL 不再作为图谱节点存在。需求信息仅存在于 wpw 工作流目录中，图谱 C 层来自 wpw/specs/ 能力规范。

（注：本需求正文已含 SHALL）

#### Scenario: buildGraph 不生成需求节点
- **WHEN** 执行 `wpw graph build`
- **THEN** 构建流程不解析 wpw/active 和 wpw/archived 需求目录
- **AND** C 层节点仅从 wpw/specs/ 目录解析

#### Scenario: 图谱不含 requirement 类型节点
- **WHEN** 查询图谱节点类型
- **THEN** 不存在 `requirement` 类型的节点
- **AND** C 层节点类型为 `capability`

## ADDED Requirements

### Requirement: C 层能力节点解析器
图谱构建 SHALL 包含 C 层能力节点解析器，从 wpw/specs/ 目录读取 OpenSpec 格式的能力规范并生成节点。

#### Scenario: 从 specs 目录解析能力节点
- **WHEN** 构建图谱且 wpw/specs/ 目录存在
- **THEN** 遍历 specs 下的每个子目录
- **AND** 每个包含 spec.md 的子目录生成一个 C 层能力节点
- **AND** 节点名 = 子目录名（kebab-case）
- **AND** description 从 spec 的 Purpose 章节提取

#### Scenario: 空 specs 目录正常构建
- **WHEN** wpw/specs/ 目录不存在或为空
- **THEN** C 层节点数为 0
- **AND** 图谱构建正常完成，无错误

## REMOVED Requirements

### Requirement: 需求节点解析
**Reason**: 需求不再作为图谱节点，C 层由稳态能力规范替代
**Migration**: 已有需求节点的图谱需全量重建，使用 3.0.0 schema
