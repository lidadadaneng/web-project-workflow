---
name: "WPW: Explore"
description: 技术方案探索，产出多个候选方案对比，不拍板，可跳过
category: Workflow
tags: [workflow, explore, design]
---

# /wpw:explore <需求名>

技术方案探索，产出多个候选方案、对比、风险、推荐方向，**不拍板**。
**skippable**：用户可跳过（`wpw skip explore`）。强依赖 PRD。

> **联动 Skill**：`@brainstorming`（方案发散与探索，可选）· `@humanizer-zh`（落盘后去机器腔）

## 执行流程

### 阶段一：CLI 准备

```bash
wpw new <需求名>
wpw check explore -c <需求名> --json   # 校验 PRD 已 done
wpw template explore -c <需求名>       # 取 Explore 模板
```

读取 `PRD-<需求名>.md` 作为输入。

**知识图谱上下文准备**（必做）：

```bash
wpw graph update   # 增量更新图谱，保证代码上下文最新
```

- 图谱不存在 -> 强提示「⚠️ 未构建知识图谱，建议先执行 `wpw graph build` 以了解现有架构」，但仍可回退手动 grep 继续

了解现有相关模块与依赖关系（替代逐文件扫描，大幅降低 Token）：

```bash
# 语义检索相关模块（检索词必须为英文，从需求描述翻译而来）
wpw graph context "<english-keywords-from-requirement>" --token-budget 3000 --depth 2 --json

# 了解特定模块的上下游依赖
wpw graph query --downstream <模块节点ID> --depth 3 --json
wpw graph query --upstream <模块节点ID> --depth 2 --json
```

> ⚠️ **强制规范**：`wpw graph context` 和 `wpw graph search` 的检索词必须为英文。中文需求描述需先翻译为英文关键词再检索。

- 0 锚点 -> 回退手动 grep，提示「图谱未匹配到相关节点」
- 向量索引缺失 -> context 降级为 `--anchors` 模式，依赖查询仍可用

### 阶段二：AI 生成候选方案

分轮探索 ≥2 个候选技术方案。**每轮只记录涉及文件与结论，不记录讨论/推导过程。**
每轮含：涉及文件（本方案会改动/新增的文件，可结合图谱上下文确定）、结论（优点/缺点/实现成本/适用场景）。
输出方案对比表（实现成本/性能/可维护性/风险）、风险识别、推荐方向（含理由，但⚠️不拍板）。

### 阶段三：确认大纲

输出 Explore 大纲，等用户确认。**🛑 禁止静默落盘**。

### 阶段四：落盘 + CLI 收尾

写入 `wpw/active/<需求名>/Explore-<需求名>.md`：

```bash
wpw done explore -c <需求名>
```

### 阶段五：用户拍板（关键）

落盘后，用 **AskUserQuestion** 让用户确认采纳的方案：

```bash
wpw decision explore -c <需求名> --option "<采纳方案>"
```

记录拍板后，方可进入 `/wpw:design`。

### 跳过流程

若用户决定跳过探索：

```bash
wpw skip explore -c <需求名>
```

直接进入 `/wpw:design`（Design 将仅基于 PRD）。

### AI 后处理

用 `@humanizer-zh` 去机器腔。
