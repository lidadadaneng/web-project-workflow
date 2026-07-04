---
name: "WPW: Apply"
description: 按 Plan 逐任务实施编码，支持断点恢复
category: Workflow
tags: [workflow, apply, implementation]
---

# /wpw:apply <需求名> [--from <任务编号>]

按 Plan 逐任务实施编码。`apply.requires: [plan]`。

> **联动 Skill**：`@code-reviewer`（全部任务完成后建议跑 `/wpw:cr` 做交付前审查）

## 执行流程

### 阶段一：CLI 准备

```bash
wpw apply <需求名> --json   # 返回 { state, contextFiles, tasks, progress }
```

处理返回：
- `state: "blocked"`（plan 未完成）→ 提示先 `/wpw:plan`，停止
- `state: "ready"` → 继续

读取 `contextFiles`（PRD/Design/Plan）作为上下文。
若 `--from <编号>`，从该任务继续（断点恢复）。

### 阶段二：逐任务编码

对每个 pending 任务：

1. 标记进行中：
   ```bash
   wpw task <需求名> --mark <编号> --state in-progress
   ```
2. 实施代码改动（最小化、聚焦该任务）
3. 标记完成：
   ```bash
   wpw task <需求名> --mark <编号> --state done
   ```
4. 继续下一任务

### 暂停条件

- 任务不清晰 → AskUserQuestion 澄清
- 实现暴露设计问题 → 建议更新 Design/Plan
- 遇到错误/阻塞 → 报告并等待

### 阶段三：完成

所有任务完成后，执行 `after_code` hook。
输出进度：`N/M tasks complete`。
提示：`/wpw:cr` 代码审查，或 `/wpw:archive` 归档。
