---
name: "WPW: Archive"
description: 归档完成的需求
category: Workflow
tags: [workflow, archive]
---

# /wpw:archive <需求名>

归档完成的需求到 `wpw/archived/YYYY-MM/`。

## 执行流程

### 1. 检查完成状态

```bash
wpw status <需求名> --json
```

确认各阶段已 `done` 或 `skipped`，Apply 任务已全部完成。未完成则提示用户先完成。

### 2. 归档

```bash
wpw archive <需求名>
```

CLI 将 `wpw/active/<需求名>/` 迁移到 `wpw/archived/YYYY-MM/<需求名>/`。

### 3. 经验提炼（可选）

AI 提炼本次需求中的经验/踩坑，写入 `wpw/knowledge/experiences/`（可调用 `/wpw:exp`）。

### 4. 知识图谱更新

归档后需求从 `wpw/active/` 迁至 `wpw/archived/`，需同步更新图谱使 L1 需求节点正确反映归档状态：

```bash
wpw graph update
```

- 增量更新图谱，L1 需求节点的 `archived` 标记随之更新
- 归档需求默认从语义检索结果中过滤（可通过 `--include-archived` 重新纳入）
- 若改动较大，可 `wpw graph rebuild` 全量重建
