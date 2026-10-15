---
name: "WPW: CR"
description: 代码审查（全量/快速复审）
category: Workflow
tags: [workflow, cr, review]
---

# /wpw:cr [模式]

代码审查。模式：全量（默认）或快速复审。

> **联动 Skill**：`@code-reviewer`（本阶段核心审查能力，调用其审查清单与维度）

## 执行流程

### 1. 确定改动范围

读取 `git diff` 与 `git status`，确定本次改动文件列表。

**知识图谱影响面分析**（必做）：

```bash
wpw graph update   # 增量更新图谱，保证依赖关系最新
```

- 图谱不存在 -> 强提示「⚠️ 未构建知识图谱，建议先执行 `wpw graph build` 以分析改动影响面」，但仍可回退仅看 diff 继续

对每个改动文件，查询其上游依赖（受本次改动影响的调用方）：

```bash
wpw graph query --upstream <文件节点ID> --depth 2 --json
```

或一次性生成改动区域的整体上下文：

```bash
wpw graph context --anchors <改动文件ID列表> --depth 2 --json
```

- 0 锚点 / 查询无结果 -> 回退仅看 diff 文件本身，提示「图谱未匹配到相关节点」
- 向量索引缺失 -> `--anchors` 模式仍可用（依赖查询不依赖向量）

> ⚠️ **强制规范**：CR 阶段若使用 `wpw graph context` 或 `wpw graph search` 的语义检索模式（非 `--anchors`），检索词必须为英文。`--anchors` 模式和 `wpw graph query` 不受此限制。

### 2. 上下文（可选）

若当前有活跃需求：

```bash
wpw list --json
```

读取需求 PRD/Design/Plan，辅助判断改动是否符合需求。

### 3. 模式识别

- **全量**：五维漏斗逐文件审查（正确性 / 安全 / 性能 / 可维护性 / 规范），**结合上游影响面判断改动是否破坏调用方契约**
- **快速复审**：只看高风险改动（并发、权限、数据迁移、外部接口）

### 4. 审查

对每个文件按维度审查，记录问题，按严重度分级：
- **BLOCKER**：硬阻断，必须修复才能合并
- **MAJOR**：需修复
- **MINOR**：建议修复

### 5. 输出报告

按严重度排序输出审查报告。BLOCKER 存在时明确提示「不可合并」。
