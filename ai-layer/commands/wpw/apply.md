---
name: "WPW: Apply"
description: 按 Plan 逐任务实施编码，测试用例驱动，交付前 CR + 测试双门禁
category: Workflow
tags: [workflow, apply, implementation]
---

# /wpw:apply <需求名> [--from <任务编号>]

按 Plan 逐任务实施编码，**测试用例驱动**。`apply.requires: [plan]`。

> **联动 Skill**：`@code-reviewer`（交付前代码审查）

## 执行流程

### 阶段一：CLI 准备

```bash
wpw apply <需求名> --json   # 返回 { state, contextFiles, tasks, progress, warnings }
```

处理返回：
- `state: "blocked"`（plan 未完成）→ 提示先 `/wpw:plan`，停止
- `state: "ready"` → 继续
- `warnings` 含 testplan 提示 → **向用户转达**：跳过/未做测试可能影响代码质量，推荐先 `/wpw:test`

读取 `contextFiles`（PRD/Design/Plan；若 TestPlan 已 done 则含之，作为驱动输入）。
若 `--from <编号>`，从该任务继续（断点恢复）。

### 阶段二：逐任务编码（测试用例驱动）

对每个 pending 任务：

1. 标记进行中：
   ```bash
   wpw task <需求名> --mark <编号> --state in-progress
   ```
2. **若 TestPlan 存在**：先按 TestPlan 中与本任务相关的用例写/补测试，再实施代码改动（最小化、聚焦该任务），使相关测试通过
3. **若 TestPlan 跳过/不存在**：直接实施代码改动（无测试驱动，质量风险自担）
4. 标记完成：
   ```bash
   wpw task <需求名> --mark <编号> --state done
   ```
5. 继续下一任务

### 暂停条件

- 任务不清晰 → AskUserQuestion 澄清
- 实现暴露设计问题 → 建议更新 Design/Plan
- 遇到错误/阻塞 → 报告并等待

### 阶段三：交付门禁（CR + 测试双合格）

所有任务完成后：

1. **代码审查**：执行 `/wpw:cr`（调用 `@code-reviewer`），修复至无 BLOCKER
2. **测试通过**（若 TestPlan 存在）：运行全部测试用例，确认均通过；未通过的修复至通过
3. **二者均合格** → 告知用户可进行功能验证
4. 执行 `after_code` hook，输出进度 `N/M tasks complete`

> ⚠️ 若 TestPlan 已跳过：跳过步骤 2，但**明确告知用户**未做测试用例验证，可能影响代码质量，建议后续补 `/wpw:test` 再交付。

### 阶段四：下一步

- 功能验证通过 → `/wpw:archive <需求名>` 归档
- 仍有问题 → 回到 `/wpw:plan` 或 `/wpw:apply --from` 调整
