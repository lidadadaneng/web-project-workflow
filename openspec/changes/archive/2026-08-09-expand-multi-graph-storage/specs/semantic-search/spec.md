## ADDED Requirements

### Requirement: 指定图谱语义检索
`wpw graph search` SHALL 接受 `--graph <stack>` 参数，仅在指定图谱的向量索引内检索。缺省时检索 `default` 图谱。

#### Scenario: 指定图谱语义检索
- **WHEN** 执行 `wpw graph search "用户登录" --graph frontend-vue`
- **THEN** 仅在 `frontend-vue` 图谱的向量索引内检索
- **AND** 不返回其他图谱的节点

#### Scenario: 指定后端图谱检索
- **WHEN** 执行 `wpw graph search "推荐接口" --graph backend-springboot`
- **THEN** 仅在 `backend-springboot` 图谱内检索
- **AND** 返回 Java 方法/类等后端节点

#### Scenario: 缺省检索 default 图谱
- **WHEN** 执行 `wpw graph search "登录"`（无 `--graph`）
- **THEN** 检索 `default` 图谱

#### Scenario: 指定图谱无向量索引
- **WHEN** 执行 `wpw graph search "x" --graph backend-springboot`，但该图谱向量索引不存在（构建时 embedding 关闭）
- **THEN** 输出提示该图谱无向量索引
- **AND** 建议重新 `wpw graph build --name backend-springboot --root <dir>` 开启 embedding
