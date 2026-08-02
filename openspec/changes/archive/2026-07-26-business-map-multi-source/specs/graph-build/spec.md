## ADDED Requirements

### Requirement: 业务-代码多源证据映射
系统 SHALL 通过多源证据融合自动建立业务需求（L1）与模块/文件/代码元素（L2/L3/L4）之间的 `business_map` 关联边，无需手动标注。证据来源 SHALL 包括：文档提取（doc-extract）、语义匹配（semantic）、Git 历史追溯（git-history）、命名匹配（name-match）；AI 校准（ai-refine）为可选增强（首版不实现）。同一目标被多源命中时，系统 SHALL 采用 noisy-OR 公式聚合权重：`finalWeight = 1 − ∏(1 − baseWeightᵢ)`，上限 0.95。

#### Scenario: 文档提取证据
- **WHEN** 需求文档（PRD 依赖模块字段 / Design 模块划分表 / 接口设计章节）中抽取到模块名且该模块存在于图谱
- **THEN** 生成 `source: 'doc-extract'` 证据，baseWeight 0.85
- **AND** 参与该需求的 noisy-OR 权重聚合

#### Scenario: 语义匹配证据
- **WHEN** 向量索引存在且需求节点向量与某 L2/L3 节点向量的余弦相似度 ≥ 语义映射阈值
- **THEN** 生成 `source: 'semantic'` 证据，baseWeight 由相似度线性映射（上限 0.7）
- **AND** 每个需求取相似度 Top-K（默认 5）个候选目标
- **AND** 仅对 L2 模块节点与 L3 文件节点生成语义证据（不对 L4 元素逐一生成，控制规模）

#### Scenario: Git 历史追溯证据
- **WHEN** 项目为 Git 仓库且 `mapping.gitHistory` 为 true
- **THEN** 系统按需求名与抽取关键词调用 `git log` 检索匹配 commit
- **AND** 统计这些 commit 修改的文件频次
- **AND** 对频次 ≥ `mapping.gitMinFreq`（默认 2）的文件节点生成 `source: 'git-history'` 证据，baseWeight 由频次归一化映射（上限 0.7）

#### Scenario: 命名匹配证据
- **WHEN** 需求名（含中文）与目标节点名经中英文词典（≥30 词条）或前缀/包含匹配命中
- **THEN** 生成 `source: 'name-match'` 证据，baseWeight 依匹配强度（直接包含 0.6 / 前缀 0.5 / 词典 0.45），上限 0.7

#### Scenario: 多源 noisy-OR 聚合
- **WHEN** 同一目标节点被多个证据源命中
- **THEN** 系统按 `1 − ∏(1 − wᵢ)` 聚合最终权重，上限 0.95
- **AND** 多源命中的权重严格高于任一单源权重（除非已达上限）

#### Scenario: 低权重边剪枝
- **WHEN** 某目标聚合后权重 < 0.3
- **THEN** 不生成 `business_map` 边

### Requirement: business_map 边溯源标签
每条 `business_map` 边 SHALL 携带 `source` 字段，记录支撑该边的最权威证据来源。证据源权威性排名 SHALL 为：structure(10) > doc-extract(8) > ai-refine(7) > git-history(5) > semantic(4) > name-match(2)。当多源命中同一目标时，`source` 取排名最高者。

#### Scenario: 多源命中取最权威源
- **WHEN** 同一目标同时被 semantic（rank 4）与 doc-extract（rank 8）命中
- **THEN** 生成的 `business_map` 边 `source` 字段为 `doc-extract`
- **AND** 与证据被收集的顺序无关（不受 push 顺序影响）

#### Scenario: 单源命中保留该源
- **WHEN** 目标仅被 name-match 命中
- **THEN** 边 `source` 字段为 `name-match`

## MODIFIED Requirements

### Requirement: aggregateWeights 返回溯源信息
`aggregateWeights` 函数 SHALL 在返回聚合权重的同时，返回每个目标的最权威证据源，供 `business_map` 边溯源标签使用。返回值 SHALL 包含权重映射与来源映射，二者键一致。

#### Scenario: 返回权重与来源
- **WHEN** 调用 `aggregateWeights(evidences)` 处理含多源命中的证据集合
- **THEN** 返回值包含每个目标节点的聚合权重
- **AND** 返回值包含每个目标节点的最权威证据源
- **AND** 调用方据此设置 `business_map` 边的 `source` 字段，而非依赖证据数组顺序

### Requirement: 语义映射回填阶段
`buildGraph` 流程 SHALL 在向量索引构建完成后，新增"语义映射回填"阶段，将语义相似性转化为 `business_map` 证据并参与聚合。该阶段 SHALL 在 `business_map` 边生成主流程内完成，无需单独的图谱重建。

#### Scenario: 向量存在时回填
- **WHEN** 执行 `wpw graph build` 且向量索引构建成功
- **THEN** 语义映射回填阶段对每个 L1 需求节点检索相似 L2/L3 节点
- **AND** 生成的 semantic 证据与 doc-extract/git-history/name-match 证据一并喂入 noisy-OR 聚合

#### Scenario: 向量缺失时降级
- **WHEN** 向量索引构建失败或 `embedding.enabled: false`
- **THEN** 跳过语义映射回填阶段
- **AND** 仍基于 doc-extract/git-history/name-match 三源聚合生成 `business_map` 边
- **AND** 输出提示"语义映射源已跳过"

#### Scenario: 非 Git 仓库降级
- **WHEN** 项目非 Git 仓库或 `mapping.gitHistory: false`
- **THEN** 跳过 Git 历史追溯
- **AND** 仍基于其余源聚合生成 `business_map` 边
