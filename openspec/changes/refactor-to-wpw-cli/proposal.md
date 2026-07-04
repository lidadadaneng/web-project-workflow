## Why

当前 web-project-workflow（内部代号 soda）是一个公司内部的 AI 开发流程 Skill，其确定性逻辑分散在 `scripts/` 文件夹的 bash 脚本中，且强耦合内网遥测上报与 Cooper 知识库，难以独立分发、测试与维护。同时它的四阶段流程（ARD → Design → Plan → Test）缺少"接收客户原始需求"和"技术方案探索"环节，无法很好地承接正常的产品需求。

本改造将其重构为一个通用的工作流工具：以独立的 `wpw` CLI 为核心承载所有确定性逻辑，AI 层（Skill + 命令文件）只负责理解、生成与交互并调用 CLI 能力；完全剥离公司内部依赖；流程扩展为六阶段以承接正常需求。

## What Changes

- **新增 `wpw` CLI（Node.js / npm 包）**：统一承载原分散脚本的确定性逻辑，提供 `init / new / status / check / template / done / skip / decision / apply / task / archive / map / list` 等子命令，输出 JSON 供 AI 层消费
- **BREAKING**：流程从四阶段扩展为六阶段 `BRD → PRD → Explore → Design → Plan → Test → Apply`
  - 新增 BRD（接收客户原始需求，hybrid 输入：有输入则结构化整理，无输入则交互问答）
  - 原 ARD 改名为 PRD（产品需求文档）
  - 新增 Explore（技术方案探索，产出候选方案不拍板，用户可跳过，拍板后才进入 Design）
  - 原 impl 更名为 apply（与 openspec 语义对齐）
- **BREAKING**：命令前缀 `soda:*` → `wpw:*`，1:1 映射（`ard→prd`、`impl→apply`，其余同名）
- **架构变更**：AI 层不再直接操作分散脚本，改为调用 `wpw` CLI 完成状态管理、依赖检查、路径解析；SKILL.md 从"描述脚本执行"改为"描述如何协调 CLI + AI 决策"
- **新增强依赖检查（A 方案）**：`.wpw.yaml` 跟踪各阶段状态，阶段执行前 CLI 校验前置阶段；区分强依赖（`dependsOn`）与弱依赖（`optionalDeps`），explore 标记为 `skippable`
- **BREAKING**：完全剥离公司内部依赖——移除遥测上报段、内网 URL（`skillshub.intra...`）、Cooper 知识库依赖
- **schema 内置 CLI**：六阶段流程定义由 CLI 代码内置，不再依赖外部 schema 文件；`workflow.config.yaml` 保留用于项目差异化配置（project.type、模板覆盖）

## Capabilities

### New Capabilities

- `wpw-cli`: wpw 命令行工具能力——子命令接口、`.wpw.yaml` 状态管理、依赖检查引擎（强依赖/弱依赖/skippable）、模板路径解析（按 project.type）、项目类型嗅探、归档、任务标记、JSON 输出契约
- `wpw-six-phase`: 六阶段工作流能力——BRD/PRD/Explore/Design/Plan/Test/Apply 阶段定义、流转规则、AI-CLI 三段式调用契约、大纲确认机制、用户拍板决策记录

### Modified Capabilities

（无现有 specs——本项目 `openspec/specs/` 为空，本次改造全部为新增能力）

## Impact

- **新增代码**：`wpw` npm 包（`src/commands/`、`src/schema/`、`src/lib/`、`src/templates/`、`ai-layer/`）
- **重写/删除**：原 `SKILL.md` 重写为 CLI 协调说明；原 `scripts/` 逻辑收敛进 CLI；原 `commands/soda/` 改为 `commands/wpw/`
- **依赖**：用户侧新增 Node.js 运行时（`npm install -g wpw`）；移除内网遥测 endpoint 依赖
- **兼容性（BREAKING）**：原 `soda:*` 命令、ARD 文档命名、`scripts/` 直接调用方式不再适用；`docs/features/active/` 工作区路径迁移至 `wpw/active/`
- **分发方式**：从"随项目 clone + 全局/项目安装脚本"变为"npm 包 + `wpw init` 释放 AI 层到项目 `.claude/`"
