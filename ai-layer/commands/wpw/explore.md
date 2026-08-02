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

了解现有相关模块与依赖关系（替代逐文件扫描，大幅降低 Token）。

**检索策略：L1 优先 + 多词扩展，广撒网找方向。**

```bash
# ==================== 第一步：L1 模块定位 ====================
# 用业务概念搜 L1 模块层（阈值调低，宁滥勿缺）
# 检索词必须为英文，从需求描述中的业务概念翻译而来
# 生成 4-6 个不同角度的检索词（核心概念 + 同义词 + 相关领域术语）
wpw graph search "<biz-keyword-1>,<biz-keyword-2>,<synonym-1>,<synonym-2>" --level L1 --limit 10 --threshold 0.45 --json
# 例: wpw graph search "user auth,authentication,login,account,member" --level L1 --limit 10 --threshold 0.45 --json

# 从结果中筛选相关的 L1 模块（AI 判断业务相关性）
# 命中 ≥2 个相关模块 → 进入第二步
# 命中 1 个 → 直接用该模块做锚点
# 命中 <1 → 执行低召回降级（见下方）

# ==================== 第二步：模块下钻 + 多词扩展 ====================
# 用 --multi 并行查询多个角度的检索词，生成综合上下文
# 检索词构成：核心业务概念 + 同义词 + 技术术语
wpw graph context "<keyword-1>,<keyword-2>,<keyword-3>,<keyword-4>,<keyword-5>" --multi --token-budget 3000 --depth 2 --json

# 也可以直接用模块 ID 做锚点扩展（更准更快）
wpw graph context --anchors "<module-id-1>,<module-id-2>" --depth 2 --token-budget 3000 --json

# ==================== 第三步：上下游依赖 ====================
# 了解特定模块的上下游依赖
wpw graph query --downstream <模块节点ID> --depth 3 --json
wpw graph query --upstream <模块节点ID> --depth 2 --json
```

> ⚠️ **强制规范**：`wpw graph context` 和 `wpw graph search` 的检索词必须为英文。中文需求描述需先翻译为英文关键词再检索。

**低召回降级流程（L1 查不到时）**：

1. **Level 1 — 降阈值**：将 threshold 从 0.45 降到 0.4，再搜一次
2. **Level 2 — 多词扩展**：补充更多同义词/相关词，最多 6-8 个查询，用 `--multi`
3. **Level 3 — L3 反推 L1**：搜 L3 找到相关函数 → 看它们属于哪个模块 → 同模块有 ≥2 个相关函数则整个模块算相关

- 0 锚点 / 三级降级后仍无有效结果 -> 回退手动 grep，提示「图谱未匹配到相关节点」
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
