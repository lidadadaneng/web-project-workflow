## Why

执行 `/wpw:xxx` 命令时，知识图谱语义检索召回率偏低，尤其是 L1（模块层）经常查不到，导致后续上下文质量差、甚至回退手动读文件。当前单查询扁平检索的策略没有利用图谱的层级结构优势，也没有针对低命中场景的降级机制。

## What Changes

在 AI 层（wpw-workflow Skill 及各阶段命令文档）优化知识图谱检索策略，零 CLI 代码改动：

- **L1 优先分层检索**：先定位业务模块，再决定下钻深度或锚点扩展，解决 L1 召回率低的核心痛点
- **多词扩展检索**：生成 4-6 个不同角度的检索词，用 `--multi` 并行查询提升召回
- **锚点优先模式**：Apply 等已知代码路径的阶段，直接用 `--anchors` 跳过语义检索，更快更准
- **低召回降级策略**：首轮命中少时，自动降低阈值、补充同义词、反推 L1 模块
- **各阶段差异化策略**：Explore/Design/Plan/Apply/CR/Test 各阶段按其目标使用不同的检索模式

## Capabilities

### New Capabilities

（无新增能力，纯 AI 层使用策略优化）

### Modified Capabilities

（无现有能力的行为变更，仅优化 AI 层调用方式）

> 本变更为纯文档/Skill 优化，不涉及 CLI 层功能或行为变更，故设置 `skip_specs: true`。

## Impact

- **影响文件**：
  - `ai-layer/skills/wpw-workflow/SKILL.md` — 新增"检索质量优化策略"章节
  - `ai-layer/commands/wpw/explore.md` — 升级为分层检索模式
  - `ai-layer/commands/wpw/design.md` — 升级为分层检索 + 多词扩展
  - `ai-layer/commands/wpw/plan.md` — 升级为 L1/L2 分层检索
  - `ai-layer/commands/wpw/apply.md` — 升级为锚点优先模式
  - `ai-layer/commands/wpw/cr.md` — 补充检索策略
  - `ai-layer/commands/wpw/test.md` — 补充检索策略
- **不影响**：CLI 层代码、图谱构建、语义检索算法、任何运行时行为
- **风险**：低。纯策略文档调整，若效果不佳可随时回退
