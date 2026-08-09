## ADDED Requirements

### Requirement: 按子目录构建命名图谱
`wpw graph build` SHALL 接受 `--name <stack>` 与 `--root <subdir>` 参数。`--name` 指定图谱名（写入 `wpw/knowledge/graph/<stack>/`）；`--root` 指定扫描根子目录（相对工作根）。可多次执行产出多个命名图谱。

#### Scenario: 按子目录构建命名图谱
- **WHEN** 执行 `wpw graph build --name frontend-vue --root frontend`
- **THEN** 扫描 `<工作根>/frontend/` 下的源码
- **AND** 图谱写入 `wpw/knowledge/graph/frontend-vue/`
- **AND** `meta.json` 记录 `graphName: "frontend-vue"` 与 `scanRoot: "frontend"`

#### Scenario: 多次执行产出多图谱
- **WHEN** 先后执行 `wpw graph build --name frontend-vue --root frontend` 与 `wpw graph build --name backend-springboot --root backend`
- **THEN** 产出 `frontend-vue` 与 `backend-springboot` 两个独立图谱
- **AND** 各自扫描对应子目录

#### Scenario: 无 --root 扫描工作根
- **WHEN** 执行 `wpw graph build --name my-graph`（无 `--root`）
- **THEN** 扫描工作根
- **AND** 图谱写入 `wpw/knowledge/graph/my-graph/`

#### Scenario: 命名格式校验
- **WHEN** `--name` 值非 kebab-case 或为空
- **THEN** 输出错误提示命名格式要求
- **AND** 退出码非 0

### Requirement: 按 scan root 独立嗅探项目类型
每次 `graph build` SHALL 按其 `--root`（或工作根）独立嗅探项目类型，据此推断模块。多图谱下不同图谱可有不同项目类型（前端图谱 = frontend-h5，后端图谱 = backend-java）。

#### Scenario: 前端子目录嗅探为前端类型
- **WHEN** 执行 `wpw graph build --name frontend-vue --root frontend`，`frontend/` 含 `package.json` 与 vue 依赖
- **THEN** 项目类型嗅探为 `frontend-h5`
- **AND** 模块推断按前端 moduleRoots（src/modules 等）

#### Scenario: 后端子目录嗅探为 backend-java
- **WHEN** 执行 `wpw graph build --name backend-springboot --root backend`，`backend/` 含 `pom.xml`
- **THEN** 项目类型嗅探为 `backend-java`
- **AND** 模块推断按 Spring Boot 业务包（见 expand-graph-backend-java）

#### Scenario: 不同图谱独立项目类型
- **WHEN** 同一工作根下先后构建 `frontend-vue`（--root frontend）与 `backend-springboot`（--root backend）
- **THEN** 两图谱的项目类型分别为 `frontend-h5` 与 `backend-java`
- **AND** 互不影响

### Requirement: 增量更新与重建支持命名图谱
`wpw graph update` 与 `wpw graph rebuild` SHALL 接受 `--graph <stack>` 参数，操作指定图谱。update SHALL 从该图谱的 `meta.json` 读取 `scanRoot` 作为扫描根。

#### Scenario: 命名图谱增量更新
- **WHEN** 执行 `wpw graph update --graph backend-springboot`
- **THEN** 从 `backend-springboot/meta.json` 读取 `scanRoot`
- **AND** 按该 scan root 扫描变更文件并增量更新该图谱
- **AND** 不影响其他图谱

#### Scenario: 命名图谱强制重建
- **WHEN** 执行 `wpw graph rebuild --graph frontend-vue`
- **THEN** 清空 `frontend-vue/` 并按其 `scanRoot` 全量重建
- **AND** 不影响其他图谱

#### Scenario: update 时 meta 缺失 scanRoot
- **WHEN** 执行 `wpw graph update --graph old-graph`，但 `meta.json` 无 `scanRoot` 字段（旧图谱）
- **THEN** 提示该图谱缺少 scanRoot 信息
- **AND** 建议执行 `wpw graph rebuild --graph old-graph` 重建以补全元数据

### Requirement: 构建统计按图谱独立
`wpw graph build` 的统计输出 SHALL 仅反映本次构建的命名图谱（节点/边/向量数、各阶段耗时），不包含其他图谱。

#### Scenario: 统计仅含当前图谱
- **WHEN** 执行 `wpw graph build --name backend-springboot --root backend`
- **THEN** 统计输出的节点/边/向量数仅含 `backend-springboot` 图谱
- **AND** 不累加其他图谱数据
