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

**知识图谱上下文准备**（必做）：

```bash
wpw graph update   # 增量更新图谱，保证代码上下文最新
```

- 图谱不存在 -> 强提示「⚠️ 未构建知识图谱，建议先执行 `wpw graph build` 以了解模块边界」，但仍可回退继续

了解现有模块边界，辅助任务粒度切分：

```bash
# 检索词必须为英文，从需求描述翻译而来
wpw graph context "<english-keywords-from-requirement>" --token-budget 2000 --level L1,L2 --json
```

> ⚠️ **强制规范**：`wpw graph context` 和 `wpw graph search` 的检索词必须为英文。

- 0 锚点 -> 回退仅凭 Design 拆分，提示「图谱未匹配到相关节点」
- 向量索引缺失 -> context 降级为 `--anchors` 模式

### 阶段二：AI 生成

生成任务清单（`- [ ] 编号. 任务描述`）、任务依赖、估时、风险任务。
任务要求：可执行、可验证、粒度适中（一个 session 能完成）。
**结合图谱上下文中的模块边界**，确保任务切分贴合现有代码结构。

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
