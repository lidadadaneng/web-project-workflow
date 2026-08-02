## ADDED Requirements

### Requirement: 需求节点中文描述属性
L1 需求节点 SHALL 携带 `description` 属性，存储需求的中文简述，用于图谱展示时的可读性。节点 `name` 字段为英文 kebab-case 标识，`description` 字段为中文展示文本。

#### Scenario: 英文需求名配中文描述
- **WHEN** 解析一个英文命名的需求（如 `cart-batch-delete`）
- **THEN** 节点 `name` 字段为英文标识 `cart-batch-delete`
- **AND** 节点 `attrs.description` 字段为中文简述（如"购物车批量删除功能"）
- **AND** 图谱查询和搜索结果展示时可同时显示两者

#### Scenario: 中文需求名兼容
- **WHEN** 解析一个历史遗留的中文命名需求
- **THEN** 节点 `name` 字段保持原中文名称
- **AND** `attrs.description` 字段与 name 相同（或从 BRD 提取更详细描述）
- **AND** 不影响现有图谱的查询和检索

#### Scenario: 描述从 BRD 提取
- **WHEN** 需求目录中存在 BRD 文档
- **THEN** 系统从 BRD 标题或业务目标章节提取中文简述作为 description
- **AND** 若提取失败，降级使用需求名作为 description
