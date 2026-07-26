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
BRD → PRD → Explore(可选) → Design → Plan → Test(可选) → Apply
业务   产品   探索        设计     计划   验证           实施
```

| 阶段 | 产物 | 强依赖 | 弱依赖 | 联动 Skill | 特殊 |
|------|------|--------|--------|-----------|------|
| BRD | 业务需求文档 | - | - | @brainstorming · @humanizer-zh | hybrid 输入，附成本评估 |
| PRD | 产品需求文档 | BRD | - | @humanizer-zh | |
| Explore | 技术方案探索 | PRD | - | @brainstorming · @humanizer-zh | skippable，产出候选不拍板 |
| Design | 技术方案设计 | PRD | Explore | @humanizer-zh | 需 Explore 拍板（若存在） |
| Plan | 开发计划 | Design | - | @humanizer-zh | |
| Test | 测试方案 | Design, Plan | - | @humanizer-zh | skippable，推荐不跳过 |
| Apply | 代码 | - | - | @code-reviewer（+testplan 驱动） | `apply.requires: [plan]`，test-driven + CR/测试双门禁 |

## 命令映射

| 命令 | 功能 |
|------|------|
| `/wpw:brd` | 接收客户需求 |
| `/wpw:prd` | 生成产品需求文档 |
| `/wpw:explore` | 技术方案探索 |
| `/wpw:design` | 技术方案设计 |
| `/wpw:plan` | 开发计划 |
| `/wpw:test` | 测试方案 |
| `/wpw:apply` | 编码实施 |
| `/wpw:cr` | 代码审查 |
| `/wpw:map` | 知识图谱构建与上下文生成 |
| `/wpw:archive` | 归档 |
| `/wpw:exp` | 经验沉淀 |
| `/wpw:sync` | 代码+文档联动 |
| `/wpw:init` | 初始化 |

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

## 知识图谱上下文（降 Token、提准）

各阶段命令在需要理解代码时，优先调用 `wpw graph` 获取结构化上下文，替代手动 grep/读文件。

**统一前置**：相关命令开始时先增量更新图谱
```bash
wpw graph update   # 约 100ms，保证代码上下文最新
```

**核心能力**：
- `wpw graph context "<关键词>" --token-budget N` - 生成压缩后的结构化代码上下文（检索+裁剪+压缩，直接喂给 LLM）
- `wpw graph query --upstream/--downstream <节点ID>` - 查依赖关系（影响面/回归范围）
- `wpw graph query --level L2` - 查模块/文件节点 ID

**降级策略**（所有命令统一）：
- 图谱不存在 -> 强提示「建议先 `wpw graph build`」，但仍可回退手动读文件继续，不硬阻断
- 向量索引缺失 -> context 自动降级 `--anchors` 模式，依赖查询仍可用
- 0 锚点 -> 回退手动读文件，提示「图谱未匹配到相关节点」

**各阶段集成点**：

| 阶段 | 集成方式 | 收益 |
|------|---------|------|
| `/wpw:apply` | 每任务前 `context` 取代码上下文 | Token 降 60-80% |
| `/wpw:cr` | `query --upstream` 分析影响面 | 审查更全面 |
| `/wpw:explore` | `context` + `query` 了解现有架构 | 探索更快更准 |
| `/wpw:design` | `context --level L2,L3,L4` 了解模块边界 | 设计不脱节 |
| `/wpw:test` | `query --upstream/--downstream` 定回归范围 | 不遗漏不扩大 |
| `/wpw:sync` | `query --upstream` 沿 business_map 找关联文档 | 不漏同步 |
| `/wpw:plan` | `context --level L2,L3` 了解模块边界 | 任务切分更合理 |
| `/wpw:brd` | `context --level L2` 参考模块规模估成本 | 估算更准（仅 AI 内部参考） |

> 详见 `/wpw:map` 命令文档。

## 联动 Skill

下列联动 Skill 由 `wpw init` 自动安装到 `.claude/skills/`，`wpw skills update` 实时拉取 GitHub 最新版。各 Skill 在工作流中的引用节点：

- `@brainstorming` — 需求澄清与方案探索 · 引用于 `/wpw:brd`（澄清需求）、`/wpw:explore`（探索方案） · 源 `obra/superpowers`
- `@code-reviewer` — 交付前代码审查 · 引用于 `/wpw:cr`（核心）、`/wpw:apply` 收尾 · 源 `obra/superpowers`（`requesting-code-review`）
- `@humanizer-zh` — 文档人性化/去机器腔 · 引用于各文档阶段 `after_*` hook（brd/prd/explore/design/plan/test/sync/exp） · 源 `op7418/Humanizer-zh`

> 来源清单见仓库根 `linked-skills.json`；`wpw skills list` 查看已装版本。
