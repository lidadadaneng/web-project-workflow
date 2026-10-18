# 改进图谱检索质量与阶段接入覆盖

## Why

知识图谱已建成并接入部分 `/wpw` 阶段，但实测暴露两个相互拖累的问题：

1. **语义检索排序倒置**：搜"注册"或"RegisterView"，最相关的 `RegisterView` 组件排第 20（相似度 0.555），而 `readUsers`/`findAll`/`onLogout` 等几乎无关的函数反以 0.724 居首；搜组件全名 `RegisterView` 也找不到该组件。根因是 `semantic-search.ts` 为**纯 cosine 相似度，无任何词汇匹配 fallback**--纯 embedding 对"中文查询 ↔ 英文代码标识符"的跨语言匹配不可靠（即便用中文模型 bge-small-zh-v1.5，英文标识符 embedding 仍弱），导致精确名称匹配被语义噪声压下去。同时还出现"多个函数相似度成组相等(0.724)"、三个 `onSubmit` 不可区分等症状，皆源于无词汇信号区分。

2. **阶段接入不一致且偏软**：`/wpw:explore` 等读代码的阶段虽有图谱步骤，但标注为"（推荐）"且可回退手动 grep，AI 实践中常跳过；加之检索质量差，图谱形同未用。`exp`/`prd`/`skills` 完全未接入，`brd`/`init`/`archive` 仅浅提及。

两部分互补：检索修复让图谱"可用"，阶段接入让图谱"被用"。现在做是因为刚完成的 `business-map-multi-source` 让图谱有了真实业务-代码关联，正是各阶段该用图谱的时候，但检索质量卡住了收益。

## What Changes

- **语义检索混合词汇加权**：`semantic-search.ts` 在 cosine 之上叠加跨语言词汇加分 `finalScore = cosineSim + lexBoost`（上限 1.0），`lexBoost` 由"查询词 -> 英文等价词（经 `CN_EN_MAP` 桥接，如 注册->register）-> 命中节点名/父名/路径"决定，分级加分（精确名匹配 +0.35 / 前缀 +0.25 / 包含 +0.15 / 父名或路径 +0.10）。纯语义结果不受影响（无词汇命中则 lexBoost=0）。
- **导出 `CN_EN_MAP` 辅助**：`mapping-sources.ts` 新增 `expandQueryToEnglish(query)` 导出函数，供语义检索与命名匹配复用。
- **富化组件/函数 embedding 文本**：`getNodeVectorText` 对 component/function 节点追加 `filePath`，提升同名义函数的区分度（缓解"成组相等"）。
- **标准化阶段图谱前置**：将 `wpw graph update` + `wpw graph context` 作为**必做前置步骤**（非"推荐"）写入所有读代码的阶段命令文档：`explore`/`design`/`plan`/`test`/`apply`/`cr`/`sync`，并明确各阶段该跑的图谱查询（对齐 SKILL.md 既有集成表）。
- **修正文档**：`map.md:189` 将过时的 `all-MiniLM-L6-v2` 更正为实际默认 `bge-small-zh-v1.5`。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `semantic-search`：检索排序由"纯 cosine"改为"cosine + 跨语言词汇加权"混合检索，新增词汇命中加分与跨语言查询展开行为。

## Impact

- **修改文件**：
  - `src/graph/search/semantic-search.ts`（叠加 lexBoost、跨语言展开、finalScore 排序）
  - `src/graph/parsers/mapping-sources.ts`（导出 `expandQueryToEnglish`，复用既有 `CN_EN_MAP`）
  - `src/graph/builders/vector-builder.ts`（`getNodeVectorText` 组件/函数追加 filePath）
  - `ai-layer/commands/wpw/{explore,design,plan,test,apply,cr,sync}.md`（图谱前置步骤由"推荐"改为"必做"，明确查询）
  - `ai-layer/skills/wpw-workflow/SKILL.md`（集成表措辞对齐"必做"）
  - `ai-layer/commands/wpw/map.md`（模型名更正）
- **存储/性能**：词汇加分在已加载节点上做字符串匹配，O(N·L) 无额外模型开销；embedding 文本加 filePath 后需 `wpw graph rebuild` 重建向量索引才能生效。
- **向后兼容**：`finalScore` 仍为 [0,1] 区间，阈值过滤与 `--threshold` 语义不变；纯语义场景（无词汇命中）分数不变。
- **AI 使用边界**：纯本地，零 LLM 调用，零新增依赖。
- **非破坏性**：不改变 `wpw graph search`/`context` 的 CLI 接口与 JSON 输出结构，仅排序质量提升。
