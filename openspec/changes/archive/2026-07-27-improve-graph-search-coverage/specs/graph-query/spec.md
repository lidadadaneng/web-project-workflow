## MODIFIED Requirements

### Requirement: 节点精准查询
系统 SHALL 支持按 `node_id` 精准查询节点完整属性，以及按层级、节点类型、所属文件、所属模块等维度批量过滤查询节点。节点查询结果 SHALL 包含 `filePath` 和 `parentName` 字段（如适用），用于区分同名节点。

#### Scenario: 按 node_id 查询单个节点
- **WHEN** 执行 `wpw graph query --id <node_id>`
- **THEN** 返回该节点的全部属性（层级、类型、名称、扩展属性、时间戳等）
- **AND** 若节点有 `filePath` / `parentName` 属性则一并返回

#### Scenario: 按层级批量查询节点
- **WHEN** 执行 `wpw graph query --level L4`
- **THEN** 返回所有 L4 层级的节点列表
- **AND** 支持 `--limit` 参数限制返回数量
- **AND** 每个节点信息包含 `filePath` 字段

#### Scenario: 查询不存在的节点
- **WHEN** 执行 `wpw graph query --id <不存在的 node_id>`
- **THEN** 返回空结果并输出提示

### Requirement: JSON 输出格式
所有查询命令 SHALL 支持 `--json` 参数，输出结构化 JSON 格式供程序调用。语义检索结果的 JSON 输出 SHALL 包含 `filePath` 和 `parentName` 字段（当节点存在这些属性时）。

#### Scenario: JSON 格式输出查询结果
- **WHEN** 在任意 graph 查询命令后添加 `--json` 参数
- **THEN** 标准输出为合法 JSON 格式
- **AND** 包含查询结果与状态信息

#### Scenario: 搜索结果 JSON 含去歧义信息
- **WHEN** 执行 `wpw graph search "onSubmit" --json`，返回多个同名函数节点
- **THEN** JSON 中每个结果对象包含 `filePath` 和 `parentName` 字段
- **AND** 消费方可通过 `parentName + "/" + name` 唯一标识每个结果
