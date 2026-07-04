---
name: wpw-workflow
description: AI 驱动的六阶段 Web 项目开发工作流 - BRD→PRD→Explore→Design→Plan→Test→Apply，CLI 承载确定性逻辑，AI 负责理解生成，三层分离，强依赖检查保障流程顺序
---

# wpw - Web Project Workflow Skill

## 架构概述

本 Skill 与 `wpw` CLI 配合运行，采用三层分离：

```
┌─────────────────────────────────────────────┐
│  AI 层（本 Skill + /wpw:xxx 命令）           │
│  理解、生成、用户交互；调用 CLI 完成确定性操作 │
└──────────────────┬──────────────────────────┘
                   │ wpw <command> --json
                   ▼
┌─────────────────────────────────────────────┐
│  CLI 层（wpw 命令）                          │
│  状态管理、依赖检查、路径解析、模板加载        │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  文件系统（wpw/active/{需求}/ + .wpw.yaml）  │
└─────────────────────────────────────────────┘
```

**核心原则**：AI 只做理解+生成+交互，状态/路径/依赖交给 CLI。

## 六阶段流程

```
BRD → PRD → Explore(可选) → Design → Plan → Test → Apply
业务   产品   探索        设计     计划   验证   实施
```

| 阶段 | 产物 | 强依赖 | 弱依赖 | 联动 Skill | 特殊 |
|------|------|--------|--------|-----------|------|
| BRD | 业务需求文档 | - | - | @brainstorming · @Humanizer-zh | hybrid 输入，附成本评估 |
| PRD | 产品需求文档 | BRD | - | @Humanizer-zh | |
| Explore | 技术方案探索 | PRD | - | @brainstorming · @Humanizer-zh | skippable，产出候选不拍板 |
| Design | 技术方案设计 | PRD | Explore | @Humanizer-zh | 需 Explore 拍板（若存在） |
| Plan | 开发计划 | Design | - | @Humanizer-zh | |
| Test | 测试方案 | Design, Plan | - | @Humanizer-zh | |
| Apply | 代码 | - | - | @code-reviewer（收尾） | `apply.requires: [plan]` |

## 命令映射

| 命令 | 功能 | 对应原 soda |
|------|------|-------------|
| `/wpw:brd` | 接收客户需求 | 新增 |
| `/wpw:prd` | 生成产品需求文档 | soda:ard |
| `/wpw:explore` | 技术方案探索 | 新增 |
| `/wpw:design` | 技术方案设计 | soda:design |
| `/wpw:plan` | 开发计划 | soda:plan |
| `/wpw:test` | 测试方案 | soda:test |
| `/wpw:apply` | 编码实施 | soda:impl |
| `/wpw:cr` | 代码审查 | soda:cr |
| `/wpw:map` | 知识图谱 | soda:map |
| `/wpw:archive` | 归档 | soda:archive |
| `/wpw:exp` | 经验沉淀 | soda:exp |
| `/wpw:sync` | 代码+文档联动 | soda:sync |
| `/wpw:init` | 初始化 | soda:init |

## 三段式契约

每个 `/wpw:xxx` 阶段命令遵循：

1. **CLI 准备**：`wpw new`（幂等）→ `wpw check`（依赖门禁）→ `wpw template`（取模板）
2. **AI 生成+交互**：生成大纲 → AskUserQuestion 确认 → 撰写文档落盘
3. **CLI 收尾+AI 后处理**：`wpw done`/`decision`/`skip` → 执行 hook + Humanizer

## 核心防线

- **每个阶段落盘前必须输出大纲让用户确认，禁止静默写文件**
- **状态变更必经 CLI**（`wpw done`/`skip`/`decision`），AI 不直接改 `.wpw.yaml`
- **BRD 面向业务方**：不主动讨论技术文件/模块/框架（除非用户主动问及），AI 独立估算逐步人力/时间成本填入"成本评估"表，供业务方决策

## 模板规范

文档生成必须读取 CLI 返回的模板路径，按模板结构填充：

```bash
wpw template <阶段> -c <需求名>
```

模板选择优先级：`workflow.config.yaml` 的 `commands.<cmd>.output` → `project.type` 默认 → 文件嗅探。

## 多项目配置（workflow.config.yaml）

```yaml
version: '1.0.0'
project:
  name: <项目名>
  type: <frontend-h5 | backend-node | fullstack | auto>
commands:
  design:
    output: ['Design-Fe.md']  # 覆盖默认模板
```

## 联动 Skill

下列联动 Skill 由 `wpw init` 自动安装到 `.claude/skills/`，`wpw skills update` 实时拉取 GitHub 最新版。各 Skill 在工作流中的引用节点：

- `@brainstorming` — 需求澄清与方案探索 · 引用于 `/wpw:brd`（澄清需求）、`/wpw:explore`（探索方案） · 源 `obra/superpowers`
- `@code-reviewer` — 交付前代码审查 · 引用于 `/wpw:cr`（核心）、`/wpw:apply` 收尾 · 源 `obra/superpowers`（`requesting-code-review`）
- `@Humanizer-zh` — 文档人性化/去机器腔 · 引用于各文档阶段 `after_*` hook（brd/prd/explore/design/plan/test/sync/exp） · 源 `op7418/Humanizer-zh`

> 来源清单见仓库根 `linked-skills.json`；`wpw skills list` 查看已装版本。
