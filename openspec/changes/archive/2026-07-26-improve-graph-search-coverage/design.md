# Design: 改进图谱检索质量与阶段接入覆盖

## 1. 设计目标

两部分互补：
- **Part 1 检索修复**：让 `wpw graph search`/`context` 的排序正确--精确名称匹配与跨语言（中文查询↔英文标识符）匹配不再被纯 embedding 噪声压下去。
- **Part 2 阶段接入**：让所有读代码的 `/wpw` 阶段把图谱当作**必做前置**（非"推荐"），且各阶段跑对查询。

约束：纯本地、零新依赖、CLI 接口与 JSON 结构不变、向后兼容（纯语义场景分数不变）。

## 2. Part 1：混合词汇+语义检索

### 2.1 现状根因

```
semantic-search.ts: search()
  ├─ query 向量化
  ├─ 对所有节点 cosine 相似度           ← 唯一排序信号
  ├─ threshold 过滤
  ├─ level/type/archived 过滤
  └─ Top-N                              ← 无任何词汇匹配 fallback
```

纯 cosine 对"注册(中文)↔RegisterView(英文标识符)"跨语言匹配不可靠（即便 bge-small-zh 中文模型，英文标识符 embedding 仍弱），导致：
- RegisterView cosine 0.555 < 通用函数 0.724 → 排序倒置
- 多个通用英文函数 embedding 聚簇 → 成组相等 0.724
- 三个 onSubmit embedding 几乎相同 → 不可区分

### 2.2 核心决策：加法式词汇 boost（非混合权重）

**决策**：`finalScore = min(1.0, cosineSim + lexBoost)`，`lexBoost` 分级加分。

**理由**：
- 加法式对纯语义结果零干扰（lexBoost=0 时分数不变），向后兼容；
- 混合权重式（`sim*w1 + lex*w2`）会缩放纯语义分数，破坏既有阈值语义；
- 加法式对"精确匹配应置顶"更直接--强匹配 +0.35 足以把低 cosine 的精确匹配顶上去。

### 2.3 lexBoost 分级

| 命中类型 | 加分 | 判定 |
|---------|------|------|
| 精确/互含名称匹配 | +0.35 | `queryLower === nameLower` 或互含 |
| 英文等价词为名前缀 | +0.25 | `nameLower.startsWith(enEq)` |
| 英文等价词包含于名 | +0.15 | `nameLower.includes(enEq)` |
| 英文等价词命中 parentName/filePath | +0.10 | parent/file 包含 enEq |
| 无命中 | 0 | - |

**取最大值**（不累加）：一个节点只取最高级别命中对应的加分，避免重复加分。

**为何 +0.35 足够**：RegisterView cosine 0.555 + 0.35 = 0.905 > 通用函数 0.724；即便 cosine 低至 0.4，+0.35=0.75 仍超 0.724。精确匹配可靠置顶。

### 2.4 跨语言桥接：复用 CN_EN_MAP

**决策**：查询词经 `CN_EN_MAP`（注册->register）展开为英文等价词集合，再与英文节点名匹配。

**理由**：
- 代码标识符是英文，中文查询需桥接；CN_EN_MAP 已存在（30+ 词条，mapping-sources.ts），复用避免双词典；
- 模型层解决不了跨语言标识符匹配（中文模型弱英文标识符，英文模型弱中文查询），词汇层桥接是更高杠杆。

**新增导出**：`mapping-sources.ts` 导出 `expandQueryToEnglish(query: string): string[]`：
- 原词入集合；
- 拆中文词（CN_EN_MAP key 命中部分）入集合 + 其英文等价词；
- 英文 token 原样入集合；
- 返回去重集合（上限 20）。

`extractKeywords` 已有类似逻辑，重构为复用。

### 2.5 插入点

```
search() 改造：
  ├─ query 向量化、cosine 计算（不变）
  ├─ threshold 过滤（改用 finalScore 判阈值）
  ├─ 新增：lexBoost 计算（expandQueryToEnglish + 分级匹配）
  ├─ finalScore = min(1.0, sim + lexBoost)
  ├─ level/type/archived 过滤（不变）
  └─ 按 finalScore 降序 Top-N
```

**阈值语义**：原 `threshold` 过滤 cosine；改用 finalScore 过滤。这意味着精确匹配即便 cosine 低也能过阈值（符合预期--名字都对上了不该被滤）。向后兼容：纯语义场景 finalScore=cosine，阈值行为不变。

### 2.6 富化 embedding 文本（缓解"成组相等"）

**决策**：`getNodeVectorText` 对 component/function 节点追加 `filePath`。

**理由**：三个 onSubmit 若仅 embed `onSubmit + signature + jsDoc + parentName`，parentName 不同但若 jsDoc 缺失则文本相近、embedding 聚簇。追加 filePath（`views/RegisterView.vue`）注入差异化文本，提升区分度。

**边界**：仅 component/function 追加 filePath；file 节点已是 `filePath + name`；requirement/module 不变。需 `wpw graph rebuild` 生效。

### 2.7 不做的事

- **不换模型**：代价大（重下载+重建），且治标不治本（任何纯 embedding 都难解跨语言标识符）。boost 后仍不理想再考虑代码专用模型。
- **不做 BM25/全文检索**：词汇加分已足够，引入 BM25 增加复杂度与存储。
- **不改 CLI 接口/JSON 结构**：仅 score 语义变好。

## 3. Part 2：阶段图谱接入标准化

### 3.1 现状审计

| 阶段 | 读代码? | 当前图谱接入 | 问题 |
|------|---------|-------------|------|
| explore | 是 | 有（5 处），标"（推荐）" | 软，AI 常跳过 |
| design | 是 | 有（3 处） | 软 |
| plan | 是 | 有（3 处） | 软 |
| test | 是 | 有（4 处） | 软 |
| apply | 是 | 有（4 处），每任务 context | 较实，但未强制 |
| cr | 是 | 有（4 处），upstream 影响面 | 较实 |
| sync | 是 | 有（3 处），upstream business_map | 较实 |
| brd | 否（面向业务） | 浅（2 处） | 合理，不改 |
| prd | 否（面向产品） | 无 | 合理，不改 |
| exp | 否（经验沉淀） | 无 | 合理 |
| init | - | 有 build | 已有 |
| archive | - | 有 update | 已有 |

### 3.2 核心决策：统一"图谱前置"为必做步骤

**决策**：在 explore/design/plan/test/apply/cr/sync 七个读代码阶段，将"图谱前置"从"（推荐）"改为**必做步骤**，统一格式：

```
### 图谱前置（必做）
wpw graph update                    # 增量更新，保证代码上下文最新
wpw graph context "<阶段关键词>" [阶段专属参数] --json
# 降级：图谱缺失 -> 提示 build 并回退手动读文件（不硬阻断）
```

**理由**：当前"（推荐）+ 可回退 grep"让 AI 实践中常跳过图谱。改为"必做"但仍保留降级（图谱缺失不阻断），既推动采用又不破坏可用性。

### 3.3 各阶段专属图谱查询（对齐 SKILL.md 集成表）

| 阶段 | 必做查询 | 收益 |
|------|---------|------|
| explore | `context "<需求>" --depth 2` + `query --downstream <模块> --depth 3` | 了解现有架构与依赖 |
| design | `context "<需求>" --level L2,L3,L4` | 模块边界，设计不脱节 |
| plan | `context "<需求>" --level L2,L3` | 任务切分更合理 |
| test | `query --upstream/--downstream <变更节点>` | 回归范围不遗漏不扩大 |
| apply | 每任务前 `context "<任务>"` | Token 降，上下文准 |
| cr | `query --upstream <变更节点>` | 影响面分析更全 |
| sync | `query --upstream` 沿 business_map | 关联文档不漏同步 |

### 3.4 SKILL.md 对齐

SKILL.md 既有"各阶段集成点"表，措辞由"集成方式/收益"补一句"必做前置，降级不阻断"，与命令文档一致。

## 4. 风险与权衡

| 风险 | 影响 | 缓解 |
|------|------|------|
| lexBoost 权重拍脑袋 | 排序质量 | 分级有依据（精确>前缀>包含>父名），+0.35 经验证足以置顶；可配置化留接口 |
| threshold 改用 finalScore | 行为微变 | 纯语义场景不变；精确匹配过阈值是预期改进 |
| filePath 入 embedding 需 rebuild | 旧图谱不生效 | 文档注明需 `wpw graph rebuild`；lexBoost 不依赖 rebuild 即时生效 |
| "必做"图谱前置在无图谱项目阻断流程 | 可用性 | 保留降级：图谱缺失提示 build 并回退手动读文件，不硬阻断 |
| CN_EN_MAP 词典覆盖有限 | 跨语言召回 | 词典可扩展；未覆盖词退化为纯语义（不恶化） |

## 5. 验证

- **Part 1 单测**：构造 RegisterView + 通用函数，搜"注册"/"RegisterView"，断言 RegisterView 进 Top 3；三 onSubmit 搜"注册"断言 RegisterView.onSubmit 得分最高；纯英文查询无等价词时 lexBoost=0。
- **Part 1 实测**：在真实 Vue 项目 `wpw graph rebuild` 后搜"注册"，RegisterView 排名显著上升（用户原始场景复测）。
- **Part 2**：审阅 7 个阶段命令文档，确认"图谱前置（必做）"步骤存在且查询正确；SKILL.md 表对齐。
