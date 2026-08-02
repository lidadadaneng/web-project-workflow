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

**知识图谱上下文准备**（必做）：

```bash
wpw graph update   # 增量更新图谱，保证代码上下文最新
```

- 图谱不存在 -> 强提示「⚠️ 未构建知识图谱，建议先执行 `wpw graph build` 以了解现有模块边界」，但仍可回退手动读文件继续

了解现有相关模块边界、接口定义、数据结构（确保设计不脱节）。

**检索策略：分层下钻 — 先 L1 定位模块边界，再 L2/L3 看接口与数据结构细节。**

```bash
# ==================== 第一步：L1 模块定位 ====================
# 用业务概念搜 L1 模块层，确认涉及哪些模块
# 检索词必须为英文，4-6 个（核心概念 + 同义词）
wpw graph search "<biz-kw-1>,<biz-kw-2>,<synonym-1>,<synonym-2>" --level L1 --limit 10 --threshold 0.45 --json

# 从结果中筛选相关模块，作为后续下钻的锚点
# 命中少时执行低召回降级（降阈值 → 多词扩展 → L3 反推 L1）

# ==================== 第二步：模块锚点扩展 ====================
# 用模块 ID 做锚点，向下扩展到文件和元素层，了解接口与数据结构
wpw graph context --anchors "<module-id-1>,<module-id-2>" --depth 2 --token-budget 3000 --level L1,L2,L3 --json

# 如果模块锚点覆盖不全，补充多词语义检索兜底
wpw graph context "<tech-kw-1>,<tech-kw-2>,<tech-kw-3>" --multi --token-budget 2000 --level L2,L3 --json

# ==================== 第三步：上下游依赖确认 ====================
# 模块定位后，查上下游依赖，了解影响范围和约束
wpw graph query --downstream <模块节点ID> --depth 2 --json
wpw graph query --upstream <模块节点ID> --depth 2 --json
```

> ⚠️ **强制规范**：`wpw graph context` 和 `wpw graph search` 的检索词必须为英文。L1 检索用业务概念词，L2/L3 检索用技术术语词。

- 0 锚点 -> 回退手动读文件，提示「图谱未匹配到相关节点」
- 向量索引缺失 -> context 降级为 `--anchors` 模式，依赖查询仍可用

### 阶段三：AI 生成

按模板（Design-Fe / Design-Server）生成技术设计大纲，**结合图谱上下文中的现有模块边界与接口定义**，确保设计贴合现有架构。

### 阶段四：确认大纲

输出 Design 大纲，等用户确认。**🛑 禁止静默落盘**。

### 阶段五：落盘 + CLI 收尾

写入 `wpw/active/<需求名>/Design-<需求名>.md`：

```bash
wpw done design -c <需求名>
```

### 阶段六：AI 后处理

执行 `after_design` hook，用 `@humanizer-zh` 去机器腔。

提示下一步：`/wpw:plan <需求名>`。
