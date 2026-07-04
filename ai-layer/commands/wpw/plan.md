---
name: "WPW: Plan"
description: 基于技术设计生成开发计划（任务清单）
category: Workflow
tags: [workflow, plan]
---

# /wpw:plan <需求名>

基于 Design 生成开发计划。强依赖 Design。

## 执行流程

### 阶段一：CLI 准备

```bash
wpw new <需求名>
wpw check plan -c <需求名> --json   # 校验 design done
wpw template plan -c <需求名>       # 取 Plan 模板（按 project.type 选 Fe/Server）
```

读取 `Design-<需求名>.md` 作为输入。

### 阶段二：AI 生成

生成任务清单（`- [ ] 编号. 任务描述`）、任务依赖、估时、风险任务。
任务要求：可执行、可验证、粒度适中（一个 session 能完成）。

### 阶段三：确认大纲

输出 Plan 大纲，等用户确认。**🛑 禁止静默落盘**。

### 阶段四：落盘 + CLI 收尾

写入 `wpw/active/<需求名>/Plan-<需求名>.md`：

```bash
wpw done plan -c <需求名>
```

### 阶段五：AI 后处理

用 `@humanizer-zh` 去机器腔。

提示下一步：推荐 `/wpw:test` 生成测试用例（apply 以测试用例驱动开发，开发后验证用例通过）。可跳过 test 直接 `/wpw:apply`，但跳过测试可能影响代码质量。
