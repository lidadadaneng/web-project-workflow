## Purpose

知识图谱结构化查询能力。提供节点查询、依赖链路查询、最短路径查询、统计概览等功能，全部基于内存索引，零数据库依赖。

## Requirements

### Requirement: 节点精准查询
系统 SHALL 支持按 `node_id` 精准查询节点完整属性，以及按层级、节点类型、所属文件、所属模块等维度批量过滤查询节点。

#### Scenario: 按 node_id 查询单个节点
- **WHEN** 执行 `wpw graph query --id <node_id>`
- **THEN** 返回该节点的全部属性（层级、类型、名称、扩展属性、时间戳等）

#### Scenario: 按层级批量查询节点
- **WHEN** 执行 `wpw graph query --level L4`
- **THEN** 返回所有 L4 层级的节点列表
- **AND** 支持 `--limit` 参数限制返回数量

#### Scenario: 查询不存在的节点
- **WHEN** 执行 `wpw graph query --id <不存在的 node_id>`
- **THEN** 返回空结果并输出提示

### Requirement: 依赖链路查询
系统 SHALL 支持查询指定节点的上游依赖、下游依赖列表，可配置查询深度与权重阈值；并支持查询两个节点之间的最短关联路径。

#### Scenario: 查询下游依赖
- **WHEN** 执行 `wpw graph query --downstream <node_id> --depth 2 --min-weight 0.7`
- **THEN** 返回从该节点出发、深度 ≤ 2、边权重 ≥ 0.7 的所有下游依赖节点
- **AND** 每条结果包含目标节点、路径深度、累计权重

#### Scenario: 查询上游依赖
- **WHEN** 执行 `wpw graph query --upstream <node_id> --depth 1`
- **THEN** 返回所有直接依赖该节点的上游节点

#### Scenario: 查询两节点最短路径
- **WHEN** 执行 `wpw graph query --path --from <node_id_a> --to <node_id_b>`
- **THEN** 返回两节点之间的最短依赖链路（节点序列 + 边序列）
- **AND** 若两节点不连通，返回空路径

### Requirement: 图谱统计概览
系统 SHALL 支持通过 `wpw graph stat` 命令输出图谱核心统计指标。

#### Scenario: 查看图谱统计
- **WHEN** 用户执行 `wpw graph stat`
- **THEN** 输出各层级节点数量、各类关系边数量、向量索引规模、最后构建时间
- **AND** 若图谱不存在，输出提示信息并建议执行 `wpw graph build`

### Requirement: JSON 输出格式
所有查询命令 SHALL 支持 `--json` 参数，输出结构化 JSON 格式供程序调用。

#### Scenario: JSON 格式输出查询结果
- **WHEN** 在任意 graph 查询命令后添加 `--json` 参数
- **THEN** 标准输出为合法 JSON 格式
- **AND** 包含查询结果与状态信息
