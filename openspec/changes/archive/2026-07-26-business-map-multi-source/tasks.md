## 1. 溯源逻辑修复（前置，消除隐藏 bug）

- [x] 1.1 修改 `aggregateWeights`（`edge-builder.ts`）返回类型：由 `Map<targetId, weight>` 改为 `Map<targetId, { weight: number; source: EdgeSource }>`，内部已计算的 `bestSource` 随权重一同返回
- [x] 1.2 `buildBusinessMapEdges` 消费方改为读取返回的 `source`，删除 `evidences.find()` 取首项的旧逻辑
- [x] 1.3 编写单测：构造 semantic + doc-extract + name-match 三源命中同一目标，断言边 `source` 为 doc-extract，且与证据 push 顺序无关（打乱顺序断言结果一致）
- [x] 1.4 明确 `boostEdge` 定位：在文件头注释说明"多源聚合统一走 `aggregateWeights`，`boostEdge` 供增量场景（updateGraph 时对已存在边追加证据）使用"或标记为内部辅助；消除"死代码"歧义

## 2. 命名匹配升级（白捡，零件已就位）

- [x] 2.1 `buildBusinessMapEdges` 删除内联 `matchRequirementToModules`（6 词条），改调用 `mapping-sources.ts` 的 `matchByName`
- [x] 2.2 `matchByName` 当前返回 `Map<targetName, score>`，新增 name→id 适配：在 `buildBusinessMapEdges` 内用既有 `moduleByName`/`fileNodes` 将匹配到的目标名解析为节点 ID
- [x] 2.3 命名匹配证据 baseWeight 取 `matchByName` 返回 score × 0.5（保持原有"命名匹配打折"语义），source='name-match'
- [x] 2.4 单测：构造含"用户认证"需求与 `authService`/`userController` 模块，断言经 `CN_EN_MAP` 命中且权重符合预期

## 3. Git 历史追溯接入

- [x] 3.1 `buildBusinessMapEdges` 在收集证据前判断 `isGitRepo(root)` 与 `config.mapping.gitHistory`，非 Git 仓库或关闭则跳过
- [x] 3.2 对每个需求，以 `[req.node.name, ...req.extractedModules]` 为关键词调用 `traceFromGit(root, keywords)`，得到 `fileCounts: Map<相对路径, 频次>`
- [x] 3.3 频次归一化：`normFreq = freq / maxFreq`；对 `freq >= config.mapping.gitMinFreq`（默认 2）的文件，查 `fileNodes`（需建立 filePath→nodeId 映射，复用 `fileNode.attrs.filePath`）转为节点 ID
- [x] 3.4 生成 `source: 'git-history'` 证据，baseWeight = `min(0.7, normFreq * 0.6)`
- [x] 3.5 单测：mock `traceFromGit` 返回固定频次表，断言生成的 git-history 证据数量与权重正确；mock 非 Git 仓库断言跳过

## 4. 语义匹配回填接入

- [x] 4.1 新增 `src/graph/builders/business-mapper.ts`，将 `buildBusinessMapEdges` 整体迁入并重构为 `buildBusinessMapEdges(ctx)`，ctx 携带 graphData/vectors/mapping/config/root，便于按源分函数收集证据
- [x] 4.2 实现 `collectSemanticEvidences(req, ctx)`：取需求节点向量文本对应向量，对所有 L2/L3 节点向量做余弦相似度线性扫描，取相似度 ≥ `config.mapping.semanticThreshold`（默认复用 `config.search.threshold`）的 Top-K（默认 5）
- [x] 4.3 相似度→权重映射：`baseWeight = min(0.7, sim * 0.6)`，source='semantic'；仅对 L2/L3 生成（控制规模，不对 L4 逐一生成）
- [x] 4.4 在 `buildGraph` 编排中，确认语义回填发生在向量构建（phase 8）之后、图谱持久化之前；向量为空时跳过并提示
- [x] 4.5 单测：mock 向量索引，构造需求向量与某模块向量高相似，断言生成 semantic 证据；向量缺失断言跳过

## 5. 多源聚合与编排整合

- [x] 5.1 `buildBusinessMapEdges` 统一收集四源证据（doc-extract / semantic / git-history / name-match）为一个 `evidences: MappingEvidence[]`，调用 `aggregateWeights` 一次聚合
- [x] 5.2 聚合后权重 ≥ 0.3 的目标生成 `business_map` 边，`source` 取 `aggregateWeights` 返回值
- [x] 5.3 在 `buildGraph` 阶段计时（`mark()`）中新增 `business-map` 阶段，含 Git 子进程与语义扫描耗时
- [x] 5.4 集成测试：在 WPW 项目自身运行 `wpw graph build`，`wpw graph stat` 断言 `business_map` 边数 ≥ 仅 2 源时的边数；抽样核验若干边的 `source` 字段分布含 semantic/git-history

## 6. 配置与类型扩展

- [x] 6.1 `GraphMappingConfig`（`types.ts`）新增：`semanticThreshold?: number`、`semanticTopK?: number`、`gitMinFreq?: number`
- [x] 6.2 `config.ts` 默认值：`semanticThreshold` 默认 `null`（运行时回退 `search.threshold`）、`semanticTopK` 默认 5、`gitMinFreq` 默认 2
- [x] 6.3 `workflow.config.yaml` graph 配置文档补充三项说明（README + map.md）

## 7. 映射质量评估脚手架（论文消融素材）

- [x] 7.1 新增 `src/graph/__mapping_eval__.ts`：加载人工标注的 ground-truth（`业务-代码` 关联对，JSON 格式），与图谱 `business_map` 边比对，输出 precision/recall/F1
- [x] 7.2 实现源消融开关：通过环境变量或参数控制启用哪些源（如 `--no-semantic --no-git`），分别重建并统计指标
- [x] 7.3 输出对比表：2 源（doc+name）/ 3 源（+git）/ 4 源（+semantic）的 P/R/F1 与边数、平均权重
- [x] 7.4 在 WPW 项目自身标注 ≥20 条 ground-truth 关联作为最小验证集

## 8. 文档与 Claim 收敛

- [x] 8.1 更新 `edge-builder.ts` 文件头注释：明确 5 源中已实现 4 源、AI 校准为未来工作
- [x] 8.2 更新 README "知识图谱子系统" 段：五层混合映射描述补"AI 校准为可选未来工作"
- [x] 8.3 更新 `毕业论文核心创新点.md` 创新点六：由"⚠️ 部分实现"改为"✅ 4 源已验证 + AI 校准为未来工作"，移除相关边界警告
- [x] 8.4 `npx tsc --noEmit` 编译通过
- [x] 8.5 `__verify__.ts` 12 阶段全通过；新增映射评估脚手架可运行
