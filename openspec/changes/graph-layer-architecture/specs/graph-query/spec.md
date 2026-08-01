## MODIFIED Requirements

### Requirement: 层级过滤参数适配新命名
图谱查询的层级过滤参数 SHALL 适配新的层级命名体系（C/L1/L2/L3）。

#### Scenario: 新层级值被接受
- **WHEN** 执行 `wpw graph query --level C,L1,L2,L3`
- **THEN** 所有层级值均被正确识别
- **AND** 返回对应层级的节点

#### Scenario: 旧层级值 L4 被拒绝
- **WHEN** 执行 `wpw graph query --level L4`
- **THEN** 系统提示无效层级值
- **AND** 建议使用新的层级命名 C/L1/L2/L3

#### Scenario: 向后兼容提示
- **WHEN** 用户使用旧层级值 L1/L2/L3
- **THEN** 系统输出警告，说明层级命名已变更
- **AND** 尝试映射：旧 L2→新 L1，旧 L3→新 L2，旧 L4→新 L3
- **AND** 旧 L1 映射为 C 层

### Requirement: 节点类型命名适配
节点类型输出 SHALL 与新层级体系保持一致。

#### Scenario: capability 类型为 C 层
- **WHEN** 查询 C 层节点
- **THEN** 节点 type 字段为 `capability`
- **AND** 节点 level 字段为 `C`

#### Scenario: 原 requirement 类型移除
- **WHEN** 遍历所有节点类型
- **THEN** 不存在 `requirement` 类型
- **AND** 新增 `capability` 类型

## ADDED Requirements

### Requirement: 按节点类型查询
系统 SHALL 支持按节点类型过滤查询，新增 `capability` 类型选项。

#### Scenario: 按 capability 类型查询
- **WHEN** 执行 `wpw graph query --type capability`
- **THEN** 返回所有 C 层能力节点

#### Scenario: 多类型混合查询
- **WHEN** 执行 `wpw graph query --type capability,function`
- **THEN** 返回能力节点和函数节点的混合结果
