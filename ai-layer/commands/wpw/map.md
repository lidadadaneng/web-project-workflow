---
name: "WPW: Map"
description: 构建/查询知识图谱，生成上下文
category: Workflow
tags: [workflow, map, graph, knowledge, context]
---

# /wpw:map

构建与查询项目知识图谱，按需生成可直接喂给 LLM 的结构化上下文。

## 何时使用

- **编码前**：先查上下文，了解相关模块/文件/函数的依赖关系
- **需求理解**：用自然语言检索与需求相关的代码
- **影响面分析**：查询某模块/函数的上下游依赖
- **新人上手**：快速了解项目结构与模块职责

## 四层图谱模型

```
L1 业务需求 → L2 业务模块 → L3 文件 → L4 代码元素
                                             ├─ 函数
                                             ├─ 类
                                             ├─ 接口
                                             ├─ 组件
                                             └─ 常量
```

边类型：`contain`（包含）、`import`（导入）、`call`（调用）、`inherit`（继承）、`business_map`（业务映射）

## 常用操作

### 1. 构建/更新图谱

首次使用或代码有较大变更时：

```bash
wpw graph build      # 全量构建
wpw graph update     # 增量更新（仅重新解析变更文件）
wpw graph rebuild    # 强制重建
```

> 构建速度快（万行级项目约 100~500ms），日常开发 update 即可。

### 2. 查看统计

```bash
wpw graph stat
wpw graph stat --json
```

### 3. 生成上下文（最常用）

用自然语言查询，输出直接可用于编码的上下文：

```bash
# 基本用法
wpw graph context "用户登录认证"

# 指定 Token 预算（默认 8000）
wpw graph context "登录" --token-budget 4000

# 指定压缩等级：loose / standard / extreme
wpw graph context "登录" --compression standard

# JSON 输出（供程序解析）
wpw graph context "登录" --json
```

输出格式（文本模式）：

```
=== 知识图谱上下文 ===

符号说明:
  ⊃  包含关系 (contain)
  →  依赖关系 (call/import/inherit)
  ⇄  业务映射 (business_map)

⊃ [需求] 用户登录认证 ◉
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
wpw graph query --level L2
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
wpw graph search "用户认证" --limit 10
wpw graph search "数据库连接" --level L4 --json
```

## 高级用法

### 直接指定锚点

跳过语义检索，以已知节点为中心生成上下文：

```bash
wpw graph context --anchors mod:auth,file:src/auth/login.ts
```

### 多查询合并

同时检索多个关键词，合并生成统一上下文：

```bash
wpw graph context "登录,注册,密码找回" --multi
```

### 层级过滤

只关心某几层的信息：

```bash
wpw graph context "登录" --level L3,L4    # 只看文件和代码
wpw graph context "认证" --level L2        # 只看模块级
```

### 深度与权重控制

```bash
wpw graph context "登录" --depth 2 --min-weight 0.8
```

## 在 Apply 阶段的使用流程

```
1. wpw graph update                # 确保图谱最新（增量，快）
2. wpw graph context "<需求描述>"  # 生成上下文
3. 根据上下文理解相关代码结构
4. 实施编码
5. 编码完成后再 update 一次
```

> 上下文生成是 **纯本地计算**，不消耗任何 API Token。
> 向量索引基于本地 embedding 模型（all-MiniLM-L6-v2），首次构建会自动下载模型（约 80MB）。
