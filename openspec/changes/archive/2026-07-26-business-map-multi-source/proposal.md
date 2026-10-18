# 补全业务-代码映射的多源证据融合

## Why

知识图谱的 `business_map` 边（业务需求 ↔ 模块/文件/元素）本应是本课题方法论上最扎实的创新点之一——采用 **noisy-OR 多源证据融合 + EdgeSource 溯源**。但代码核查发现，设计宣称的"五层混合映射"实际只接通了 **2 层**，且存在配套隐患，使该创新点处于"方法完整、落地残缺"的状态：

1. **语义匹配（Layer 2）未接入**：向量在 `buildVectors` 阶段已构建，但无任何代码将其回填为 `business_map` 证据边。`graph-builder.ts:348` 注释留有欠条"语义匹配和 Git 追溯在向量构建后单独处理"，但该"单独处理"从未兑现。
2. **Git 历史追溯（Layer 3）未接入**：`mapping-sources.ts:28` 的 `traceFromGit` 与 `:199` 的 `isGitRepo` 已完整实现（扫 commit message 关键词、统计文件频次），但全项目**零调用**；`config.ts:99` 的 `gitHistory: true` 默认开关**无任何代码读取**。
3. **命名匹配（Layer 4）用了阉割版**：`graph-builder.ts:370` 内联了 6 词条小词典，而 `mapping-sources.ts:78` 已写好的 30+ 词条 `CN_EN_MAP` + 完整 `matchByName`（支持前缀匹配）**从未被引用**——零件造好没装车。
4. **AI 校准（Layer 5）为配置桩**：`types.ts:197` 声明 `mode: 'local' | 'ai-refine'`，无任何分支逻辑。

**根因**：归档 change 的 `tasks.md:4.3` 把"五层混合 business_map 生成"作为单个 task 标记 `[x]` 完成，但语义/Git 两源**从未被拆成独立可追踪 task**；且 `graph-build` 能力 spec 中**根本没有 business_map 映射的正式 Requirement**——缺乏 spec 约束是两源漏接的系统性原因。

**附带隐患**：
- `aggregateWeights`（`edge-builder.ts:151`）内部计算了 `bestSource`，但 line 192 `return weights` **丢弃了 bestSource**；`buildBusinessMapEdges:342` 改用 `evidences.find()` 取数组第一个匹配。当前 2 源下碰巧返回排名更高的 doc-extract，**补多源后 push 顺序一变溯源标签即错**——隐藏 bug。
- `boostEdge`（`edge-builder.ts:60`）为多源后增强权重设计，当前**零调用**，是死代码。

**后果**：noisy-OR 聚合（`1 − ∏(1 − wᵢ)`）只喂入 2 个证据，"多源复合增强"的威力未体现，创新点六在论文中只能作为"⚠️ 部分实现"呈现，且无法支撑 2 源 vs 5 源的消融实验。

本 change 补全前 4 项可落地的源（语义 + Git + 命名匹配升级 + bestSource 修复），使 noisy-OR 五源聚合名副其实，并补齐缺失的正式 spec。AI 校准（Layer 5）需接 LLM 调用，归入未来工作。

## What Changes

- **接入语义匹配建边**：`buildGraph` 流程在向量构建阶段后新增"语义映射回填"步骤，对每个 L1 需求节点检索 L2/L3 相关节点，生成 `source: 'semantic'` 证据参与 noisy-OR 聚合。
- **接入 Git 历追溯建边**：`buildBusinessMapEdges` 中按需求关键词调用既有 `traceFromGit`，将高频修改文件归一化为 `source: 'git-history'` 证据。
- **升级命名匹配**：`buildBusinessMapEdges` 改用 `mapping-sources.ts` 的完整 `matchByName`（30+ 词条 + 前缀匹配），删除内联 6 词条 `matchRequirementToModules`。
- **修复溯源逻辑**：`aggregateWeights` 返回值携带 `bestSource`；`buildBusinessMapEdges` 改用返回的 bestSource 而非 `evidences.find()`，消除隐藏 bug，使"每条边溯源到最权威证据源"名副其实。
- **激活/裁剪 boostEdge**：明确 `boostEdge` 与 `aggregateWeights` 的职责边界（见 design.md），消除死代码歧义。
- **补正式 spec**：向 `graph-build` 能力新增"业务-代码多源证据映射"Requirement（含 5 源、noisy-OR 聚合、EdgeSource 溯源场景），填补此前无 spec 约束的缺口。
- **收敛 Claim**：更新 `edge-builder.ts` 文件头注释与 README，明确 5 源中已实现 4 源、AI 校准为未来工作。
- **新增映射质量评估**：提供 ground-truth 标注脚手架与 2 源/4 源消融开关，为论文创新点六的实验验证提供素材。

## Capabilities

### Modified Capabilities

- `graph-build`：新增"业务-代码多源证据映射"Requirement，规范 5 源证据融合、noisy-OR 聚合与 EdgeSource 溯源行为；修正 `aggregateWeights` 溯源返回契约。

## Impact

- **修改文件**：
  - `src/graph/builders/graph-builder.ts`（`buildBusinessMapEdges` 接入语义/Git/升级命名匹配 + bestSource 消费；新增语义回填步骤的编排）
  - `src/graph/builders/edge-builder.ts`（`aggregateWeights` 返回 bestSource；明确 `boostEdge` 定位）
  - `src/graph/parsers/mapping-sources.ts`（`matchByName` 适配模块匹配场景，可能新增 name->id 转换辅助）
  - `src/graph/config.ts`（新增 `mapping.semanticThreshold`、`mapping.semanticTopK`、`mapping.gitMinFreq` 配置项，默认值）
  - `src/graph/types.ts`（`GraphMappingConfig` 扩展字段）
- **新增文件**：
  - `src/graph/builders/business-mapper.ts`（抽出 `buildBusinessMapEdges` 为独立模块，含 5 源证据收集 + 聚合，便于单测与消融）
  - `src/graph/__mapping_eval__.ts`（映射质量评估脚手架：ground-truth 加载 + precision/recall/F1 + 源消融）
- **存储/性能**：
  - 语义回填复用已构建的向量索引，无额外模型加载；每个 L1 节点一次线性相似度扫描，O(N_req × N_node × D)，与 `semantic-search` 同阶。
  - Git 追溯每个需求一次 `git log` 子进程调用（`traceFromGit` 已有 1000 commit 上限与 10MB 缓冲），需在 `buildGraph` 计入耗时统计。
- **配置兼容**：新增配置项均有默认值，`gitHistory` 默认 `true`、`semanticThreshold` 默认复用 `search.threshold`，向后兼容。
- **非破坏性**：不改变 `business_map` 边的字段结构，仅扩展证据来源与修正溯源；既有图谱重建后边集可能增多、权重可能变化（多源复合增强），属预期改进。
- **AI 使用边界**：本 change 全程纯本地（向量已建、Git 本地命令），**不引入 LLM 调用**，零付费 Token；AI 校准仍是未来工作。
- **论文影响**：创新点六由"⚠️ 部分实现"转为"✅ 4 源已验证 + AI 校准为未来工作"，并具备消融实验素材。
