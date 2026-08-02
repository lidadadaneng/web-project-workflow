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

**知识图谱上下文准备**（必做）：

```bash
wpw graph update   # 增量更新图谱，保证代码上下文最新（约 100ms）
```

- 图谱不存在 -> 强提示「⚠️ 未构建知识图谱，建议先执行 `wpw graph build` 以获得精准代码上下文」，但仍可回退手动读文件继续
- 向量索引缺失 -> 后续 context 自动降级为 `--anchors` 模式，并提示「向量索引缺失，语义检索不可用，建议 `wpw graph rebuild`」

### 阶段二：逐任务编码（测试用例驱动）

对每个 pending 任务：

1. 标记进行中：
   ```bash
   wpw task <需求名> --mark <编号> --state in-progress
   ```

2. **获取代码上下文**（替代手动逐文件读取，大幅降低 Token）：

   **策略：锚点优先 — 已知文件路径时直接用 `--anchors`，跳过语义检索，更快更准。**

   **判断逻辑**：
   - ✅ 任务描述明确涉及哪些文件 → **锚点模式**（首选）
   - ✅ Plan 中已指定文件路径 → **锚点模式**（首选）
   - ❌ 任务模糊，不确定具体文件 → **语义检索兜底**

   ```bash
   # ==================== 模式 A：锚点优先（首选） ====================
   # 已知文件路径/模块/函数时，直接锚定，跳过语义检索
   # 不受 embedding 质量影响，速度更快，结果更准
   wpw graph context --anchors "file:<path-to-file-1>,file:<path-to-file-2>" --depth 2 --token-budget 4000 --json

   # 锚点可以混合多种类型：
   #   file:xxx.ts         — 文件节点
   #   mod:<module-name>   — 模块节点（整个模块做锚点）
   #   elem:<function-id>  — 代码元素节点（精确到函数）
   # 例: wpw graph context --anchors "mod:user-auth,file:src/utils/token.ts" --depth 2 --json

   # ==================== 模式 B：语义检索兜底 ====================
   # 任务不明确、不知道具体文件时，用 L2/L3 定向检索
   # 检索词必须为英文，4-6 个不同角度的关键词，用 --multi 提升召回
   wpw graph context "<tech-kw-1>,<tech-kw-2>,<tech-kw-3>,<tech-kw-4>" --multi --level L2,L3 --token-budget 4000 --depth 2 --json
   ```

   - 将返回的结构化子图（相关模块/文件/函数 + 依赖关系）作为本任务的代码上下文
   - 锚点模式下 0 个有效锚点 → 退化为语义检索兜底
   - 语义检索 0 锚点 → 回退手动读文件，提示「图谱未匹配到相关节点」
   - ⚠️ **强制规范**：语义检索的检索词必须为英文。锚点模式（`--anchors`）不受此限制。

3. **若 TestPlan 存在**：先按 TestPlan 中与本任务相关的用例写/补测试，再实施代码改动（最小化、聚焦该任务），使相关测试通过

4. **若 TestPlan 跳过/不存在**：直接实施代码改动（无测试驱动，质量风险自担）

5. 标记完成：
   ```bash
   wpw task <需求名> --mark <编号> --state done
   ```
6. 继续下一任务

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
