## Purpose

多图谱存储与寻址能力。负责按技术栈分文件夹维护独立图谱、命名图谱注册与列举、`--graph` 参数统一契约、默认图谱与单图谱向后兼容迁移。wpw 提供多图谱工具原语，技术栈判断与图谱选择由 AI 层决定。

## ADDED Requirements

### Requirement: 多图谱分文件夹存储
图谱 SHALL 按 `<stack>` 名分文件夹存储于 `wpw/knowledge/graph/<stack>/`，每个命名图谱独立含 `graph.jsonl` / `vectors.bin` / `mapping.json` / `meta.json`。多个命名图谱 SHALL 并列共存。

#### Scenario: 命名图谱存储路径
- **WHEN** 执行 `wpw graph build --name frontend-vue`
- **THEN** 图谱文件写入 `wpw/knowledge/graph/frontend-vue/` 子文件夹
- **AND** 该文件夹含 `graph.jsonl`、`vectors.bin`、`mapping.json`、`meta.json`

#### Scenario: 多图谱共存
- **WHEN** 先后执行 `wpw graph build --name frontend-vue` 与 `wpw graph build --name backend-springboot`
- **THEN** `wpw/knowledge/graph/` 下同时存在 `frontend-vue/` 与 `backend-springboot/` 两个子文件夹
- **AND** 两图谱相互独立，互不影响

#### Scenario: 同名图谱覆盖（幂等重建）
- **WHEN** 执行 `wpw graph build --name frontend-vue`，且 `frontend-vue/` 已存在
- **THEN** 提示将覆盖已有图谱
- **AND** 重建该图谱，替换原文件

### Requirement: 命名图谱注册与列举
系统 SHALL 通过枚举 `wpw/knowledge/graph/` 下含 `meta.json` 的子文件夹列举命名图谱。`wpw graph list` 命令 SHALL 输出所有图谱及其名称、节点数、边数、最后构建时间、scan root。

#### Scenario: 列举所有图谱
- **WHEN** 执行 `wpw graph list`
- **THEN** 输出 `wpw/knowledge/graph/` 下所有含 `meta.json` 的子文件夹作为图谱条目
- **AND** 每条目含图谱名、节点数、边数、builtAt、scanRoot

#### Scenario: JSON 输出
- **WHEN** 执行 `wpw graph list --json`
- **THEN** 返回图谱条目数组（含 name / totalNodes / totalEdges / builtAt / scanRoot）

#### Scenario: 无图谱时输出空
- **WHEN** `wpw/knowledge/graph/` 下无任何含 `meta.json` 的子文件夹
- **THEN** `wpw graph list` 输出"暂无图谱"提示
- **AND** 不报错

### Requirement: --graph 参数统一契约
`graph stat` / `query` / `search` / `context` / `update` / `rebuild` / `remove` SHALL 统一接受 `--graph <stack>` 参数指定操作的目标图谱。缺省时 SHALL 操作 `default` 图谱。

#### Scenario: 指定图谱查询
- **WHEN** 执行 `wpw graph stat --graph backend-springboot`
- **THEN** 输出 `backend-springboot` 图谱的统计信息
- **AND** 不影响其他图谱

#### Scenario: 缺省操作 default 图谱
- **WHEN** 执行 `wpw graph stat`（无 `--graph`）
- **THEN** 操作 `default` 图谱
- **AND** 行为与升级前单图谱一致

#### Scenario: 图谱不存在时报错
- **WHEN** 执行 `wpw graph query --graph nonexistent`
- **THEN** 输出错误"图谱 nonexistent 不存在"
- **AND** 提示运行 `wpw graph list` 查看可用图谱
- **AND** 退出码非 0

### Requirement: 默认图谱与向后兼容
无 `--name` 的 `graph build` SHALL 写入 `default` 图谱。检索命令无 `--graph` 时 SHALL 操作 `default`。现有单图谱项目 SHALL 无感升级。

#### Scenario: 无 --name 构建写入 default
- **WHEN** 执行 `wpw graph build`（无 `--name`）
- **THEN** 图谱写入 `wpw/knowledge/graph/default/`

#### Scenario: 现有单图谱迁移
- **WHEN** 首次升级，`wpw/knowledge/graph/` 下存在旧式直写文件（`graph.jsonl` 直接在 graph/ 下）且无 `default/` 子文件夹
- **THEN** 创建 `default/` 子文件夹
- **AND** 将旧式文件移动到 `default/`
- **AND** 输出迁移文件清单供核对

#### Scenario: 迁移不破坏已有 default
- **WHEN** 升级时 `default/` 已存在
- **THEN** 不执行迁移
- **AND** 不覆盖 `default/` 内容

### Requirement: 图谱元数据记录图谱名与 scan root
每个图谱的 `meta.json` SHALL 记录 `graphName`（图谱名）与 `scanRoot`（扫描根子目录）字段，供 `graph list` 与 `graph update` 复用。

#### Scenario: meta 记录图谱名与 scan root
- **WHEN** 执行 `wpw graph build --name backend-springboot --root backend`
- **THEN** `meta.json` 含 `graphName: "backend-springboot"` 与 `scanRoot: "backend"`

#### Scenario: update 复用 scan root
- **WHEN** 执行 `wpw graph update --graph backend-springboot`
- **THEN** 从 `meta.json` 读取 `scanRoot`，无需用户重复传 `--root`
- **AND** 按该 scan root 扫描变更文件

### Requirement: 图谱删除
`wpw graph remove <stack>` SHALL 删除指定命名图谱的整个子文件夹。

#### Scenario: 删除命名图谱
- **WHEN** 执行 `wpw graph remove frontend-vue`
- **THEN** 删除 `wpw/knowledge/graph/frontend-vue/` 整个文件夹
- **AND** 不影响其他图谱

#### Scenario: 删除不存在的图谱
- **WHEN** 执行 `wpw graph remove nonexistent`
- **THEN** 输出错误"图谱 nonexistent 不存在"
- **AND** 退出码非 0
