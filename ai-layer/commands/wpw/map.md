---
name: "WPW: Map"
description: 构建/查询知识图谱，生成上下文
category: Workflow
tags: [workflow, map, graph, knowledge, context]
---

# /wpw:map

构建与查询项目知识图谱，按需生成可直接喂给 LLM 的结构化上下文。

> ⚠️ **强制规范：语义检索必须使用英文检索词**
> 调用 `wpw graph search` 和 `wpw graph context`（非 --anchors 模式）时，检索词必须为英文。
> 中文需求/任务描述需先翻译为英文关键词再检索。
> 原因：能力节点和代码节点 name 字段多为英文 kebab-case，英文检索与 name-match 证据源配合效果更好。

## 何时使用

- **编码前**：先查上下文，了解相关模块/文件/函数的依赖关系
- **需求理解**：用自然语言检索与需求相关的代码
- **影响面分析**：查询某模块/函数的上下游依赖
- **新人上手**：快速了解项目结构与模块职责

## 图谱架构（C + L1/L2/L3 四层）

```
C  业务能力（capability）
  └─ business_map ─┐
                   ▼
L1 业务模块（module）
  └─ contain
    L2 文件（file）
      └─ contain
        L3 代码元素
          ├─ 函数
          ├─ 类
          ├─ 接口
          ├─ 组件
          └─ 常量
```

- **C 层（能力层）**：来自 `wpw/specs/` 目录下的 OpenSpec 规范，稳态业务能力
- **L1 层（模块层）**：业务模块。CLI 默认按目录结构自动推断，AI 在 map 阶段可通过配置 `graph.modules` 手动纠正（优先级更高）
- **L2 层（文件层）**：源码文件
- **L3 层（元素层）**：函数、类、接口、组件等代码元素

边类型：`contain`（包含）、`import`（导入）、`call`（调用）、`inherit`（继承）、`business_map`（业务映射，C → L1/L2/L3）

> **置信度衰减锚点选择**：语义检索选锚点时，若 C 层有高置信度匹配，L1（模块层）得分会被指数衰减，
> 防止粗粒度模块节点膨胀子图。C 层为空时自动退化为全权重结构检索。

## 常用操作

### 1. 构建/更新图谱

首次使用或代码有较大变更时：

```bash
wpw graph build      # 全量构建
wpw graph update     # 增量更新（仅重新解析变更文件 + 检测能力 spec 变更）
wpw graph rebuild    # 强制重建
```

> 构建速度快（万行级项目约 100~500ms），日常开发 update 即可。
> Schema 版本不兼容时 update 会自动全量重建（如升级到 3.0 架构）。

### 2. 查看统计

```bash
wpw graph stat
wpw graph stat --json
```

### 3. 生成上下文（最常用）

用自然语言查询，输出直接可用于编码的上下文：

```bash
# 基本用法（检索词必须为英文）
wpw graph context "user login authentication"

# 指定 Token 预算（默认 8000）
wpw graph context "login" --token-budget 4000

# 指定压缩等级：loose / standard / extreme
wpw graph context "login" --compression standard

# JSON 输出（供程序解析）
wpw graph context "login" --json
```

输出格式（文本模式）：

```
=== 知识图谱上下文 ===

符号说明:
  ⊃  包含关系 (contain)
  →  依赖关系 (call/import/inherit)
  ⇄  业务映射 (business_map)

--- 能力层 (C) ---
⇄ [能力] user-auth ◉
  ⇄ [L1] auth [0.92]
  ⇄ [L2] src/auth/login.ts [0.85]
  • R1: 用户登录 [P0]
  • R2: Token 验证 [P1]

--- 结构层 (L1/L2/L3) ---
⊃ [模块] auth
  ⊃ [文件] login.ts
    ⊃ function login(username: string, password: string): Promise<User>
    ⊃ function validateToken(token: string): User | null
  ⊃ [文件] jwt.ts
...

--- 依赖关系 ---
  login.ts → jwt.ts
  login.ts → user.ts

--- 统计 ---
锚点数: 3
子图节点: 28
子图边: 45
预估 Token: 1520
压缩率: 3.2x
总耗时: 24ms
```

### 4. 结构化查询

```bash
# 按层级/类型查询节点
wpw graph query --level L1           # 模块层
wpw graph query --level C            # 能力层
wpw graph query --type function --limit 20

# 查询下游依赖
wpw graph query --downstream <nodeId> --depth 3

# 查询上游依赖
wpw graph query --upstream <nodeId> --depth 2

# 查询两节点间最短路径
wpw graph query --path <fromId>,<toId>

# JSON 输出
wpw graph query --level L3 --json
```

### 5. 语义检索

```bash
# 检索词必须为英文
wpw graph search "user authentication" --limit 10
wpw graph search "database connection" --level L3 --json
```

## 高级用法

### 直接指定锚点

跳过语义检索，以已知节点为中心生成上下文（锚点模式无需英文）：

```bash
wpw graph context --anchors mod:auth,file:src/auth/login.ts
```

> 直接锚点模式会跳过置信度衰减，所有锚点同等权重。

### 多查询合并

同时检索多个关键词，合并生成统一上下文（所有关键词必须为英文）：

```bash
wpw graph context "login,registration,password-reset" --multi
```

### 层级过滤

只关心某几层的信息：

```bash
wpw graph context "login" --level L2,L3     # 只看文件和代码元素
wpw graph context "auth" --level C,L1       # 只看能力和模块
wpw graph context "auth" --level L1         # 只看模块级
```

### 深度与权重控制

```bash
wpw graph context "login" --depth 2 --min-weight 0.8
```

## 映射配置（workflow.config.yaml）

### 模块划分（L1 纠正）

CLI 会根据目录结构自动推断 L1 模块，但默认推断不一定符合实际业务语义（如模块嵌套在 `modules/` 子目录下、或多个目录同属一个业务模块等）。AI 在 map 阶段应主动检查并纠正模块划分，通过 `graph.modules` 手动指定：

```yaml
graph:
  modules:
    - name: user-auth          # 模块名（业务语义）
      side: frontend           # frontend | backend | shared
      dir: src/views/modules/users   # 对应源码目录
      description: 用户登录与权限管理
    - name: order-management
      side: frontend
      dir: src/views/modules/orders
      description: 订单创建、查询、支付流程
```

> **CLI 的自动推断只是兜底**。AI 执行 /wpw:map 时应使用 `wpw graph query --level L1` 检查当前模块划分是否合理，
> 不合理则通过 `graph.modules` 写入纠正后重新 `wpw graph rebuild`。

### 业务映射（business_map 融合）

`graph.mapping` 段控制业务-代码映射（business_map 边）的多源证据融合：

```yaml
graph:
  mapping:
    semanticThreshold: 0.5   # 语义匹配相似度阈值（未设置则回退 search.threshold）
    semanticTopK: 5          # 每个能力语义召回的 Top-K 候选
    gitHistory: true         # 是否启用 Git 历史追溯源
    gitMaxCommits: 1000      # Git 回溯最大 commit 数
    gitMinFreq: 2            # Git 文件频次下限，低于此不作为证据（过滤单次修改噪声）
  search:
    decayAlpha: 3.0          # 置信度衰减系数 α，值越大 L1 衰减越快（默认 3.0）
```

四源证据（doc-extract / semantic / git-history / name-match）按 noisy-OR 聚合权重，边的 `source` 取最权威源。AI 校准（ai-refine）为可选未来工作。

## Map 阶段的 AI 工作流

/wpw:map 的核心是 **AI 主导、CLI 执行**。AI 负责判断业务语义上的模块划分，CLI 只负责解析和构建。

标准流程：

```
1. wpw graph build / update               # CLI 先自动构建一版（兜底）
2. wpw graph query --level L1             # 检查自动推断的 L1 模块是否合理
3. 若不合理，在 workflow.config.yaml 中写入 graph.modules
4. wpw graph rebuild                      # 按纠正后的模块定义重建
5. wpw graph context "<keywords>"         # 验证上下文质量
```

判断 L1 是否合理的标准：
- 每个 L1 模块是否对应一个独立的业务领域（如用户、订单、商品）
- 是否存在"容器型"模块（名叫 modules / biz，本身没有业务语义）
- 模块粒度是否均匀（不要一个模块 50 个文件，另一个只有 2 个）

## 在 Apply 阶段的使用流程

```
1. wpw graph update                                    # 确保图谱最新（增量，快）
2. wpw graph context "<english-keywords-from-task>"    # 生成上下文（英文检索词）
3. 根据上下文理解相关代码结构
4. 实施编码
5. 编码完成后再 update 一次
```

> 上下文生成是 **纯本地计算**，不消耗任何 API Token。
> 向量索引基于本地 embedding 模型（Xenova/bge-small-zh-v1.5），首次构建会自动下载模型。
