## ADDED Requirements

### Requirement: 六阶段流程顺序

工作流 SHALL 按六阶段顺序流转：`BRD → PRD → Explore → Design → Plan → Test → Apply`。每阶段对应一个文档产物，落盘于 `wpw/active/<需求名>/`。

#### Scenario: 阶段强依赖

- **WHEN** `wpw:design` 执行前
- **THEN** CLI 依赖检查 SHALL 校验 `prd.status == done`，否则阻断

### Requirement: BRD 阶段（业务需求文档）

BRD SHALL 接收客户原始需求，面向业务方（通常非技术背景），支持 hybrid 输入：有输入则结构化整理为业务背景/目标/用户故事/约束/成功指标；无输入则用 AskUserQuestion 逐项交互问答。无前置依赖。

BRD SHALL 判断需求完整性，缺失时仅就业务问题（目标/范围/优先级/约束）澄清，不问技术实现。BRD SHALL 不主动讨论技术文件/模块/框架，除非用户主动问及技术实现。BRD SHALL 由 AI 独立分析实现成本，按业务可理解的步骤估算每步人力（人）与时间（人日），填入"成本评估"表供业务方决策，不向用户征询技术细节。

#### Scenario: 有输入整理

- **WHEN** 用户提供客户需求描述
- **THEN** AI 结构化整理为 BRD 大纲

#### Scenario: 无输入问答

- **WHEN** 用户未提供输入
- **THEN** AI 用 AskUserQuestion 逐项询问业务背景/目标/约束等

#### Scenario: 完整性判断

- **WHEN** 关键业务信息缺失（目标不清/范围模糊/无成功指标）
- **THEN** AI 追加业务澄清问题（不问技术实现），齐全后再生成大纲

#### Scenario: 不主动谈技术文件

- **WHEN** 用户未主动提及技术实现
- **THEN** AI 不在 BRD 中讨论具体技术文件/模块/框架，技术方案留给 Explore/Design

#### Scenario: 成本评估

- **WHEN** 生成 BRD
- **THEN** AI 独立按业务可理解的步骤估算人力与时间，填入成本评估表，不向用户征询技术细节

### Requirement: PRD 阶段（产品需求文档）

PRD SHALL 基于 BRD 生成，包含功能清单、优先级、验收标准、非功能需求。强依赖 BRD。

#### Scenario: 生成 PRD

- **WHEN** `brd.done` 且执行 `wpw:prd`
- **THEN** 基于 BRD 生成 PRD 大纲，等用户确认后落盘

### Requirement: Explore 阶段（技术方案探索）

Explore SHALL 基于 PRD 产出多个候选方案、方案对比、风险识别、推荐方向，不拍板。标记为 `skippable`，用户可跳过。

#### Scenario: 产出候选方案

- **WHEN** `prd.done` 且执行 `wpw:explore`
- **THEN** 生成 Explore 文档含多方案对比与推荐方向

#### Scenario: 用户跳过

- **WHEN** 用户决定跳过 explore
- **THEN** 标记 `status.explore = skipped`，后续 design 不阻断

### Requirement: Explore 拍板决策

Explore 落盘后 SHALL 由用户确认采纳的方案，记录到 `decisions.explore.chosenOption`，方可进入 Design。

#### Scenario: 用户拍板

- **WHEN** 用户确认采纳方案 A
- **THEN** CLI 记录 `decisions.explore.chosenOption = "方案A"`

#### Scenario: 未拍板进入 Design

- **WHEN** `explore.done` 但未拍板
- **THEN** `wpw check design` 发出 `warnings` 提示需拍板（软提示）

### Requirement: Design 阶段（技术方案设计）

Design SHALL 基于 PRD（强依赖）与 Explore（弱依赖，有则读）生成技术设计文档。若 Explore 存在 SHALL 需用户拍板后进入。

#### Scenario: 有 Explore 拍板

- **WHEN** `explore.done` 且已拍板
- **THEN** Design 基于拍板方案深化设计

#### Scenario: 无 Explore

- **WHEN** `explore.skipped`
- **THEN** Design 仅基于 PRD 生成

### Requirement: Plan 与 Test 阶段

Plan SHALL 基于 Design 生成开发计划（含任务清单）。Test SHALL 基于 Design 与 Plan 生成测试方案。

#### Scenario: 生成 Plan

- **WHEN** `design.done` 且执行 `wpw:plan`
- **THEN** 生成 Plan 含可执行任务清单

#### Scenario: 生成 Test

- **WHEN** `design.done` 且 `plan.done`
- **THEN** 生成 Test 方案

### Requirement: Apply 阶段（编码实施）

Apply SHALL 基于 Plan 逐任务实施编码，任务状态流转 `[ ]`→`[🔄]`→`[x]`，支持 `--from <任务编号>` 断点恢复。

#### Scenario: 逐任务编码

- **WHEN** 执行 `wpw:apply`
- **THEN** 按 Plan 任务逐个实施，每任务完成后立即标记

#### Scenario: 断点恢复

- **WHEN** 执行 `wpw:apply --from 5`
- **THEN** 从任务 5 继续实施

### Requirement: 大纲确认机制

每个文档阶段落盘前 SHALL 输出大纲让用户确认，禁止静默写文件。

#### Scenario: 确认后落盘

- **WHEN** AI 生成阶段文档内容
- **THEN** 先输出大纲，等用户确认后才落盘到文件

### Requirement: AI-CLI 三段式契约

每个 `/wpw:xxx` 阶段命令 SHALL 遵循三段式：CLI 准备（`new`/`check`/`template`）→ AI 生成与交互（大纲/确认/撰写落盘）→ CLI 收尾（`done`/`decision`/`skip`）+ AI 后处理（hook/Humanizer）。

#### Scenario: 三段式执行

- **WHEN** 执行 `wpw:prd`
- **THEN** 依次执行：`wpw check` → AI 生成大纲 → 用户确认 → 落盘 → `wpw done` → hook + Humanizer

### Requirement: 命令前缀与映射

命令前缀 SHALL 为 `wpw:*`，与原 `soda:*` 1:1 映射：`ard→prd`、`impl→apply`，其余同名（`design`/`plan`/`test`/`cr`/`map`/`archive`/`exp`/`sync`/`init`）。新增 `wpw:brd` 与 `wpw:explore`。

#### Scenario: 命令映射

- **WHEN** 用户执行 `/wpw:prd`
- **THEN** 产出 PRD 文档（等价于原 `soda:ard` 产出）

#### Scenario: 新增命令

- **WHEN** 用户执行 `/wpw:brd` 或 `/wpw:explore`
- **THEN** 分别执行 BRD 接收与 Explore 探索流程
