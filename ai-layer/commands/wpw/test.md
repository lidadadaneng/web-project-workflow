---
name: "WPW: Test"
description: 基于设计与计划生成测试方案
category: Workflow
tags: [workflow, test]
---

# /wpw:test <需求名>

基于 Design 与 Plan 生成测试方案。强依赖 Design + Plan。

## 执行流程

### 阶段一：CLI 准备

```bash
wpw new <需求名>
wpw check testplan -c <需求名> --json   # 校验 design + plan done
wpw template testplan -c <需求名>       # 取 Test 模板（Fe/Server）
```

读取 `Design-<需求名>.md` 与 `Plan-<需求名>.md` 作为输入。

### 阶段二：AI 生成

生成测试范围、测试策略、测试用例、回归范围、验收标准、测试数据。

### 阶段三：确认大纲

输出 Test 大纲，等用户确认。**🛑 禁止静默落盘**。

### 阶段四：落盘 + CLI 收尾

写入 `wpw/active/<需求名>/TestPlan-<需求名>.md`：

```bash
wpw done testplan -c <需求名>
```

### 阶段五：AI 后处理

用 `@Humanizer-zh` 去机器腔。

提示下一步：`/wpw:apply <需求名>` 实施编码。
