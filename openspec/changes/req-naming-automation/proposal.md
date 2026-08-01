## Why

当前 `/wpw:brd` 接收用户输入的中文需求名作为需求标识，而需求名是图谱 L1 节点的唯一标识（name-based ID）。用户命名随意、缺乏规范，导致图谱节点命名不一致、可读性差，且无法有效检测重复需求。需要将需求命名规范化、自动化，并建立英文命名体系以提升图谱质量和检索一致性。

## What Changes

- **BREAKING** `/wpw:brd` 命令参数从「需求名」改为「需求描述」，AI 自动生成英文 kebab-case 需求名，无需用户确认
- 新增需求命名语义查重：创建需求前检索知识图谱 L1 节点，检测已有相似需求
- CLI 层新增 `wpw new` 命令的 kebab-case 格式校验（兜底）
- 需求节点 `name` 字段为英文标识，`description` 字段保留中文简述用于展示
- **所有 AI 层命令**（brd/explore/design/plan/apply/cr）调用图谱检索时强制使用英文检索词，map 文档和 skill 文档同步更新规范说明

## Capabilities

### New Capabilities

- `req-name-generation`: 需求命名自动生成与语义查重（AI 层命名规则 + 图谱语义查重流程）

### Modified Capabilities

- `graph-build`: 需求节点增加中文 description 字段，区分英文标识与中文展示

## Impact

- 影响范围：`ai-layer/commands/wpw/brd.md`、`ai-layer/commands/wpw/map.md`、`src/commands/new.ts`、`src/lib/state.ts`、`src/graph/parsers/requirement-parser.ts`
- 向后兼容：已有中文命名的需求保持不变（schema 已在 2.0.0，ID 规则已稳定）；新建需求才使用英文命名
- 图谱构建：无破坏性变更，description 为新增可选字段
