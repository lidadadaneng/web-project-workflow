---
name: "WPW: Test"
description: 基于设计与计划生成测试方案
category: Workflow
tags: [workflow, test]
---

# /wpw:test <需求名>

基于 Design 与 Plan 生成测试方案。强依赖 Design + Plan。

> **可跳过**：`wpw skip testplan`，但跳过会导致 apply 无测试用例驱动、开发后无法验证用例通过，**可能影响代码质量——推荐不跳过**。

## 执行流程

### 阶段一：CLI 准备

```bash
wpw new <需求名>
wpw check testplan -c <需求名> --json   # 校验 design + plan done
wpw template testplan -c <需求名>       # 取 Test 模板（Fe/Server）
```

读取 `Design-<需求名>.md` 与 `Plan-<需求名>.md` 作为输入。

**知识图谱上下文准备**（必做）：

```bash
wpw graph update   # 增量更新图谱，保证依赖关系最新
```

- 图谱不存在 -> 强提示「⚠️ 未构建知识图谱，建议先执行 `wpw graph build` 以确定回归范围」，但仍可回退人工梳理继续

确定回归测试范围（替代人工梳理依赖，更准不遗漏）：

```bash
# 查改动模块的上下游，确定需要回归测试的范围
wpw graph query --upstream <改动模块节点ID> --depth 2 --json
wpw graph query --downstream <改动模块节点ID> --depth 2 --json
```

- 查询无结果 -> 回退人工梳理，提示「图谱未匹配到相关节点」
- 向量索引缺失 -> 依赖查询不依赖向量，仍可用

### 阶段二：AI 生成

生成测试范围、测试策略、测试用例、回归范围、验收标准、测试数据。
**回归范围结合图谱上下游依赖查询结果**，确保不遗漏也不扩大化。

### 阶段三：确认大纲

输出 Test 大纲，等用户确认。**🛑 禁止静默落盘**。

### 阶段四：落盘 + CLI 收尾

写入 `wpw/active/<需求名>/TestPlan-<需求名>.md`：

```bash
wpw done testplan -c <需求名>
```

### 阶段五：AI 后处理

用 `@humanizer-zh` 去机器腔。

提示下一步：`/wpw:apply <需求名>` 以本测试方案驱动开发。
