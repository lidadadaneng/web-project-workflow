## Context

当前 web-project-workflow（内部代号 soda）是一个公司内部的 AI 开发流程 Skill，确定性逻辑分散在 `scripts/` 文件夹的 bash 脚本中，AI 层直接操作文件并调用分散脚本，状态无统一管理；且强耦合内网遥测上报（`skillshub.intra...`）与 Cooper 知识库。流程为四阶段 `ARD → Design → Plan → Test`，命令前缀 `soda:*`。

本设计将其重构为 `wpw` CLI（Node.js / npm 包）+ AI 层调用 CLI 的三层架构，流程扩展为六阶段 `BRD → PRD → Explore → Design → Plan → Test → Apply`，完全剥离内部依赖。CLI 不可调用 LLM——AI 能力由宿主 IDE 提供，CLI 只做确定性逻辑并输出 JSON 供 AI 消费。

## Goals / Non-Goals

**Goals:**
- CLI 统一承载确定性逻辑（状态/依赖/路径/模板），可独立测试
- AI 层只做理解/生成/交互，通过 CLI 完成状态与路径操作
- 六阶段流程承接正常需求（含客户需求接收与技术方案探索）
- 强依赖检查（A 方案）保障阶段顺序，弱依赖支持 explore 可跳过
- 完全剥离内网依赖，npm 分发，`wpw init` 释放 AI 层

**Non-Goals:**
- 不实现 AI 模型接入（CLI 不调用 LLM）
- 不兼容原 `soda:*` 命令（BREAKING）
- 不做 schema 外部化（六阶段定义内置 CLI 代码；`workflow.config.yaml` 仅项目差异配置）
- 不实现多 schema 切换（仅六阶段一种）
- 不在本期实现 IDE 插件（仅 CLI + Skill 文本命令）

## Decisions

### D1: 三层架构（AI 层 / CLI 层 / 文件系统）

- **AI 层**：`SKILL.md` + `/wpw:xxx` 命令文件，负责理解、生成、用户交互
- **CLI 层**：`wpw` 命令，负责状态/依赖/路径/模板，输出 JSON
- **文件系统**：`wpw/active/{需求}/` 工作区 + `.wpw.yaml` 状态

**替代方案**：单层（AI 全做）→ 不可测试、状态易错；纯 CLI（无 AI）→ 无法生成内容。三层分离让确定性可测、生成性灵活。

### D2: CLI 用 Node.js + commander，npm 分发

- `package.json` 配 `bin: { wpw: "./dist/index.js" }`，TypeScript 编写
- 与 openspec 生态一致，跨平台（Windows/Linux/macOS），AI 工程师熟悉

**替代方案**：Go（单二进制但开发成本高）、Python（分发不如 npm 方便）、Bash（Windows 兼容差）。选 Node.js 平衡开发效率与跨平台。

### D3: schema 内置 CLI 代码（TypeScript 常量）

六阶段定义、依赖关系、`skippable` 标记硬编码在 `src/schema/six-phase.ts`。`workflow.config.yaml` 只管 `project.type` 与模板覆盖。

**替代方案**：外部 `schema.yaml`（可改但增加复杂度、多一份配置）。内置降低接入门槛，符合"单文件轻量接入"原旨。

### D4: 六阶段流程 BRD → PRD → Explore → Design → Plan → Test → Apply

- **BRD**：接收客户需求，hybrid 输入（有输入整理/无输入问答）
- **PRD**：产品需求文档（原 ARD 改名）
- **Explore**：技术方案探索，`skippable`，产出候选方案不拍板
- **Design**：依赖 PRD（强）+ Explore（弱），需用户拍板后进入
- **Plan / Test / Apply**：沿用原流程，`impl` 改名 `apply`

**替代方案**：openspec 三阶段（proposal/design/tasks）→ 缺业务/产品分层，无法承接客户原始需求。六阶段补齐"业务→产品→探索→设计"链路。

### D5: 依赖检查引擎——强依赖 + 弱依赖 + skippable

- `dependsOn`：强依赖，前置必须 `done`
- `optionalDeps`：弱依赖，有则读、无则跳
- `skippable`：可标记 `skipped`（explore）
- design 特殊规则：若 `explore==done` 但 `decisions.explore.chosenOption` 为空，`check` 返回 `warnings`（软提示，不阻断）

**替代方案**：完全自由（B 方案）→ 易乱序；纯线性强依赖 → explore 不可跳。强弱区分化解 explore 可跳过与强约束的张力。

### D6: 状态管理 .wpw.yaml

每需求一个 `.wpw.yaml`，记录 `status`（pending/outlining/confirmed/done/skipped）、`decisions`（拍板）、`progress`（任务进度）、`config`（project.type）。

**替代方案**：仅 `progress.md` → 状态查询不便、依赖检查难解析。YAML 结构化便于 CLI 读写与 AI 消费。

### D7: AI-CLI 三段式契约

每个 `/wpw:xxx` 阶段命令遵循：
1. **CLI 准备**：`wpw new`（幂等）→ `wpw check`（依赖）→ `wpw template`（取模板）
2. **AI 生成+交互**：生成大纲 → AskUserQuestion 确认 → 撰写文档落盘
3. **CLI 收尾+AI 后处理**：`wpw done`/`decision`/`skip` → 执行 hook + Humanizer

**替代方案**：AI 全程直接操作 → 绕过 CLI 状态，易不一致。三段式让状态变更必经 CLI。

### D8: 模板解析——project.type 驱动（保留原逻辑）

优先级：`commands.<cmd>.output`（非空）→ `project.type` 默认模板（Fe/Server）→ 文件嗅探（`package.json`/`pom.xml`/`go.mod`）。保留原 soda 模板选择逻辑，迁入 CLI。

### D9: 完全剥离内网依赖

移除 telemetry 段、`skillshub.intra` URL、Cooper 依赖。`wpw init` 不再注入遥测代码。

**替代方案**：配置化保留 → 增加维护负担，违背通用化目标。

## Dependency Graphs (DAG)

wpw 系统有三层 DAG：**业务流程层**（定义阶段依赖）、**CLI 代码层**（实现检查引擎）、**运行时调用层**（AI 命令调用 CLI）。三层闭环构成 wpw 区别于原 soda（无统一状态、无依赖检查）的核心。

### ① 业务流程 DAG（六阶段流转）

边分**强依赖**（`dependsOn`，必须完成）与**弱依赖**（`optionalDeps`，有则读）：

```
                          ┌──── skippable (用户可跳过) ────┐
                          ▼                                │
                    ┌──────────┐                           │
      ┌────────────▶│ Explore  │                           │
      │             │ (可选)   │                           │
      │             └────┬─────┘                           │
      │                  │ weak (有则读,拍板后用)           │
      │                  ▼                                 │
┌─────┴────┐      ┌──────────┐      ┌────────┐            │
│   PRD    │─────▶│  Design  │─────▶│  Plan  │            │
│          │strong│          │strong│        │            │
└─────┬────┘      └────┬─────┘      └───┬────┘            │
      │ strong         │ strong         │ strong          │
      │                │                ▼                 │
      │                │           ┌────────┐             │
      │                └──────────▶│  Test  │             │
      │                  strong    └────────┘             │
      │                                                  │
┌─────▼────┐                                            │
│   BRD    │  (入口，无依赖)                             │
└──────────┘                                            │
                              apply.requires = [plan]    │
                          ┌──────────────────────────────┘
                          ▼
                    ┌──────────┐
                    │  Apply   │  (编码实施)
                    └──────────┘
```

| 阶段 | 强依赖（dependsOn） | 弱依赖（optionalDeps） | 特殊 |
|------|---------------------|------------------------|------|
| `brd` | ∅ | ∅ | 入口，hybrid 输入 |
| `prd` | `[brd]` | ∅ | |
| `explore` | `[prd]` | ∅ | `skippable`，产出候选不拍板 |
| `design` | `[prd]` | `[explore]` | 需 explore 拍板（若存在） |
| `plan` | `[design]` | ∅ | |
| `testplan` | `[design, plan]` | ∅ | |
| `apply` | — | — | `requires: [plan]` 门禁 |

**关键特性**：BRD 是唯一根节点（无入边）；Apply 是汇聚终点（无出边，产出代码）；explore 是旁路，跳过则 design 只基于 prd；design 有两条入边（prd 强 + explore 弱）形成菱形；testplan 是 design 与 plan 的共同后继。

### ② CLI 代码模块 DAG（实现层）

```
                    ┌─────────────────────┐
                    │ schema/six-phase.ts │  ← 纯定义，无依赖（根）
                    │ (阶段+依赖规则)      │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  lib/state.ts       │  ← 读写 .wpw.yaml
                    │  (状态管理)          │
                    └──┬───────────────┬──┘
                       │               │
          ┌────────────┘               └────────────┐
          ▼                                         ▼
┌─────────────────────┐               ┌─────────────────────────┐
│ lib/dependency.ts   │               │ lib/template-resolver.ts│
│ (依赖检查引擎)       │               │ (模板路径解析)           │
└─────────────────────┘               └────────┬────────────────┘
                                               │
                              ┌────────────────┴───────────────┐
                              ▼                                ▼
                   ┌─────────────────────┐        ┌─────────────────────┐
                   │ lib/config.ts       │        │ lib/project-type.ts │
                   │ (workflow.config)   │        │ (文件嗅探)           │
                   └─────────────────────┘        └─────────────────────┘
                               │
                               ▼
          ┌────────────────────────────────────────────┐
          │           commands/*.ts (13 子命令)         │
          │   消费 state + dependency + template + ...  │
          └────────────────────────────────────────────┘
```

| 模块 | 依赖 | 职责 |
|------|------|------|
| `schema/six-phase.ts` | ∅ | 六阶段定义（根） |
| `lib/config.ts` | ∅ | workflow.config.yaml 读写 |
| `lib/project-type.ts` | ∅ | 嗅探 package.json/pom.xml/go.mod |
| `lib/state.ts` | `schema` | .wpw.yaml 读写 |
| `lib/dependency.ts` | `schema` + `state` | 依赖检查引擎 |
| `lib/template-resolver.ts` | `config` + `project-type` | 模板路径解析 |
| `commands/*` | 上述所有 lib | 13 个子命令实现 |

**关键**：`schema` 是全局根，所有模块直接或间接依赖它；`config` 与 `project-type` 是叶子（无内部依赖）。

### ③ AI-CLI 调用 DAG（运行时）

每个 `/wpw:*` 命令在运行时调用一组 CLI 子命令，`check` 是**门禁节点**——消费业务流程 DAG 的当前状态，决定 AI 命令能否继续：

```
wpw:brd     ──▶ { new, check(brd), template(brd), done(brd) }
wpw:prd     ──▶ { check(prd)→[brd.done], template(prd), done(prd) }
wpw:explore ──▶ { check(explore)→[prd.done], template, done/skip, decision }
wpw:design  ──▶ { check(design)→[prd.done + explore拍板], template, done }
wpw:plan    ──▶ { check(plan)→[design.done], template, done }
wpw:test    ──▶ { check(test)→[design+plan.done], template, done }
wpw:apply   ──▶ { apply→[plan.done], task(mark) × N }
```

### 三层闭环

```
① 业务流程 DAG          ② 代码模块 DAG          ③ 运行时调用 DAG
(定义"什么依赖什么")     (实现"如何检查依赖")     (执行"按依赖推进")
     │                       │                       │
     │ schema 编码           │ state 记录            │ check 查询
     ▼                       ▼                       ▼
  six-phase.ts  ──▶  dependency.ts  ──▶  wpw check --json
                                                    │
                                            AI 决定是否继续
```

① 定义依赖规则 → ② 实现检查引擎并记录状态 → ③ 运行时查询状态决定流转。

## Risks / Trade-offs

- **[CLI 开发工作量大]** → 分阶段交付：先核心命令（new/status/check/template/done/apply/task），再辅助命令（map/cr/exp/archive/sync）
- **[BREAKING 不兼容旧 soda]** → 提供 migration 指南与 `docs/features/ → wpw/active/` 迁移脚本；ARD 文件改名 PRD
- **[explore 可跳过与强依赖检查冲突]** → 弱依赖 `optionalDeps` 机制化解，`skippable` 标记显式表达
- **[Windows bash 环境差异]** → CLI 用 Node.js 跨平台不依赖 bash；AI 层命令文件用跨平台语法
- **[npm 分发需 Node.js 运行时]** → 文档标注前置要求；支持 `npx wpw` 免全局安装
- **[AI 层与 CLI 契约漂移]** → CLI 输出 JSON schema 固定，AI 命令文件按契约消费；契约写入 specs

## Migration Plan

1. 开发 wpw CLI 核心命令（new/status/check/template/done/apply）
2. 编写 AI 层（SKILL.md + 12 个命令文件 + hooks）
3. 剥离内网依赖（telemetry/Cooper/内网 URL）
4. `wpw init` 释放 AI 层 + 生成 workflow.config.yaml + 创建目录
5. 旧项目迁移：`docs/features/active/ → wpw/active/`，ARD 文件改名 PRD
6. 回滚策略：保留原 SKILL.md 备份，可切回 soda

## Open Questions

- `wpw map` 知识图谱的 CLI+AI 边界细节（CLI 扫结构、AI 填语义的具体协议待 design 细化）
- `wpw archive` 是否自动提炼经验（原 soda archive 含 exp 提炼，是否保留待定）
