---
name: "WPW: PRD"
description: 基于业务需求文档生成产品需求文档（PRD）
category: Workflow
tags: [workflow, prd, requirement]
---

# /wpw:prd <需求名>

基于 BRD 生成 PRD（产品需求文档），明确要做什么。强依赖 BRD。

## 执行流程

### 阶段一：CLI 准备

```bash
wpw new <需求名>                    # 幂等
wpw check prd -c <需求名> --json    # 校验 BRD 已 done（未完成则停止）
wpw template prd -c <需求名>        # 取 PRD 模板
```

若 `check` 返回 `canProceed: false`，提示用户先执行 `/wpw:brd`，停止。

读取已落盘的 `BRD-<需求名>.md` 作为输入。

### 阶段二：AI 生成

基于 BRD 生成 PRD 大纲：功能清单、优先级、验收标准、非功能需求、依赖与影响、不在本次范围。

### 阶段三：确认大纲

输出 PRD 大纲，等用户确认。**🛑 禁止静默落盘**。

### 阶段四：落盘 + CLI 收尾

写入 `wpw/active/<需求名>/PRD-<需求名>.md`：

```bash
wpw done prd -c <需求名>
```

### 阶段五：AI 后处理

执行 `after_prd` hook，用 `@Humanizer-zh` 去机器腔。

提示下一步：`/wpw:explore`（技术探索，可跳过）或直接 `/wpw:design`。
