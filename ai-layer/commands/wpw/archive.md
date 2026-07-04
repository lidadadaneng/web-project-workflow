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

增量更新 `wpw/knowledge/`（接口 / 数据表 / 架构变更），可调用 `/wpw:map`。
