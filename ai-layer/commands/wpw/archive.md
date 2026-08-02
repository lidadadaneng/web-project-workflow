---
name: "WPW: Archive"
description: 归档完成的需求并沉淀能力规范
category: Workflow
tags: [workflow, archive]
---

# /wpw:archive <需求名>

归档完成的需求到 `wpw/archived/YYYY-MM/`，并将需求中的业务能力沉淀为稳态能力规范。

## 执行流程

### 1. 检查完成状态

```bash
wpw status <需求名> --json
```

确认各阶段已 `done` 或 `skipped`，Apply 任务已全部完成。未完成则提示用户先完成。

### 2. 能力沉淀（关键步骤）

归档前，AI 自动分析需求内容，判断其归属的能力领域，将业务知识沉淀到 `wpw/specs/`：

**AI 自动决策流程**（无需用户确认）：

1. **能力识别**：从 PRD/Design 中提炼本次需求涉及的核心业务能力
2. **匹配现有能力**：检索 `wpw/specs/` 中是否已有相关能力 spec
   - **已有能力**：读取现有 spec → 提取增量需求 → delta 合并 → 写回更新
   - **新能力**：创建 `wpw/specs/<capability-name>/spec.md`（OpenSpec 格式）
3. **business_map 证据迁移**：原需求的业务映射证据合并到对应能力节点
4. **质量检查**：确保 spec 包含 Purpose、Requirements、Scenarios 三个核心章节

```
wpw/active/<需求>/               wpw/specs/<能力>/
  PRD.md ──┐                       spec.md
  Design.md ┼→ AI 提炼 ─────────→    Purpose: ...
  Apply/   ─┘  能力知识沉淀          Requirements:
                                     - Requirement: ...
                                     Scenarios:
```

> **为什么要沉淀能力规范？**
> - 需求是临时的、变化的；能力是稳态的、可复用的
> - C 层能力节点来自 specs，而非活跃需求 → 图谱更稳定
> - 新需求进来时可直接关联已有能力，减少重复设计
> - 能力 spec 作为团队业务知识的结构化载体

### 3. 归档

```bash
wpw archive <需求名>
```

CLI 将 `wpw/active/<需求名>/` 迁移到 `wpw/archived/YYYY-MM/<需求名>/`。

### 4. 经验提炼（可选）

AI 提炼本次需求中的经验/踩坑，写入 `wpw/knowledge/experiences/`（可调用 `/wpw:exp`）。

### 5. 知识图谱更新

归档后需求迁移，能力 spec 更新 → 增量更新图谱反映最新状态：

```bash
wpw graph update
```

- 能力 spec 的变更（新增/修改/删除）会自动检测并更新 C 层节点
- business_map 边随能力节点重新计算（多源证据融合）
- 若 schema 版本不兼容，update 会自动全量重建
- 若改动较大，可 `wpw graph rebuild` 全量重建
