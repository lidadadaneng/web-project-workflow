## Why

当前知识图谱采用 L1(需求)-L2(模块)-L3(文件)-L4(代码元素) 四层模型，但存在几个结构性问题：

1. **L1 定位错误**：L1（需求）与 L2（模块）之间是 business_map 业务映射关系，不是 contain 层级包含关系。L1 本质上是业务维度的索引，而非结构层级的顶端。"L1" 这个命名具有误导性。
2. **需求非稳态**：L1 节点来自 wpw 活跃/归档需求，是临时变更而非稳态业务能力。图谱应该沉淀持久的业务能力，而非随需求增删波动。
3. **粒度倒挂**：若 L1 是细粒度业务能力，其粒度反而小于 L2 模块，层级编号与粒度大小不一致。
4. **锚点策略缺失**：语义检索将各层节点混排取 Top-K 作为锚点，L1 粒度粗会撑大子图、引入噪声，需要动态的层级权重调节机制。

## What Changes

**BREAKING** 图谱分层架构重构，从"四层结构模型"升级为"业务能力层 + 三层结构模型"。

- **BREAKING** 层级重命名：原 L2/L3/L4 提升为 L1/L2/L3（模块/文件/代码元素），原 L1 需求节点改为 C 层（Capability 业务能力层）
- **BREAKING** C 层从"需求节点"变为"业务能力节点"，来源从 wpw 需求目录改为 wpw/specs/ 稳态能力规范（OpenSpec spec 格式）
- **BREAKING** Schema 版本升级到 3.0.0，旧图谱不兼容，需全量重建
- 新增需求归档能力沉淀机制：需求归档时 AI 生成/更新 wpw/specs/ 下的能力 spec，合并 business_map 证据
- 新增置信度衰减加权法（Confidence Decay Weighting）：语义检索锚点选择时，根据 C 层置信度动态调整 L1 节点权重（指数衰减函数），平衡精准率与召回率
- 需求节点不再进入图谱（活跃需求和归档需求均仅存在于 wpw 目录，不作为图谱节点）
- AI 层文档全面更新：命令命名、图谱说明、检索示例统一为新层级体系

## Capabilities

### New Capabilities

- `capability-layer`: C 层业务能力节点，从 wpw/specs/ 读取，作为业务维度的图谱索引
- `confidence-decay-anchoring`: 置信度衰减加权锚点选择算法，动态调节 L1 层在子图扩展中的权重

### Modified Capabilities

- `graph-build`: 层级重命名（L1→C, L2→L1, L3→L2, L4→L3），C 层来源变更，需求节点移出图谱
- `graph-query`: 层级参数与输出适配新命名体系
- `semantic-search`: 支持分层置信度衰减加权的锚点选择
- `graph-context`: 锚点选择策略升级为置信度衰减加权法，子图扩展路径适配新层级

## Impact

- 影响范围：图谱核心模块全部（types、builders、parsers、search、context、commands）+ AI 层所有引用图谱的文档
- 向后兼容：完全不兼容，schema 版本从 2.0.0 升至 3.0.0，旧图谱需全量重建
- 数据迁移：无迁移路径，直接全量重建
- 依赖：需 wpw 归档流程配合生成 wpw/specs/ 能力规范
