## 1. 跨语言词汇加权核心

- [x] 1.1 `mapping-sources.ts` 导出 `expandQueryToEnglish(query: string): string[]`：原词 + 拆中文词（CN_EN_MAP key 命中）+ 英文等价词 + 英文 token，去重上限 20；重构既有 `extractKeywords` 复用同一逻辑
- [x] 1.2 `semantic-search.ts` 新增 `computeLexBoost(query, enEquivalents, node)`：分级匹配（精确/互含 +0.35、前缀 +0.25、包含 +0.15、parentName/filePath +0.10），取最大值，返回 [0,0.35]
- [x] 1.3 `semantic-search.ts` `search()` 改造：cosine 后计算 `finalScore = min(1.0, sim + lexBoost)`，threshold 过滤改用 finalScore，按 finalScore 降序 Top-N，结果分值用 finalScore
- [x] 1.4 单测：构造 `RegisterView` 组件 + `readUsers`/`findAll`/`onLogout` 通用函数，搜"注册"与"RegisterView"，断言 `RegisterView` 进 Top 3 且 finalScore 高于通用函数
- [x] 1.5 单测：三个 `onSubmit`（parentName 分别 LoginView/RegisterView/ResetView），搜"注册"，断言 `RegisterView.onSubmit` finalScore 最高
- [x] 1.6 单测：纯英文查询（如 "calculate"）无 CN_EN_MAP 等价词且不命中节点名时，各节点 lexBoost=0，finalScore=cosine，排序与纯语义一致

## 2. 富化 embedding 文本

- [x] 2.1 `vector-builder.ts` `getNodeVectorText`：component/function 节点文本追加 `filePath`（`${现有文本}\n${filePath}`），提升同名义函数区分度
- [x] 2.2 单测：构造两同名 `onSubmit`（不同 filePath），断言 `getNodeVectorText` 返回不同文本（含各自 filePath）

## 3. 阶段图谱接入标准化

- [x] 3.1 `explore.md`：将"知识图谱上下文准备（推荐）"改为"图谱前置（必做）"，保留降级（图谱缺失提示 build 并回退手动读文件，不阻断）；明确 `wpw graph update` + `context "<需求>" --depth 2` + `query --downstream`
- [x] 3.2 `design.md`：图谱前置改"必做"，查询 `context "<需求>" --level L2,L3,L4`
- [x] 3.3 `plan.md`：图谱前置改"必做"，查询 `context "<需求>" --level L2,L3`
- [x] 3.4 `test.md`：图谱前置改"必做"，查询 `query --upstream/--downstream <变更节点>` 定回归范围
- [x] 3.5 `apply.md`：确认每任务前 `context "<任务>"` 为必做（已较实，补"必做"措辞与降级说明）
- [x] 3.6 `cr.md`：确认 `query --upstream <变更节点>` 影响面分析为必做
- [x] 3.7 `sync.md`：确认 `query --upstream` 沿 business_map 找关联文档为必做
- [x] 3.8 `SKILL.md`："各阶段集成点"表补"必做前置，降级不阻断"措辞，与命令文档一致

## 4. 文档修正与验证

- [x] 4.1 `map.md:189` 模型名 `all-MiniLM-L6-v2` 更正为 `bge-small-zh-v1.5`
- [x] 4.2 `npx tsc --noEmit` 编译通过
- [x] 4.3 全部单测通过（含新增 lexBoost 与 embedding 文本单测）
- [x] 4.4 `__verify__.ts` 12 阶段全通过
- [x] 4.5 真实 Vue 项目复测：`wpw graph rebuild` 后 `wpw graph search "注册"`，`RegisterView` 进 Top 3（用户原始场景回归验证）
