## ADDED Requirements

### Requirement: 指定图谱查询
`wpw graph query` SHALL 接受 `--graph <stack>` 参数，仅在指定图谱内查询。缺省时查询 `default` 图谱。

#### Scenario: 指定图谱结构化查询
- **WHEN** 执行 `wpw graph query --level L2 --graph backend-springboot`
- **THEN** 仅在 `backend-springboot` 图谱内查询 L2 节点
- **AND** 不返回其他图谱的节点

#### Scenario: 指定图谱上下游查询
- **WHEN** 执行 `wpw graph query --downstream <nodeId> --graph frontend-vue`
- **THEN** 在 `frontend-vue` 图谱内追溯下游依赖
- **AND** 跨图谱不追溯

#### Scenario: 缺省查询 default 图谱
- **WHEN** 执行 `wpw graph query --level L2`（无 `--graph`）
- **THEN** 查询 `default` 图谱

#### Scenario: 图谱不存在时报错
- **WHEN** 执行 `wpw graph query --graph nonexistent`
- **THEN** 输出错误"图谱 nonexistent 不存在"并提示 `wpw graph list`
- **AND** 退出码非 0
