# Design: 业务-代码多源证据映射补全

## 1. 设计目标

把 `business_map` 边的生成从"2 源名义五源"补全为"4 源真实多源 + 1 源未来工作"，使 noisy-OR 证据融合名副其实，并为论文创新点六提供消融实验素材。约束：**纯本地、零 LLM 调用、不破坏既有边字段结构、向后兼容**。

## 2. 现状根因再确认

```
buildBusinessMapEdges (graph-builder.ts:296)
  ├─ Layer 1 doc-extract    ✅ 接入   baseWeight 0.85
  ├─ Layer 4 name-match     ⚠️ 内联 6 词条（非完整 matchByName）
  ├─ Layer 2 semantic       ❌ 向量已建未回填
  ├─ Layer 3 git-history    ❌ traceFromGit 已写零调用
  └─ Layer 5 ai-refine      ❌ 配置桩

aggregateWeights (edge-builder.ts:151)
  └─ 算了 bestSource 但 return 丢弃 → buildBusinessMapEdges:342 用 find() 取首项
     （2 源下碰巧正确，补多源后必错）
```

补全顺序按"风险/收益"排：先修隐藏 bug（溯源），再白捡（命名匹配），再接两源（Git 易、语义需编排）。

## 3. 关键设计决策

### 决策 A：抽出 `business-mapper.ts` 独立模块

**决策**：将 `buildBusinessMapEdges` 从 `graph-builder.ts`（882 行）迁出至新文件 `src/graph/builders/business-mapper.ts`，按源分函数（`collectDocEvidences` / `collectSemanticEvidences` / `collectGitEvidences` / `collectNameEvidences`）。

**理由**：
- 4 源证据收集逻辑各自独立且可单测，留在 882 行的编排文件里难以隔离测试；
- 消融实验（task 7）需要按源开关，独立函数边界天然支持 `--no-semantic` 之类的裁剪；
- `graph-builder.ts` 回归纯编排职责。

**备选**：原地扩展 `buildBusinessMapEdges`。否决--文件已过长，且消融需条件分支会进一步污染编排逻辑。

### 决策 B：语义回填的时机与算法

**决策**：在 `buildGraph` 的向量构建阶段（phase 8）**之后**、图谱持久化**之前**，新增 `business-map` 阶段；语义证据通过**线性余弦扫描**（复用 `SemanticSearcher` 的 `cosineSimilarity`）对每个 L1 需求向量与所有 L2/L3 节点向量计算，取 Top-K。

**理由**：
- 复用已构建向量，零额外模型加载；
- 仅扫 L2/L3（不扫 L4）控制规模：L4 元素数量可能数百至数千，逐需求 × 全 L4 扫描成本高，而业务-代码映射的语义粒度天然落在模块/文件层。

**相似度→权重映射**：`baseWeight = min(0.7, sim × 0.6)`。
- 上限 0.7：语义证据权威性（rank 4）低于 doc-extract（rank 8，baseWeight 0.85），权重不应超过 doc-extract；
- 系数 0.6：`all-MiniLM-L6-v2` 在中文上的相似度分布偏低（0.4~0.6 居多），直接用 sim 作权重会系统性偏低，乘 0.6 后典型命中落在 0.24~0.36，刚过 0.3 剪枝线，合理。

**阈值**：`config.mapping.semanticThreshold` 默认回退 `config.search.threshold`（0.5）。中文模型相似度偏低时用户可下调。

**备选 1**：用 ANN 索引（HNSW）。否决--图谱规模（万节点级）线性扫描足够，引入 ANN 增加依赖与构建复杂度，与"零依赖"原则冲突。
**备选 2**：对 L4 也生成语义证据。否决--规模爆炸，且 L4 的 business_map 价值低于 L2/L3（需求更对应模块/文件而非单个函数）。

### 决策 C：Git 历史的权重归一化

**决策**：`traceFromGit` 返回 `Map<filePath, freq>`，归一化为 `normFreq = freq / maxFreq`，对 `freq >= gitMinFreq`（默认 2）的文件生成 `baseWeight = min(0.7, normFreq × 0.6)`，source='git-history'。

**理由**：
- 频次绝对值无意义（取决于 commit 数），必须归一化；
- `gitMinFreq=2` 过滤单次修改的噪声文件（一次修改可能是顺手改，多次才体现真实关联）；
- 权重上限 0.7 与语义源一致：均为"间接证据"，权威性低于 doc-extract。

**性能**：每个需求一次 `git log` 子进程（`traceFromGit` 已有 1000 commit 上限 + 10MB 缓冲）。N 个需求 = N 次子进程。对 20 需求项目约 20 × ~200ms = 4s，可接受；计入 `business-map` 阶段计时。大项目可后续优化为单次 `git log` 全量扫描后内存分组（列为未来优化）。

**降级**：非 Git 仓库（`isGitRepo` false）或 `gitHistory: false` 跳过，不报错。

### 决策 D：noisy-OR 聚合与权重设计的理论依据

`finalWeight = 1 − ∏(1 − wᵢ)`，上限 0.95。

**依据**：noisy-OR 是概率论中独立证据复合的标准模型--若每个证据源独立地以概率 `wᵢ` 表明关联成立，则"至少一个证据成立"的概率即 `1 − ∏(1 − wᵢ)`。这比"取最大值"或"简单相加"更合理：
- 取最大值：忽略多源相互印证的增强效应；
- 简单相加：易超 1，且无概率语义；
- noisy-OR：单调递增、有上界、有概率语义，且"独立弱信号复合成强信号"符合直觉。

**本 change 的价值**：当前 2 源下，同一目标最多 2 个证据相乘，复合效应有限；补到 4 源后，典型目标可被 doc-extract + semantic + git-history 三源同时命中，权重从单源 0.85 提升到 `1 − (1−0.85)(1−0.42)(1−0.5) ≈ 0.946`（接近上限），noisy-OR 的价值才真正体现。这正是消融实验要展示的。

**权重上限 0.95**：留 0.05 余量给未来 AI 校准（ai-refine rank 7）超越 doc-extract 后仍有提升空间。

### 决策 E：bestSource 溯源修复方案

**决策**：`aggregateWeights` 返回类型由 `Map<targetId, number>` 改为 `Map<targetId, { weight: number; source: EdgeSource }>`。内部已计算的 `bestSource` Map（line 153/189）直接随权重返回。`buildBusinessMapEdges` 删除 `evidences.find()` 旧逻辑，改读返回的 `source`。

**理由**：
- 当前 `find()` 取 evidences 数组首个匹配，2 源下 push 顺序（doc-extract 先于 name-match）碰巧返回高 rank 源；补 semantic/git 后 push 顺序若变即错；
- `aggregateWeights` 内部已按 `sourceRank` 正确选出最权威源，只需把它返回出来，无需调用方重算。

**备选**：调用方自己排序 evidences 取最权威。否决--重复逻辑，且 `aggregateWeights` 已有现成结果。

### 决策 F：boostEdge 的定位

**决策**：保留 `boostEdge`，在文件头注释明确其定位为"增量场景专用"--`updateGraph` 时对已存在的 `business_map` 边追加新证据（增量文件触发的新 semantic/git 证据），用 `boostEdge` 叠加而非重建。当前 `updateGraph` 仍全量重建 business_map（沿用既有简化），故 `boostEdge` 暂未被调用，**但不再是"来历不明的死代码"**，而是增量优化的预留接口。

**理由**：删除 `boostEdge` 会丢失未来增量优化的能力；保留并注明定位即可消除歧义。若后续确认不做增量 business_map 优化，再删不迟。

## 4. 消融实验设计（服务论文）

`__mapping_eval__.ts` 提供以下对比，直接作为创新点六的实验证据：

| 配置 | 启用源 | 验证什么 |
|------|--------|---------|
| 基线 A | doc + name | 当前现状（2 源） |
| 基线 B | doc + name + git | Git 源的边际贡献 |
| 完整 | doc + name + git + semantic | 4 源完整 |
| 消融 C | doc + name + semantic（关 git） | 语义 vs Git 的相对贡献 |

**指标**：precision / recall / F1（对比 ground-truth）+ 边数 + 平均权重 + 多源命中比例（被 ≥2 源命中的边占比）。

**预期**：4 源完整配置的 recall 显著高于 2 源（Git+语义补回 doc/name 漏掉的关联），precision 可能略降（间接证据引入噪声）但 F1 提升；多源命中比例提升印证 noisy-OR 复合增强价值。

**ground-truth**：人工标注 ≥20 条 `需求 → 模块/文件` 关联（WPW 项目自身），JSON 格式 `{ requirement: string, targets: string[] }`。

## 5. 数据流（补全后）

```
buildGraph
  ├─ phase 1-7: 解析需求/模块/源码，建 contain/import 边（不变）
  ├─ phase 8: buildVectors（不变）
  ├─ phase 9: business-map（新增编排）
  │    └─ buildBusinessMapEdges(ctx)  [business-mapper.ts]
  │         ├─ collectDocEvidences      (doc-extract, 0.85)
  │         ├─ collectSemanticEvidences (semantic, sim×0.6≤0.7)  ← 新增
  │         ├─ collectGitEvidences      (git-history, normFreq×0.6≤0.7)  ← 新增
  │         ├─ collectNameEvidences     (name-match, score×0.5≤0.7)  ← 升级
  │         ├─ aggregateWeights(evidences) → Map<id, {weight, source}>  ← 修复
  │         └─ weight≥0.3 → addBusinessMap(id, target, weight, source)
  └─ phase 10: validate + persist（不变）
```

## 6. 风险与权衡

| 风险 | 影响 | 缓解 |
|------|------|------|
| 语义/Git 间接证据引入误关联，precision 降 | 映射质量 | `gitMinFreq=2` + 阈值 + 0.3 剪枝；消融实验量化 |
| Git 子进程拖慢 `buildGraph` | 构建性能 | 计入阶段计时；大项目优化为单次全量扫描（未来） |
| `aggregateWeights` 返回类型变更破坏调用方 | 编译 | 当前唯一调用方是 `buildBusinessMapEdges`，同步改即可 |
| ground-truth 标注主观 | 实验可信度 | 标注 ≥20 条 + 多人交叉核验；论文说明标注协议 |
| 补全后边集变化致既有图谱不一致 | 向后兼容 | 重建即一致；`business_map` 边字段结构未变 |

## 7. 不做的事（范围边界）

- **不实现 AI 校准（Layer 5）**：需接 LLM 调用，归入未来工作；`mode: 'ai-refine'` 分支保留为桩。
- **不实现 call/inherit 边**：与本 change 正交（那是边类型缺失，非映射源缺失），单独立 change 处理。
- **不引入 ANN 索引**：规模未到必要。
- **不改 `business_map` 边字段结构**：仅扩展证据来源与修正溯源。
