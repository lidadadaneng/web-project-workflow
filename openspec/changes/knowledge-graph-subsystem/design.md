## Context

WPW 是一个 AI 驱动的六阶段开发工作流 CLI 工具，基于 TypeScript + Node.js 开发，使用 Commander 作为命令框架，通过 `wpw/` 需求目录规范与 `workflow.config.yaml` 配置体系管理项目研发流程。当前 AI 工作流在上下文构建上依赖人工指定文件路径，缺乏结构化的需求-代码链路建模能力。

本设计在现有 WPW CLI 基础上新增知识图谱子系统，新增 `src/graph/` 目录与 `wpw graph` 命令组，以纯新增、非破坏性方式扩展能力。子系统默认零付费 Token 运行，所有计算本地完成，供 AI 层 Skill 通过 CLI 命令调用。

## Goals / Non-Goals

**Goals:**
- 构建「业务需求-模块-源码文件-代码元素」四层结构化知识图谱
- 提供语义检索、最小依赖子图抽取、结构感知上下文压缩三大核心能力
- 提供端到端 `wpw graph context` 命令，直接输出 AI 可用的结构化上下文
- 全本地运行，默认零付费 Token（本地 Embedding，不调用远程 API）
- 产物不纳入 Git，遵循「源数据进 Git、产物本地构建」原则
- 提供 CLI 命令 + JSON 输出接口，供上层 AI 层 Skill 调用
- 万级节点全量构建 ≤ 60s，单文件增量更新 ≤ 3s，检索+裁剪+压缩总耗时 ≤ 300ms（含进程启动）

**Non-Goals:**
- 不包含需求状态管理、工作流调度（现有 WPW 功能）
- 不包含 LLM 调用逻辑（由 AI 层 Skill 负责）
- 不提供 Web UI 或可视化界面（仅 CLI + API）
- 不支持分布式或多项目联合图谱
- 不实现自定义 Embedding 模型训练（使用现成模型）
- 不做常驻后台服务（首版每次 CLI 调用加载数据）
- 不追求需求→代码映射 100% 准确（手动配置为主、语义补充为辅）

## Decisions

### 1. 存储方案：纯内存计算 + JSONL 全量重写

**决策**：查询和计算全部在内存中完成，结构化数据存储为 JSONL 文件，向量索引存储为独立二进制文件。首版采用全量重写模式实现增量更新。

**存储结构**：
```
.wpf/
├── graph.jsonl          # 结构化图谱数据（节点 + 边，JSON Lines 格式）
├── index/
│   └── vector.index     # 语义向量索引（二进制，float32 连续存储）
└── meta.json            # 元数据：构建时间、节点边总数、文件哈希快照、配置版本
```

**理由**：
- 简单：无数据库依赖，无需 SQL，纯 JS 对象操作
- 快速：内存中做 BFS、裁剪、过滤，比 SQL 查询高效得多
- 好调试：JSONL 人类可读，随时可以打开查看
- 够用：万级节点 JSONL 约 1-2MB，加载 20-50ms，完全在性能预算内
- 增量更新通过全量重写实现，单文件更新也在 3s 指标内

**备选方案**：
- SQLite 存储 + 内存查询（混合方案）：写入更灵活，但多一个原生依赖，首版不需要
- 纯二进制文件：体积小加载快，但调试不便，后续可升级
- LMDB / LevelDB：键值存储，增加复杂度，收益不明显

**升级路径**：存储层通过 `GraphStore` 接口抽象，首版用 JSONL，后续如需更高性能或更灵活写入，可无缝替换为 SQLite 或二进制格式。

### 2. 源码解析：web-tree-sitter（WASM 版本）

**决策**：使用 `web-tree-sitter`（WASM 版本）作为语法解析引擎。

**理由**：
- 纯 WASM 实现，无原生编译依赖，跨平台安装零摩擦
- 支持 TypeScript / JavaScript 等语言，首版聚焦 TS/JS
- 与 `tree-sitter` 原生版本语法完全兼容，未来可无缝切换
- 解析性能满足万级节点规模需求

**备选方案**：
- `tree-sitter` 原生绑定：需要 node-gyp 编译，Windows 环境体验差
- TypeScript Compiler API：仅支持 TS/JS，无法扩展到其他语言
- `@babel/parser`：仅 JS/TS，构建完整 AST 开销更大

### 3. Embedding 方案：本地轻量模型，零付费 Token

**决策**：使用 `@xenova/transformers` 加载 `all-MiniLM-L6-v2`（384 维）本地模型，纯本地运行，无远程 API 选项。

**AI 使用边界**：
```
✅ 零付费 Embedding：
  • 本地 Embedding 推理（@xenova/transformers + all-MiniLM-L6-v2）
  • 纯本地计算，不调用任何远程 API
  • 模型文件首次下载后永久缓存
  • 不提供远程 Embedding API 选项（用户本身在大模型环境中使用，无此需求）

⚙️ 可选 AI 校准（用户主动开启）：
  • LLM 精排映射结果，极少量 Token 消耗
  • 需用户配置 LLM API 信息（与用户当前使用的大模型同源）
  • 默认关闭，默认模式零付费 Token
```

**理由**：
- 全本地运行，无网络依赖，符合「轻量协作友好」原则
- 零付费 Token，用户使用无成本顾虑
- 384 维向量在召回质量与计算开销间取得良好平衡
- 提供配置项允许用户切换到远程 API，兼顾质量需求

**备选方案**：
- 纯远程 API：依赖网络、有成本、有隐私考量，不作为默认
- 中文优化模型（gte-small-zh / bge-small-zh）：中文效果更好，可作为后续优化

### 4. 边模型：文件级 import + 文件内元素级 call/inherit

**决策**：跨文件依赖边仅做到文件级（import），文件内依赖做到元素级（call / inherit）。

**边类型总览**：
```
跨层从属边 contain（权重 0.9）：
  req ⊃ mod        需求包含模块
  mod ⊃ file       模块包含文件
  file ⊃ elem      文件包含元素

层内依赖边：
  import （权重 0.75）  文件 → 文件，跨文件导入
  call    （权重 0.95）  元素 → 元素，文件内函数调用
  inherit （权重 0.85）  元素 → 元素，文件内类继承/接口实现

业务映射边 business_map（权重 0.5~0.9 动态）：
  req ⇄ mod/elem  需求映射到模块或函数/接口
```

**理由**：
- 跨文件函数调用的静态分析极难（动态派发、回调、依赖注入等），精度低且实现复杂
- 文件级 import 边 100% 准确，实现简单
- 文件内 call / inherit 边通过 AST 可精确提取，保证图谱在文件内的精度
- 精度损失可控：子图裁剪时，import 边把整个文件拉进来，虽然比元素级粗，但文件内元素级边能进一步定位

**权衡**：接受跨文件粒度为文件级的精度损失，换取实现简单、数据可靠。首版验证价值后，后续可增加符号级 import 边提升精度。

### 5. 需求→代码映射：五层混合自动策略（零人工配置）

**决策**：采用「文档提取 + 本地 Embedding + Git 追溯 + 命名匹配 + LLM 校准」五层混合自动映射策略，完全无需人工配置，默认零付费 Token。

详见「与现有需求体系的对接规范」第 1 节。

**核心原则**：
- 规则与本地 Embedding 负责召回（广度），零 Token
- LLM 负责精排与去伪存真（精度），极少量 Token（可选开启）
- 多证据叠加加权：被越多证据命中，权重越高
- 默认纯本地模式，AI 增强用户主动开启

**权重叠加规则**：
- 多层证据同时命中同一目标 → 权重递增（不超过 0.95）
- 单层命中 → 按该层基础权重
- 低于最小阈值（0.3）的不建边

### 6. 四层架构与模块划分

**决策**：按源数据接入层 → 图谱构建引擎 → 存储索引层 → 能力输出层四层划分模块。

```
src/graph/
├── types.ts                    # 类型定义（节点、边、图谱配置）
├── config.ts                   # 图谱配置读取与默认值
├── storage/
│   ├── graph-store.ts          # GraphStore 接口 + JSONL 实现
│   ├── vector-store.ts         # 向量索引读写（二进制文件）
│   └── meta-store.ts           # 元数据与哈希快照（meta.json）
├── parsers/
│   ├── requirement-parser.ts   # 需求文档解析
│   ├── module-parser.ts        # 模块目录解析
│   ├── source-parser.ts        # 源码文件解析调度器
│   ├── ts-parser.ts            # TypeScript 解析器（tree-sitter）
│   └── js-parser.ts            # JavaScript 解析器
├── builders/
│   ├── graph-builder.ts        # 全量/增量构建调度器
│   ├── node-builder.ts         # 节点生成逻辑
│   ├── edge-builder.ts         # 关系边生成逻辑
│   └── vector-builder.ts       # 向量生成与索引构建
├── search/
│   ├── semantic-search.ts      # 语义检索引擎
│   └── graph-query.ts          # 结构化查询 API
├── trimming/
│   └── subgraph-trimmer.ts     # 子图裁剪（双向 BFS）
├── compression/
│   ├── skeleton-extractor.ts   # 语法骨架抽取
│   └── hierarchical-serializer.ts  # 层级化序列化
├── context/
│   └── context-pipeline.ts     # 端到端 context pipeline
├── commands/
│   ├── build.ts                # wpw graph build
│   ├── update.ts               # wpw graph update
│   ├── rebuild.ts              # wpw graph rebuild
│   ├── stat.ts                 # wpw graph stat
│   ├── query.ts                # wpw graph query
│   ├── search.ts               # wpw graph search
│   └── context.ts              # wpw graph context
└── index.ts                    # 对外导出 API
```

### 7. 节点 ID 生成方案

**决策**：使用基于内容的哈希生成 `node_id`，格式为 `<层级前缀>:<内容哈希前12位>`。

- L1 需求：`req:<sha256(需求路径+名称).slice(0,12)>`
- L2 模块：`mod:<sha256(模块名称+所属端).slice(0,12)>`
- L3 文件：`file:<sha256(文件相对路径).slice(0,12)>`
- L4 元素：`elem:<sha256(文件相对路径 + 元素签名 + 元素类型).slice(0,12)>`

**理由**：
- 确定性 ID：相同源码 + 相同配置 → 相同 ID，保证多人协作一致性
- 前缀标识层级，便于快速识别节点类型
- SHA-256 与文件哈希算法一致，统一使用
- 12 位十六进制（48 位）在万级节点规模下冲突概率可忽略
- 文件级 node_id 基于路径，与元素签名无关 → import 边稳定，增量更新无断边问题

### 8. 增量更新策略：文件级全量重写

**决策**：基于文件内容哈希快照的增量更新，采用"加载内存 → 修改 → 全量重写"模式。

```
流程：
  1. 读取 meta.json 中的文件哈希快照
  2. 扫描当前文件状态，对比哈希，识别新增/修改/删除
  3. 加载 graph.jsonl 到内存
  4. 删除变更文件关联的所有节点与边
  5. 重新解析变更文件，生成新节点与边
  6. 全量序列化为新文件 graph.jsonl.new
  7. 原子重命名覆盖旧文件
  8. 更新 meta.json 中的哈希快照
```

**理由**：
- 实现简单，逻辑清晰，bug 少
- 文件级粒度 + 文件级 import 边 = 无跨文件断边问题
- 万级节点全量序列化耗时约 50-200ms，远低于 3s 指标
- 原子重命名保证读取一致性

### 9. 子图裁剪算法：加权双向 BFS + 节点上限裁剪

**决策**：加权双向 BFS 扩展 + 语义分与结构重要度综合排序裁剪。

```
算法流程：
  1. 以锚点集合为起始，同时沿入边（上游）和出边（下游）做 BFS
  2. 边权重阈值过滤，低于阈值的边不参与遍历
  3. 控制最大深度（默认 3 层）防止扩散
  4. 多锚点结果合并去重
  5. 若超出节点上限，按「语义分 × 0.6 + 结构重要度 × 0.4」排序裁剪
  6. 结构重要度 = 加权入度（高权重边指向的节点更重要）
```

**理由**：
- 双向 BFS 比单向更高效，能快速找到锚点间的关联路径
- 权重过滤有效控制子图规模，避免弱关联边导致爆炸
- 综合得分裁剪兼顾语义相关性与结构连通性
- 加权入度作为结构重要度的简化版，实现简单且效果足够

### 10. 集成方式：CLI 命令 + JSON 输出

**决策**：通过 `wpw graph` CLI 命令对外提供能力，输出 JSON 格式供上层 AI 层 Skill 调用。

**核心命令**：
```
wpw graph build     # 全量构建
wpw graph update    # 增量更新
wpw graph rebuild   # 强制重建
wpw graph stat      # 统计概览
wpw graph query     # 节点与依赖查询（--json 输出）
wpw graph search    # 语义检索（--json 输出）
wpw graph context   # 端到端上下文生成（检索+裁剪+压缩，--json 输出）
```

**`wpw graph context` 为核心集成入口**：
- 输入：自然语言查询 + 各种参数（深度、权重、Token 预算、压缩等级等）
- 输出：JSON 格式，包含子图节点边、压缩文本、统计信息
- AI 层 Skill 调用此命令，将压缩文本直接喂给 LLM

**不做常驻进程**：
- 首版每次 CLI 调用加载数据（~100-200ms）
- 对于 AI 编码场景（一次对话调用几次）完全可接受
- 后续如性能不足，再加常驻进程优化

### 11. 多语言与框架支持

**决策**：以 tree-sitter 为核心扩展前端主流语言，首版覆盖 TS/TSX/JS/JSX/Vue。

**支持矩阵**：

| 语言/框架 | 扩展名 | 解析方式 | 支持元素 |
|----------|--------|---------|---------|
| TypeScript | `.ts` | tree-sitter-typescript | 函数/类/接口/常量/类型别名 |
| TSX | `.tsx` | tree-sitter-tsx | 函数/组件/类/接口/常量 |
| JavaScript | `.js` `.mjs` `.cjs` | tree-sitter-javascript | 函数/类/常量 |
| JSX | `.jsx` | tree-sitter-javascript | 函数/组件/类/常量 |
| Vue SFC | `.vue` | 提取 `<script>` 块 + JS/TS 解析 | 函数/组件/导入导出 |

**Vue SFC 处理策略**：
- 用正则提取 `<script setup>` 和 `<script>` 块的文本内容
- 根据 `lang` 属性选择解析器（默认 javascript，`lang="ts"` 用 typescript）
- 模板（`<template>`）和样式（`<style>`）首版不解析
- 文件节点标记为 `language: vue`，组件名从文件名推断

**组件识别规则**：
- `.tsx` / `.jsx` 文件中，首字母大写的函数 = React 组件
- `.vue` 文件中，默认导出的对象 = Vue 组件（从文件名生成组件名）

**理由**：
- TSX 需要单独的 WASM（tree-sitter-tsx.wasm），因为 TS 语法包不包含 JSX
- JSX 在 tree-sitter-javascript 中原生支持
- Vue SFC 无法用单一 tree-sitter 语法解析，提取 script 块是性价比最高的方案
- 模板解析收益较低（主要是 UI 结构），首版聚焦 script 中的逻辑代码

**后续可扩展**：
- Svelte、Astro 等同理（提取 script 块）
- 模板解析（Vue template / JSX 中的组件调用关系）

### 12. 向量索引构建与 buildGraph 集成

**决策**：向量构建作为 buildGraph 的一个可选阶段，默认开启，首次运行自动下载模型，失败降级为无向量模式。

**构建流程**：
```
buildGraph:
  1. 解析需求/模块/源码
  2. 构建边
  3. 完整性校验
  4. 保存图谱 JSONL
  5. [可选] 构建向量索引 → 保存 vector.index + vector-mapping.json
  6. 更新 meta.json（含 totalVectors）
```

**向量构建触发条件**：
- 全量构建（build）：默认生成向量
- 增量更新（update）：全量重建向量（实现简单，节点数不大时可接受）
- 强制重建（rebuild）：重新生成向量

**配置开关**：
```yaml
graph:
  embedding:
    enabled: true           # 是否生成向量（默认 true）
    model: Xenova/all-MiniLM-L6-v2
    dimensions: 384
```

**降级策略**：
- 模型下载失败 → 跳过向量生成，输出警告
- 后续执行 `wpw graph rebuild` 可重试
- 无向量时 `wpw graph search` 给出明确提示
- `wpw graph context` 的语义检索模式不可用，但 `--anchors` 模式正常

**性能预期**：
- 500 个节点向量生成：约 2~5s（CPU 推理）
- 全量构建在有向量时总耗时：5~10s（可接受，build 不是高频操作）
- 查询时加载向量：约 10~50ms（二进制文件直接读入）

**缓存策略**：
- 模型文件由 @xenova/transformers 自动缓存到 `~/.cache/huggingface/`
- 向量索引每次构建全量重写（原子写入）

## 与现有需求体系的对接规范

知识图谱子系统不是孤立运行的，它深度依赖 WPW 已有的需求目录规范、`.wpw.yaml` 状态体系、`workflow.config.yaml` 配置体系。本节明确定义所有对接接口。

### 1. 需求→代码混合自动映射策略（零人工配置）

采用「规则 + 本地 Embedding + Git 追溯 + 命名匹配 + LLM 校准」五层混合策略，全自动建立需求与代码的映射关系，无需任何人工配置。

```
Layer 1: 文档提取（零 Token，高置信）
  ├── 从 PRD "依赖模块" 字段正则提取模块名
  ├── 从 Design "模块划分" 表格提取模块名 + 职责
  ├── 从 Design "接口设计" 提取接口名称与路径
  └── 提取结果去代码中做字符串匹配 → 建高权重边（0.85）

Layer 2: 本地 Embedding 语义匹配（零 Token，中置信）
  ├── 需求全文（BRD+PRD）向量 vs 所有模块/文件/函数向量
  ├── 余弦相似度 Top-N 结果
  ├── 权重 = 相似度 × 0.75（动态权重，0.3~0.75）
  └── 低于阈值（默认 0.5）的不建边

Layer 3: Git 历史追溯（零 Token，中置信）
  ├── 搜索 commit message 中含需求名/关键词的 commit
  ├── 统计这些 commit 修改的文件频次
  ├── 高频文件 → 按频次动态计算权重（0.4~0.7）
  └── 仅对已有 Git 历史的需求生效

Layer 4: 命名匹配（零 Token，低置信，兜底）
  ├── 需求目录名 slug 与模块/文件名做字符串匹配
  ├── 中英文关键词映射（如"认证" → auth, "用户" → user）
  └── 命中 → 低权重边（0.4），作为长尾兜底

Layer 5: LLM 校准（极少量 Token，可选开启）
  ├── 输入：需求摘要 + 前 4 层得到的 Top-20 候选（带证据与分数）
  ├── 输出：确认后的相关模块/文件列表 + 置信度 + 去伪存真
  ├── 每个需求仅调用 1 次小模型
  ├── 费用：~¥0.0003 / 需求（20 个需求约 ¥0.01）
  └── 默认关闭，用户配置开启后生效
```

**权重叠加规则**：同一目标被多层证据命中时，权重叠加（不超过 0.95）。被越多证据命中，置信度越高。

**Token 成本控制**：
- 默认模式（Layer 1-4）：零付费 Token，纯本地计算
- AI 增强模式（Layer 1-5）：每需求 ~1700 token，20 需求约 ¥0.01
- 模块划分 LLM 校准：全项目 1 次，~¥0.002
- 增量更新：仅新增或大幅修改的需求重新校准

**设计原则**：Embedding 和规则负责召回（广度），LLM 负责精排（精度）。各干各擅长的，最小化 Token 消耗。

### 2. 需求文档向量化文本提取规则

L1 需求节点的语义向量基于需求文档内容生成，提取规则如下：

| 文档 | 是否参与向量化 | 提取范围 | 说明 |
|------|--------------|----------|------|
| BRD-xxx.md | ✅ 参与 | 全文（剔除 Markdown 格式标记） | 业务需求描述，核心语义来源 |
| PRD-xxx.md | ✅ 参与 | 全文（剔除 Markdown 格式标记） | 产品需求细节，补充语义 |
| Explore-xxx.md | ❌ 不参与 | — | 技术探索方案，含大量噪音 |
| Design-xxx.md | ❌ 不参与 | — | 技术设计，已体现在代码层 |
| Plan-xxx.md | ❌ 不参与 | — | 任务计划，非需求语义 |
| TestPlan-xxx.md | ❌ 不参与 | — | 测试用例，非需求语义 |

**组合方式**：将 BRD 全文与 PRD 全文拼接为一段文本，生成一个向量代表该需求节点。
**预处理**：剔除 Markdown 标题标记、代码块、表格格式符，保留纯文本内容与结构信息。

### 3. 模块划分规则

L2 业务模块节点通过「目录结构自动推断 + 可选 LLM 校准」方式全自动生成，无需手动配置。

**自动推断规则**（按优先级）：

```
1. 模块化框架目录（最高优先级）：
   - Nest.js 等后端: src/modules/<模块名>/  →  模块名 = 目录名
   - 前端: src/views/<模块名>/ 或 src/pages/<模块名>/  →  模块名 = 目录名
   - 通用: src/modules/<模块名>/  →  模块名 = 目录名

2. 功能目录约定：
   - src/<模块名>/ 下包含 controller / service / model / api 等子目录
   → 识别为一个业务模块

3. 顶层目录兜底：
   - src/ 下的一级目录（排除 utils / helpers / assets 等通用目录）
   → 每个目录视为一个模块
```

**LLM 校准（可选开启）**：对自动推断的结果进行校准，补充模块职责描述、合并拆分不合理的模块、校正前后端属性。全项目仅调用 1 次 LLM，Token 消耗极低（~¥0.002）。

**通用目录排除**：`utils`、`helpers`、`common`、`shared`、`lib`、`assets`、`styles`、`types`、`constants` 等通用目录默认不作为业务模块（可通过 `graph.build.commonDirs` 配置调整）。

### 4. 前端/后端模块区分规则

模块的"所属端"属性通过以下规则判断：

```
1. 配置明确指定 → 使用配置值（最高优先级）

2. 项目类型单一（纯前端/纯后端）→ 所有模块同属一端
   - frontend-* 类型 → 全部前端
   - backend-* 类型 → 全部后端

3. 全栈项目（fullstack）→ 按目录/文件特征判断：
   - 目录名含 pages / components / views / store / router → 前端
   - 目录名含 server / api / controller / service / model / dao → 后端
   - .tsx / .jsx / .vue 文件占比高 → 前端
   - 含 controller / service / entity 等后端命名 → 后端
   - 无法判断 → 标记为 shared
```

### 5. 需求状态与图谱的联动

需求节点的状态属性从 `.wpw.yaml` 读取，并与图谱同步：

| 需求状态 | 图谱节点属性 | 语义检索默认行为 |
|---------|-------------|-----------------|
| active 目录下 | `archived: false` | 参与检索 |
| archived 目录下 | `archived: true` | 默认过滤（可配置开启） |
| 各 artifact 状态（brd/prd/...） | `status.<artifactId>` | 不影响检索，仅作展示 |

**增量更新检测**：
- 需求目录移动（active ↔ archived）→ 通过文件路径变化检测
- `.wpw.yaml` 内容变化（状态、配置变更）→ 通过文件哈希变化检测
- 变化后触发该需求节点及关联边的重建

### 6. `workflow.config.yaml` graph 配置段完整定义

```yaml
graph:
  # 构建配置
  build:
    # 忽略目录（glob 模式）
    ignore:
      - node_modules
      - dist
      - build
      - .git
    # 支持的语言
    languages:
      - typescript
      - javascript
    # 模块根目录（从哪些目录开始推断模块）
    moduleRoots:
      - src/modules
      - src/pages
    # 通用目录（不视为业务模块）
    commonDirs:
      - utils
      - helpers
      - common
      - shared
      - lib

  # 检索配置
  search:
    # 默认召回数量
    defaultLimit: 10
    # 相似度阈值（0-1）
    threshold: 0.6
    # 是否排除归档需求
    excludeArchived: true

  # 子图裁剪配置
  trimming:
    # 默认最大深度
    defaultDepth: 3
    # 默认最小边权重
    minWeight: 0.7
    # 默认节点上限
    maxNodes: 100
    # 语义分权重（0-1）
    semanticWeight: 0.6
    # 结构重要度权重（0-1）
    structuralWeight: 0.4

  # 映射策略配置
  mapping:
    # 映射模式：
    #   local     - 纯本地，零付费 Token（规则+Embedding+Git+命名）
    #   ai-refine - AI 校准（在 local 基础上用 LLM 精排，极少量 Token）
    mode: local
    # AI 校准使用的模型（mode=ai-refine 时有效）
    aiModel: null      # 如 gpt-4o-mini，不填用默认小模型
    aiApiKey: null
    aiApiBase: null
    # 语义匹配最小相似度阈值（低于此值不建边）
    semanticThreshold: 0.5
    # 是否启用 Git 历史追溯
    gitHistory: true
    # Git 追溯最大回溯 commit 数
    gitMaxCommits: 1000

  # 压缩配置
  compression:
    # 压缩等级：loose / standard / extreme
    level: standard

  # Embedding 配置（纯本地，无远程 API 选项）
  embedding:
    # 本地模型名称
    model: Xenova/all-MiniLM-L6-v2
    # 向量维度（自动根据模型检测，可手动覆盖）
    dimensions: 384

  # 手动模块定义（可选，覆盖自动推断）
  # 不配置则完全自动推断
  modules: []
```

## Risks / Trade-offs

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 本地 Embedding 推理速度慢，构建耗时超标 | 构建性能不达标 | 量化模型加速；批量推理；仅对有文本的节点生成向量 |
| Tree-sitter WASM 语言包分发与加载复杂度 | 安装与初始化问题 | 验证 web-tree-sitter 实际安装体验；备选方案为语法解析降级为正则提取 |
| 需求→代码语义匹配误配率高，子图质量差 | 检索与裁剪效果不佳 | 语义匹配边低权重；手动配置兜底；提供匹配结果可解释性 |
| 全量重写在大图场景下性能下降 | 超大规模项目更新慢 | 首版接受；后续升级为 SQLite 或 WAL 模式 |
| JSONL 文件体积随节点增长较快 | 加载时间增加 | 万级节点仍在可接受范围；后续升级二进制格式 |
| 语法解析覆盖度不足（装饰器、泛型、JSX 等） | 元素节点缺失 | 优先支持核心语法；提供解析覆盖率统计；渐进增强 |
| 冷启动 Embedding 模型下载体积大（~80MB） | 首次构建等待 | 文档明确说明；模型文件缓存至用户目录，多项目共享 |
| 子图裁剪算法权重（0.6/0.4）缺乏验证 | 裁剪效果不可控 | 提供配置项可调；默认值作为起点，根据实际效果迭代 |

## Migration Plan

知识图谱为纯新增功能，无数据迁移需求：

1. **部署方式**：随 WPW 版本升级自然获得，用户执行 `wpw graph build` 即可生成图谱
2. **回滚方案**：删除 `.wpf/` 目录即清除所有图谱产物，不影响项目源文件
3. **兼容性**：`.wpf/` 加入 `.gitignore`，不影响现有 Git 工作流
4. **版本迭代**：`meta.json` 中记录 schema 版本，未来结构变更时可自动迁移
5. **存储升级路径**：GraphStore 接口抽象，JSONL → 二进制 → SQLite 可平滑升级

## Open Questions

1. **Embedding 模型最终选型**：`all-MiniLM-L6-v2` 英文效果好但中文一般，是否默认使用中文优化模型？需评估模型体积与效果权衡。
2. **支持语言范围**：首版仅支持 TypeScript/JavaScript，后续何时扩展 Python/Go 等其他语言？
3. **向量相似度性能**：纯 JS 余弦相似度在万级向量下是否满足 200ms 端到端指标？若不足，是否需要 WASM 加速？
4. **语义匹配阈值**：business_map 语义匹配的默认阈值设多少合适？需根据实际效果调整。
5. **子图裁剪权重**：语义分 vs 结构重要度的 0.6/0.4 比例是否合理？需实际验证。
