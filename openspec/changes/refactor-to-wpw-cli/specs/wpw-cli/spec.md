## ADDED Requirements

### Requirement: CLI 子命令集

wpw CLI SHALL 提供以下子命令：`init`、`new`、`list`、`status`、`check`、`template`、`done`、`skip`、`decision`、`apply`、`task`、`archive`、`map`。`status`、`check`、`apply`、`list`、`map` SHALL 支持 `--json` 输出供 AI 层消费。

#### Scenario: 列出子命令

- **WHEN** 用户执行 `wpw --help`
- **THEN** 系统显示所有子命令及简要说明

### Requirement: 需求创建

`wpw new <需求名>` SHALL 创建需求目录 `wpw/active/<需求名>/` 并生成 `.wpw.yaml` 初始状态文件（所有阶段 `status: pending`）。需求已存在时 SHALL 幂等跳过，不报错。

#### Scenario: 新建需求

- **WHEN** 执行 `wpw new login`
- **THEN** 创建 `wpw/active/login/.wpw.yaml`，所有阶段 status 为 pending

#### Scenario: 幂等

- **WHEN** 执行 `wpw new login` 且需求已存在
- **THEN** 不报错，保留现有状态不变

### Requirement: 状态查询

`wpw status [需求名] --json` SHALL 返回各阶段 status、decisions、progress、schemaName。

#### Scenario: 查状态

- **WHEN** 执行 `wpw status login --json`
- **THEN** 返回 JSON 含 `schemaName`、`artifacts[].status`、`decisions`、`progress`

### Requirement: 依赖检查

`wpw check <阶段> -c <需求> --json` SHALL 按内置 schema 校验前置阶段，返回 `{ canProceed, missing, warnings }`。强依赖（`dependsOn`）未 `done` 时 `canProceed=false`。弱依赖（`optionalDeps`）不阻断。`skippable` 阶段可为 `skipped`。

#### Scenario: 强依赖未完成

- **WHEN** 执行 `wpw check design -c login`，且 `prd.status != done`
- **THEN** 返回 `canProceed=false`，`missing=["prd"]`

#### Scenario: 弱依赖存在

- **WHEN** 执行 `wpw check design -c login`，`prd.done` 且 `explore.done`
- **THEN** `canProceed=true`，`warnings=[]`

#### Scenario: explore 跳过

- **WHEN** `explore.status == skipped`
- **THEN** `check design` 不因 explore 阻断，`canProceed=true`

#### Scenario: explore 未拍板

- **WHEN** `explore.done` 但 `decisions.explore.chosenOption` 为空
- **THEN** `check design` 返回 `warnings` 提示需拍板（不阻断）

### Requirement: 模板路径解析

`wpw template <阶段> -c <需求>` SHALL 返回模板文件路径。优先级：`workflow.config.yaml` 的 `commands.<cmd>.output`（非空）→ `project.type` 默认模板（Fe/Server）→ 文件嗅探（`package.json`/`pom.xml`/`go.mod`）。

#### Scenario: 配置指定模板

- **WHEN** `workflow.config.yaml` 中 `commands.design.output` 非空
- **THEN** 返回该指定模板路径

#### Scenario: 按 project.type 选默认

- **WHEN** `output` 为空且 `project.type=frontend-h5`
- **THEN** 返回 `Design-Fe` 模板路径

#### Scenario: auto 嗅探失败返回两套

- **WHEN** `output` 为空且 `project.type=auto` 且嗅探不到任何项目文件（package.json/pom.xml/go.mod 均无）
- **THEN** 返回 Fe + Server 两套模板路径，由 AI/用户选择合适的模板

### Requirement: 阶段状态标记

`wpw done`、`wpw skip`、`wpw decision` SHALL 更新 `.wpw.yaml` 对应阶段 status 与 decisions。

#### Scenario: 标记完成

- **WHEN** 执行 `wpw done prd -c login`
- **THEN** `.wpw.yaml` 中 `status.prd = done`

#### Scenario: 跳过 explore

- **WHEN** 执行 `wpw skip explore -c login`
- **THEN** `status.explore = skipped`

#### Scenario: 记录拍板决策

- **WHEN** 执行 `wpw decision explore -c login --option "方案A"`
- **THEN** `decisions.explore.chosenOption = "方案A"`

### Requirement: 实施准备

`wpw apply <需求> --json` SHALL 返回 `contextFiles`（各阶段文档路径）、`tasks`（从 Plan 解析）、`progress`、`state`。前置未完成时 `state=blocked`。

#### Scenario: 准备实施

- **WHEN** 执行 `wpw apply login --json` 且 `plan.done`
- **THEN** 返回 `contextFiles.prd/design/plan` 路径 + `tasks` 数组 + `state=ready`

#### Scenario: 前置未完成

- **WHEN** `plan.status != done`
- **THEN** 返回 `state=blocked` 并提示缺失阶段

### Requirement: 任务标记

`wpw task <需求> --mark <编号> <状态>` SHALL 更新 Plan 文档中对应任务标记（`[ ]`→`[🔄]`→`[x]`）并同步 `.wpw.yaml` 的 `progress`。

#### Scenario: 标记任务进行中

- **WHEN** 执行 `wpw task login --mark 3 in-progress`
- **THEN** Plan 文档第 3 个任务变为 `[🔄]`，`progress` 更新

### Requirement: 归档

`wpw archive <需求>` SHALL 将 `wpw/active/<需求>/` 移至 `wpw/archived/YYYY-MM/<需求>/`。

#### Scenario: 归档完成需求

- **WHEN** 执行 `wpw archive login`
- **THEN** 目录迁移到 `wpw/archived/2026-07/login/`

### Requirement: 项目初始化

`wpw init` SHALL 生成 `workflow.config.yaml`（已存在则只更新路径字段）、创建 `wpw/` 目录结构（`active`/`archived`/`knowledge`，知识库统一纳入 `wpw/`，不再保留 `docs/`）、释放 AI 层（SKILL.md + 命令文件 + hooks）到 `.claude/`、释放联动 Skill 快照到 `.claude/skills/`。

#### Scenario: 首次初始化

- **WHEN** 执行 `wpw init` 于新项目
- **THEN** 生成 `workflow.config.yaml` + `wpw/` 目录 + `.claude/skills/wpw-workflow/` + `.claude/commands/wpw/`

#### Scenario: 已存在配置

- **WHEN** `workflow.config.yaml` 已存在
- **THEN** 只更新路径字段，保留用户自定义配置

### Requirement: 联动 Skill 管理

`wpw` SHALL 通过 `linked-skills.json` 声明联动 Skill 来源（`brainstorming`←`obra/superpowers` 的 `skills/brainstorming`、`code-reviewer`←`obra/superpowers` 的 `skills/requesting-code-review`、`Humanizer-zh`←`op7418/Humanizer-zh` 根）。`wpw init` SHALL 释放打包快照到 `.claude/skills/<installAs>/`。`wpw skills update` SHALL 用 `git clone --depth 1` 从各源仓库默认分支实时拉取最新版到当前项目 `.claude/skills/`，并写 `.linked-skills-manifest.json` 记录 commit。`wpw skills list` SHALL 读取 manifest 显示来源与版本。

#### Scenario: init 释放快照

- **WHEN** 执行 `wpw init` 且存在打包快照
- **THEN** 联动 Skill 释放到 `.claude/skills/{brainstorming,code-reviewer,Humanizer-zh}/`

#### Scenario: 不残留快照目录

- **WHEN** `wpw init` 释放 AI 层与联动 Skill
- **THEN** 仅在 `.claude/skills/<installAs>/` 安装联动 Skill，不在项目内残留 `.claude/linked-skills/` 快照目录

#### Scenario: 快照缺失提示

- **WHEN** 执行 `wpw init` 但无打包快照
- **THEN** 提示运行 `wpw skills update` 实时拉取，不中断初始化

#### Scenario: 实时更新

- **WHEN** 执行 `wpw skills update`
- **THEN** 从各源仓库默认分支克隆最新版到 `.claude/skills/`，manifest 记录 repo/ref/commit/抓取时间

#### Scenario: 版本列表

- **WHEN** 执行 `wpw skills list`
- **THEN** 读取 manifest 显示每个联动 Skill 的来源仓库、分支、commit 与抓取时间

#### Scenario: 引用节点明示

- **WHEN** 查看 SKILL.md 或各阶段命令文件
- **THEN** 每个联动 Skill 标注其引用阶段：`@brainstorming`→`/wpw:brd`、`/wpw:explore`；`@code-reviewer`→`/wpw:cr`、`/wpw:apply` 收尾；`@Humanizer-zh`→各文档阶段 `after_*` hook

#### Scenario: 维护者更新快照

- **WHEN** 维护者执行 `npm run update-skills`
- **THEN** 抓取最新版到 `ai-layer/linked-skills/` 作为打包快照，供 `wpw init` 释放

### Requirement: 无内网依赖

wpw CLI MUST NOT 包含遥测上报、内网 URL、Cooper 知识库调用。所有命令 SHALL 在无内网环境下正常执行。

#### Scenario: 离线运行

- **WHEN** 在无内网环境执行任意 `wpw` 命令
- **THEN** 命令正常完成，不发起任何网络请求
