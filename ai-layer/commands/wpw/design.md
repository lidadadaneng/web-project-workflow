---
name: "WPW: Design"
description: 技术方案设计，基于 PRD 与 Explore 拍板方案定稿
category: Workflow
tags: [workflow, design]
---

# /wpw:design <需求名>

技术方案设计。强依赖 PRD，弱依赖 Explore（有则基于拍板方案深化，无则仅基于 PRD）。

## 执行流程

### 阶段一：CLI 准备

```bash
wpw new <需求名>
wpw check design -c <需求名> --json   # 校验 PRD done；若 Explore done 未拍板则 warnings
wpw template design -c <需求名>       # 取 Design 模板（按 project.type 选 Fe/Server）
```

处理 `check` 结果：
- `canProceed: false`（PRD 未完成）→ 提示先 `/wpw:prd`，停止
- `warnings` 含「explore 未拍板」→ 提示用户先执行 `wpw decision explore` 或确认跳过 explore

### 阶段二：读取上下文

- 必读：`PRD-<需求名>.md`
- 若 `explore` 已 done：读 `Explore-<需求名>.md` + `decisions.explore.chosenOption`，**基于拍板方案深化**
- 若 `explore` skipped：仅基于 PRD 设计

### 阶段三：AI 生成

按模板（Design-Fe / Design-Server）生成技术设计大纲。

### 阶段四：确认大纲

输出 Design 大纲，等用户确认。**🛑 禁止静默落盘**。

### 阶段五：落盘 + CLI 收尾

写入 `wpw/active/<需求名>/Design-<需求名>.md`：

```bash
wpw done design -c <需求名>
```

### 阶段六：AI 后处理

执行 `after_design` hook，用 `@Humanizer-zh` 去机器腔。

提示下一步：`/wpw:plan <需求名>`。
