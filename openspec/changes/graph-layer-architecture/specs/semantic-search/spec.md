## MODIFIED Requirements

### Requirement: 语义检索层级过滤适配
语义检索的层级过滤参数 SHALL 适配新的层级命名（C/L1/L2/L3）。

#### Scenario: C 层可被检索
- **WHEN** 执行 `wpw graph search "<query>" --level C`
- **THEN** 仅在 C 层能力节点中进行语义检索
- **AND** 返回匹配的能力节点列表

#### Scenario: 多层混合检索
- **WHEN** 执行 `wpw graph search "<query>" --level C,L1,L2,L3`
- **THEN** 在所有层级节点中进行语义检索
- **AND** 结果按相似度混合排序

## ADDED Requirements

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
