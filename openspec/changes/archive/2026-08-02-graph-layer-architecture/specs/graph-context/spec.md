## MODIFIED Requirements

### Requirement: 上下文层级参数适配
`wpw graph context` 命令的层级过滤参数 SHALL 适配新的层级命名（C/L1/L2/L3）。

#### Scenario: C 层作为上下文入口
- **WHEN** 执行 `wpw graph context "<query>" --level C`
- **THEN** 仅在 C 层能力节点中检索锚点
- **AND** 子图从 C 层沿 business_map 边扩展到结构层

#### Scenario: 排除 C 层的上下文
- **WHEN** 执行 `wpw graph context "<query>" --level L1,L2,L3`
- **THEN** 仅在结构层节点中检索锚点
- **AND** C 层不参与锚点选择

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

## ADDED Requirements

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

### Requirement: 压缩输出层级命名更新
上下文压缩输出的层级标记 SHALL 适配新的命名体系。

#### Scenario: 压缩文本使用新层级标记
- **WHEN** 生成压缩上下文文本
- **THEN** 节点层级显示为 C、L1、L2、L3
- **AND** C 层节点标注为 [能力]，L1 标注为 [模块]
