## MODIFIED Requirements

### Requirement: 需求节点 ID 稳定性
需求节点（L1）的唯一标识 SHALL 仅基于需求名称生成，与需求所在的目录路径无关。需求从 active 归档到 archived 后，节点 ID 保持不变，所有关联边（contain、business_map 等）保持完整。

#### Scenario: 归档后需求节点 ID 不变
- **WHEN** 需求从 `wpw/active/<name>/` 移动到 `wpw/archived/YYYY-MM/<name>/`
- **THEN** 该需求对应的图谱节点 ID 保持不变
- **AND** 所有与该需求节点相关的边（business_map、contain 等）不受影响
- **AND** 仅节点的 `status.archived` 属性从 false 变为 true
- **AND** 节点的 `docPath` 属性更新为归档后的路径

#### Scenario: 同名需求全局唯一
- **WHEN** 创建新需求时
- **THEN** 系统 SHALL 同时检查 active 和 archived 目录下是否存在同名需求
- **AND** 若存在同名需求，拒绝创建并提示用户

### Requirement: 增量更新支持需求变更检测
`wpw graph update` SHALL 检测需求层面的变更（新增、归档、状态变化），并同步更新图谱中的 L1 需求节点及关联边，无需全量重建。

#### Scenario: 检测到新增需求
- **WHEN** 执行 `wpw graph update` 且扫描到新的需求目录
- **THEN** 系统解析新需求，生成 L1 需求节点
- **AND** 建立该需求与模块/文件的 business_map 边
- **AND** 更新 meta 中的需求快照信息

#### Scenario: 检测到需求归档
- **WHEN** 执行 `wpw graph update` 且某需求从 active 移动到 archived
- **THEN** 系统更新该需求节点的 `status.archived` 属性为 true
- **AND** 更新 `docPath` 属性为归档路径
- **AND** 节点 ID 和所有关联边保持不变
- **AND** 不删除节点，仅更新状态

#### Scenario: 检测到需求状态变更
- **WHEN** 执行 `wpw graph update` 且某需求的 .wpw.yaml 状态信息有更新
- **THEN** 系统更新该需求节点的 `status.artifacts` 属性
- **AND** 节点 ID 和关联边保持不变

#### Scenario: 仅需求变更、无源码变更时也更新
- **WHEN** 执行 `wpw graph update` 且源码文件无变更，但需求有变更
- **THEN** 系统仍执行需求层面的更新
- **AND** 不返回 null（不再因"无文件变更"直接跳过）

### Requirement: 图谱 Schema 版本校验
图谱元数据 SHALL 包含 schema 版本号。当代码中的 schema 版本与已存储图谱的版本不兼容时，系统 SHALL 提示用户执行全量重建，而非静默出错或生成不完整数据。

#### Scenario: 版本兼容时正常增量更新
- **WHEN** 执行 `wpw graph update` 且存储的 schema 版本与当前代码版本兼容
- **THEN** 正常执行增量更新流程

#### Scenario: 版本不兼容时提示重建
- **WHEN** 执行 `wpw graph update` 且存储的 schema 版本与当前代码版本不兼容
- **THEN** 系统输出警告信息，说明 schema 版本不兼容
- **AND** 提示用户执行 `wpw graph rebuild` 进行全量重建
- **AND** 自动降级为全量构建（或拒绝执行，由用户手动触发重建）

#### Scenario: 首次构建记录版本号
- **WHEN** 执行 `wpw graph build` 首次构建图谱
- **THEN** meta 数据中记录当前 schema 版本号
