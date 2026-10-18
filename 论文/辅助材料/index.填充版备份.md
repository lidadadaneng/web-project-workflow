# 面向 Web 项目的 AI 辅助开发工作流构建及知识图谱驱动上下文优化方法研究

> **本文件为论文写作素材库存档**。第 1、2、3、5 章已成稿（以正文文件 `1.绪论.md`、`2.相关技术.md`、`3.知识库与知识图谱构建.md`、`5.对比实验与评估.md` 为准，本文件对应章节仅保留状态与参数摘要）；第 4、6 章尚未成稿，本文件保留其详细写作素材；文末参考文献与附录为全文共享信息。
>
> 全文主线：面向 AI 编程智能体的**上下文工程方法**（流程约束 - 知识供给 - 预算控制三环节），wpw 为实现载体；验证环节为受控工程实验（四方案对比 + 三组消融 + 组件级基线）。

---

## ABSTRACT

- 研究背景：大语言模型驱动 AI 辅助开发已拓展至多个软件工程活动，但在工程化使用中面临流程覆盖、过程可控性与上下文效率等方面的挑战。
- 研究内容（三个创新点）：① 面向 AI 编程智能体的流程约束架构（三层分离架构、三段式编排契约与阶段制品/CLI 状态管理，解决过程可控性）；② 面向智能体上下文生成的能力-代码双层知识组织方法（C+L1/L2/L3 模型与业务-代码多源证据映射，解决业务知识与代码结构脱节）；③ 图谱驱动的任务上下文压缩方法（置信度衰减锚点选择、加权双向 BFS 子图裁剪与 Token 预算迭代控制，解决上下文效率）。
- 系统实现：CLI 层（TypeScript）+ AI 层（Claude Code Skill，14 个 /wpw 命令）+ 文件系统层；多语言源码解析（TS/JS/Vue/Java）、本地 Embedding、零数据库存储。
- 实验验证：以美食推荐业务为载体的典型 Web 系统（vue+springboot），受控对比 4 种 AI 辅助开发方式，并以三组消融实验（知识组织/上下文生成/流程约束）与组件级基线分离各机制贡献。
- 结论：以实测数据回填论证方法在给定资源约束下对上下文有效性、开发质量与过程可控性的影响及适用边界（实验前为预期，以实测为准）。
- 关键词（英）：AI-Assisted Software Development；Agent Workflow；Code Knowledge Graph；Context Compression；Spec-Driven Development；Large Language Model

---

## 1 引言（已成稿 -> `1.绪论.md`，以下为状态摘要）

- 成稿结构（2026-08-16 按学校模板目录重组 + 小节划分规范统一，章名"绪论"->"引言"）：1.1 研究背景（1.1.1 大模型驱动的软件开发模式变化[1]-[3][28]；1.1.2 AI 编程智能体的长期项目知识问题（项目知识失忆三类：规模增长[4] / 业务-代码割裂[18] / 演化缺记忆[3][10]）；1.1.3 软件项目知识图谱与上下文构建需求[5][6][37] + 研究对象限定段；1.1.4 美食推荐系统实验载体需求）；1.2 研究意义（1.2.1 理论 / 1.2.2 实践）；1.3 国内外研究现状（1.3.1 国外五方向：大模型代码生成[30] / AI 软件工程 Agent[16][17][32][33][2][10]（[3][6] 移国内）/ Spec-Workflow 驱动开发[7][8][9] + 表1-1 / 上下文工程[5][4][19][35][36][12]（RepoHyper 跨国合作留国外）/ 软件知识图谱与 Repository 智能[18][13]-[15][39][40]；1.3.2 国内：政策[20] + 大模型生态[21]-[27] + 代码模型与编程工具[31][29] + 智能体实证与综述（SE 3.0[3]/自演化综述[6]）+ 代码表示与仓库级理解（GraphCodeBERT[11]/CatCoder（浙大）[34]）+ 需求追踪（TRIAD[41]）+ KGCompass（燕山大学牵头）[38] + 工行程序血缘[42]；1.3.3 现有研究不足归纳）；1.4 研究目标与研究方法（1.4.1 研究目标：总体 + 三具体目标（问题式，无 RQ 编号）；1.4.2 研究方法：三层技术路线各对应一目标 + 流程约束整合与 wpw 载体 + 受控实验验证（T1-T4 + 四范式 + 三消融 + 五维度））；1.5 创新点（1.5.1-1.5.4 分节详述：双层知识模型（居首）/ 任务上下文生成 / Spec 增量演化 / wpw 实现与验证；不设章节安排节）。
- 引用共 42 篇（编号 [1]-[42]，清单以 `1.绪论.md` 文末映射为准（文末参考文献"第 1 章引用编号对照"为旧版 [1]-[18] 对照）；2026-08-16 终版核实 [1]-[42] 全部有效（APSEC CoT 条目撤下、工行前移为 [42]）；仅 [34] TOSEM 卷期待补。
- 写作约定（全文沿用）：工具版本绑定研究采用版本（附录实验环境表，含 commit）；不用绝对化断言；不用产品评价词（完整/最强/替代）；预期结论一律标注"以实测为准"。

---

## 2 相关技术与理论基础（已成稿 -> `2.相关技术.md`，2026-08-16 初稿；以下为旧素材摘要，新结构以 index.md 为准）

- 新结构（服务第 3 章、避免技术百科，每节"机制 + 在本文中的角色"双落点）：2.1 大语言模型与 AI 编程智能体（Transformer 公式 (2-1)/训练范式/能力边界；ReAct/Toolformer/Harness -> 输入侧瓶颈）；2.2 软件工程上下文工程（**重点节**：窗口约束 Lost in the Middle / RAG 与 GraphRAG / 仓库级获取（CodeSearchNet/CodePlan/RepoHyper）/ 压缩与智能体记忆；综合落点=本文在项目知识组织层面统一四类机制）；2.3 软件知识图谱与代码结构分析（AST/tree-sitter/CPG 缺业务语义；KG 四环节与存储路线；Word2Vec/BERT/BGE 语义匹配）；2.4 Spec 驱动开发（Spec Kit/OpenSpec/Superpowers 机制，流程借鉴 + 第 5 章对比方案 B/C 来源）；2.5 推荐系统与 Web 架构（篇幅受控）；2.6 本章小结。
- 新增文献 [43]-[59]：Transformer、BERT、ReAct、Toolformer、C-Pack(BGE)、GroupLens、Item-based CF、Burke 混合推荐、Pazzani 内容推荐、tree-sitter、Spring Boot、Vue、Mei 上下文工程综述、LLMLingua、Agent Memory 综述、ContextBench（题录待核实）、Agent Workflow Memory（题录待核实）；待终版核实；Word2Vec 按盲审删除。
- 三稿收口（2026-08-16，91-93/A-/A，六项必改）：CE 改工作性定义；RAG"降低知识更新对重新训练的依赖"；2.2.3 加一等知识对象边界句（创新不在"图里放业务节点"而在 Spec/Change->Capability->Code 生命周期机制系统化）；2.2.4 区分 Token 级压缩（LLMLingua）与本文结构感知压缩（子图裁剪->属性级->序列化级）；2.3.4 显式声明"加权双向 BFS"为本文扩展策略非经典带权最短路；补 [58][59]。另：2.1.1 增"参数化知识/外部项目知识/临时上下文"三分；2.1.2 "从与本文相关的角度"留余地；2.3.1 CPG"标准模型并不以业务能力为核心建模对象"；2.3.2 "显式结构化表示，可结合规则或图算法推理"+溯源用于置信度更新与错误定位；2.4 收束句改"核心知识对象仍以……为中心；与本文不同……"。**第二章冻结扩展。**
- 二稿盲审修正（2026-08-16，88-91/A-）：四段式落点（是什么/已解决/边界/为何用）；"执行侧已成熟""构造结果即被丢弃""Token 成本线性增长""代码由规格派生"四处绝对表述改写；KGCompass/RIG 第 2 章直引并承认增量维护；LLMLingua 与 Memory 综述补入；新增 2.2.1 压缩率公式 (2-2) 与 2.3.4 图搜索与子图裁剪（BFS/加权遍历/双向搜索）；2.3.2 压缩并突出 provenance 与增量更新；2.1.1 Transformer 减半、训练范式软化；SDD 三形态（spec-first/anchored/as-source）；OpenSpec 升格为"Change=演化基本工作单元 -> 第 3 章触发单元"；2.5 压至一页内。
- 旧素材（知识图谱三元组/本体四环节、知识表示演进与嵌入模型、大模型与 Transformer 原理、主流模型介绍）已吸收进新结构 2.1/2.3；旧 2.2"知识表示"独立节取消，嵌入向量并入 2.3.3。

---

## 3 上下文工程方法（**2026-08-23 已按六节结构重构成稿 -> `3.上下文工程方法.md`**，以下为旧版关键参数摘要，供第 4 章写作引用；旧文件 `3.知识库与知识图谱构建.md` 已删除）

- **本体**：C（业务能力）+ L1/L2/L3（模块/文件/元素）；边 contain(0.9) / import(0.75) / call(0.6) / business_map（noisy-OR 聚合，≤0.95）；business_map 是映射而非包含（与 CPG 的本质区别）。
- **证据源**：doc-extract 0.85；name-match 0.45-0.6（≤0.7）；semantic ≤0.7（Top-K=5）；git-history ≤0.7（频次≥2）；剪枝阈值 0.3；权威排名 structure(10) > doc-extract(8) > ai-refine(7) > git-history(5) > semantic(4) > name-match(2)。
- **公式**：(3-1) noisy-OR W=1-∏(1-wᵢ)；(3-2) Conf_C=1-∏(1-W_e)；(3-3) w_L1=exp(-α·Conf_C)，α=3.0；(3-4) score=0.6·sem+0.4·struct（含距离衰减）。
- **上下文流水线**：锚点选择 -> 加权双向 BFS（深度 3 / minWeight 0.7 / maxNodes 100）-> 距离感知骨架（full/standard/minimal 三距分级）-> 三档压缩（loose/standard/extreme）-> Token 预算五级降级链 + 三级系统降级；形式化为算法 3-1 伪代码。
- **解析与存储**：web-tree-sitter 多语言（TS/TSX/JS/JSX/Vue/Java-Spring Boot + Pinia/Vuex/Redux/小程序/uni-app），两级策略（快速预检+完整解析）；JSONL + 32 字节头二进制向量 + meta（Schema 3.1.0）；节点 ID = 类型前缀 + SHA-256 前 12 hex（幂等）；增量更新（文件哈希快照，悬挂边已知局限）。
- **图表（重构后新编号，2026-08-23）**：图3-1 方法总体框架 / 图3-2 六阶段流程约束架构 / 图3-3 本体模型 / 图3-4 business_map 生成流程 / 图3-5 上下文生成流水线；算法 3-1；表3-1 边类型 / 3-2 L3 节点属性 / 3-3 证据体系 / 3-4 相关工作对比（新增）/ 3-5 三档压缩参数。
- **验证钩子**（第 5 章兑现）：消融 A（去歧义属性与图谱供给）、消融 B（三档压缩权衡）、组件级基线①②（noisy-OR 与 BFS 选型）、权重参数第 5 章校准。

---

## 4 wpw 系统设计与实现

### 4.1 需求分析

#### 4.1.1 总体需求分析

- 系统定位：面向 Web 项目开发的 AI 驱动六阶段工作流系统，以规格驱动为方法论、Harness 工程为架构原则、Skill 为能力单元、知识图谱为上下文基础设施。
- 总体目标：在充分利用 AI 能力的同时保持流程可控性，覆盖需求-设计-计划-测试-编码全流程，并以高密度结构化上下文提升 AI 代码理解效率。

#### 4.1.2 功能需求分析

- **工作流引擎**：六阶段流转（BRD->PRD->Design->Plan->Test->Apply 六个核心阶段，另有可选的 Explore 探索阶段不计入六阶段，可跳过）、强/弱依赖检查、拍板门禁、状态管理。
- **知识图谱子系统**：graph build/update/rebuild/stat/query/search/context 全套命令。
- **任务追踪**：Plan-as-tracker，Markdown checkbox 任务标记、进度聚合、断点续作。
- **归档与能力沉淀**：需求归档时自动合并到能力规范。
- **AI 层 Skill**：14 个 /wpw:xxx 命令驱动各阶段及辅助操作。

#### 4.1.3 非功能需求分析

- 可控性与可审计性（状态变更必经 CLI）、可追溯性（business_map 边溯源、任务 git 可 diff）、上下文效率（Token 预算约束）、零配置纯本地运行、降级容错（图谱/向量/锚点缺失不阻塞开发）、可扩展性（模型可替换、模板可自定义）。

### 4.2 架构设计

#### 4.2.1 整体架构设计

- **Agent 可靠性设计原则**：① 状态确定性--状态变更必经 CLI、显式留痕，杜绝隐式状态漂移；② 权限边界--AI 不直接修改状态文件（.wpw.yaml），落盘前必须经用户确认大纲；③ 人机协同--关键决策（拍板门禁）由人执行，AI 负责生成与建议；④ 可恢复性--断点续作，图谱/向量/锚点缺失时降级容错不阻塞开发。
- **三层分离架构**：AI 层（Skill + /wpw 命令，理解/生成/交互）-> CLI 层（wpw 命令，状态/依赖/路径/模板）-> 文件系统层（wpw/ + .wpw.yaml + 知识图谱 + specs）。
- **三段式编排契约**：CLI 准备（new/check/template）-> AI 生成+交互（大纲确认+落盘）-> CLI 收尾（done/skip/decision + hook + 进度更新）。
- 关键防线：所有状态变更必经 CLI，AI 不直接修改 .wpw.yaml；落盘前必须输出大纲让用户确认。

#### 4.2.2 模块设计

- **CLI 层模块**：命令解析、状态管理、依赖检查、模板系统、图谱构建与查询、任务追踪。
- **AI 层模块**：wpw-workflow 主 Skill、联动 Skill（brainstorming/code-reviewer/humanizer-zh）、14 个 /wpw 子命令。
- **图谱模块**：多语言解析器、图谱构建器、向量索引、多源证据融合、上下文生成 Pipeline。
- **文件系统层**：工作区目录结构、状态文件、图谱存储、能力规范。

### 4.3 系统实现

#### 4.3.1 开发环境

- 语言：TypeScript（CLI 层）；解析引擎：web-tree-sitter；Embedding：@xenova/transformers + Xenova/bge-small-zh-v1.5（ModelScope 镜像）；AI 层：Claude Code Skill；存储：JSONL + 二进制向量索引（零数据库）。

#### 4.3.2 CLI 层实现

- 命令实现：init/new/list/status/check/template/done/skip/decision/apply/task/archive/graph。
- 状态管理：.wpw.yaml 状态文件、强/弱依赖检查、拍板门禁。
- 模板系统：按 project.type（frontend-h5/backend-node/fullstack/auto）自动选择，优先级 自定义->项目类型默认->文件嗅探。
- Plan-as-tracker：正则匹配 checkbox、状态枚举（ /🔄/x/~）、原地更新、进度反规范化缓存、--from 断点续作。

#### 4.3.3 AI 层实现

- Skill 释放：wpw init 释放主 Skill 及联动 Skill 到 .claude/skills/。
- 14 个 /wpw 命令：brd/prd/explore/design/plan/test/apply 等阶段命令 + 辅助命令（init/map/archive/exp/sync/cr/skills），统一遵循三段式契约。
- 阶段 hook：如调用 humanizer-zh 去机器腔。

#### 4.3.4 系统展示

- CLI 演示：六阶段流转、依赖检查、状态查询。
- 图谱演示：graph stat 统计、graph query 结构化查询、graph search 语义检索、graph context 上下文生成（三档压缩对比）。
- 上下文输出示例：层级符号化序列化结果（⊃/->/⇄，◉ 锚点）。

### 4.4 系统测试

#### 4.4.1 测试环境

- 测试软硬件环境、测试项目、对比工具版本记录（OpenSpec / Superpowers 等以实验采用版本为准，记录版本号与关键配置，应对工具快速迭代）、综合验证脚本（npx ts-node src/graph/__verify__.ts，12 阶段全通过）。

#### 4.4.2 功能测试

- 工作流功能测试（六阶段流转、依赖检查、拍板、归档）。
- 图谱功能测试（多语言解析、四层模型、多源证据融合、增量更新）。
- 上下文功能测试（锚点选择、子图裁剪、骨架分级、序列化、Token 预算迭代）。

#### 4.4.3 性能测试

- 图谱构建性能（不同项目规模下的构建时间）。
- 检索延迟（语义检索、上下文生成耗时）。
- Token 压缩率（loose/standard/extreme 三档对比）。

### 4.5 本章小结

- 总结 wpw 系统的需求、三层分离架构、六阶段工作流与知识图谱子系统的设计与实现，以及功能与性能测试结果。

---

## 5 实验与评估（已成稿 -> `5.对比实验与评估.md`，以下为设计要点摘要）

- **定位**：受控工程实验（非生态统计实验），验证上下文工程方法的机制有效性（非工具优劣、非普适性能）；wpw 为实现载体；不预设方向性结论。
- **RQ 映射（表5-1）**：RQ1 项目知识获取 -> 双层知识组织 -> 消融 A；RQ2 Token 预算下上下文膨胀控制 -> 图谱压缩 -> 消融 B + 组件级基线②；RQ3 执行可靠性 -> 流程约束架构 -> 消融 C；综合 -> 完整方法 -> 主实验。
- **任务载体**：面向 AI 辅助开发评估的典型 Web 业务系统（美食推荐业务为载体）；个性化业务逻辑模块（规则推荐，算法效果非研究变量）；三组任务集 T1 绿地 / T2、T3 存量迭代（重点验证棕地上下文理解）。
- **公平性三支柱**：① 信息约束原则（图谱冷启动成本计入方案 D、无预构建知识库、他方案手动检索成本同样计入）；② 主实验/消融分工（方案 D 多机制属方法设计特点，不以组间差异直接归因单机制）；③ Spec-Kit 参照（混杂变量控制，非能力评价）+ 版本锁定（含 commit）。
- **指标公式**：AI 贡献代码比例（采纳口径）、人工修改率（git diff 行级）、流程完整度、状态可审计率（时间戳+责任主体+输入输出记录）、Recall=|R∩C|/|R|（双人标注 + 文件/函数双粒度 + Cohen's kappa）、Compression=1−Token_ctx/Token_full。
- **消融命名**：A 知识组织机制 / B 上下文生成机制（三档参数见第 3 章表3-4）/ C 流程约束机制 + 组件级基线①②。
- **结果框架**：分析关注差异存在性/来源/假设支持，全部数据回填；社区 bake-off 仅作动机参照。
- **讨论**：5.4.1 方法有效性分析（技术栈适配 + 三机制贡献分解 + 适用边界）；5.4.2 与现有工具比较（设计取舍 + 表5-5 功能关注维度对比，●/◐/○/◉ 中性符号）；5.4.3 局限性（受控实验边界居首）。
- **图表**：表5-1 RQ 映射 / 5-2 对比方案 / 5-3 指标 / 5-4 消融 / 5-5 工具对比 + 数据回填表与权衡曲线（清单见正文文末）。

---

## 6 总结与展望

### 6.1 总结

- 本文围绕"如何让 AI 编程智能体在软件工程中获得项目级知识、受控执行与高效上下文"展开研究（统一归结为智能体上下文工程问题），工作凝练为三个创新点：
  - 创新点 1：面向 AI 编程智能体的流程约束架构（三层分离架构、三段式编排契约、阶段制品与 CLI 状态管理/状态留痕），解决过程可控性问题。
  - 创新点 2：面向智能体上下文生成的能力-代码双层知识组织方法（C+L1/L2/L3 模型、业务-代码多源证据映射与能力规范持续沉淀；定位为知识组织与工程融合，非追踪算法创新），解决业务知识与代码结构脱节问题。
  - 创新点 3：图谱驱动的任务上下文压缩方法（置信度衰减锚点选择、加权双向 BFS 裁剪、距离感知骨架与 Token 预算迭代控制），解决上下文效率问题。
- 实现支撑：多语言源码解析（TS/JS/Vue/Java）、noisy-OR 聚合实现、JSONL/向量零数据库存储、Plan-as-tracker 等作为实现技术支撑上述创新点，不以创新点宣称。
- 实验结论（以第 5 章实测数据回填）：基于受控对比实验与消融实验的数据分析，回答 RQ1-RQ3，得出各机制的贡献量、方法整体表现及适用边界（不预设方向性结论，以实测论证）。

### 6.2 展望

- 后端解析深化：Java 依赖注入边（@Autowired）与 JPA 实体关联边、Kotlin 支持、Go/Python 等语言扩展。
- 引入 AI 校准证据源（ai-refine）与证据源独立性建模（条件 noisy-OR）。
- 冷启动能力沉淀引导与精确 Token 估算。
- 更大规模、更长周期的对照实验与自动化评估。
- 图谱与 IDE/CI 深度集成。

---

## 参考文献

> 分类原则：**现状佐证文献**为 2025-2026 年可查证的实证/综述（已核实，检索截至 2026 年 8 月）；**奠基性方法文献**做源头引用（学术惯例不受年份限制）；**工具官方资料**一律 [EB/OL] 并锁定研究/实验版本。截至检索时点，未见以 Spec Kit / OpenSpec / Superpowers 三者为对象的同行评审系统比较研究，三者事实以官方仓库与文档为准。

**第 1 章引用编号对照**（正文章节文件已用 [1]-[18]，全文合稿时统一重排）：

- [1] Hou X, et al. Large Language Models for Software Engineering: A Systematic Literature Review[J]. ACM TOSEM, 2024, 33(8).（综述性基础）
- [2] Robbes R, et al. Agentic Much? Adoption of Coding Agents on GitHub[EB/OL]. arXiv:2601.18341, 2026.
- [3] Li X, et al. The Rise of AI Teammates in Software Engineering (SE 3.0)[EB/OL]. arXiv:2507.15003, 2025.
- [4] Liu N F, et al. Lost in the Middle[EB/OL]. arXiv:2307.03172, 2023.
- [5] Lewis P, et al. Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks[C]. NeurIPS 2020.
- [6] Zhou X, et al. Self-Evolving Coding Agents: A Survey[EB/OL]. arXiv:2608.03392, 2026.
- [7] Piskala K. Spec-Driven Development: From Code to Contract in the Age of AI Coding Assistants[EB/OL]. arXiv:2602.00180, 2026.
- [8] GitHub. GitHub Spec Kit[EB/OL]. github/spec-kit, 2026.
- [9] OBRA. Superpowers[EB/OL]. obra/superpowers, v6.3.0, 2026.
- [10] Horikawa Y, et al. Agentic Refactoring: An Empirical Study of AI Coding Agents[EB/OL]. arXiv:2511.04824, 2025.
- [11] Guo D, et al. GraphCodeBERT[C]. ICLR 2021.
- [12] Husain H, et al. CodeSearchNet Challenge[EB/OL]. arXiv:1909.09436, 2019.
- [13] Cleland-Huang J, et al. A Heterogeneous Solution for Improving the Return on Investment of Requirements Traceability. IEEE RE 2004.
- [14] Borg M, et al. Recovering from Requirements to Code: An Empirical Study of Traceability Link Recovery. EMSE 2014, 19: 1236-1271.
- [15] Sultanov H, Hayes J H. Application of Genetic Algorithms to the Requirements Traceability Problem. REJ 2010, 15: 173-187.
- [16] Jimenez C E, et al. SWE-bench: Can Language Models Resolve Real-World GitHub Issues? ICLR 2024.
- [17] Yang J, et al. SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering. NeurIPS 2024.
- [18] Yamaguchi F, et al. Modeling and Discovering Vulnerabilities with Code Property Graphs. IEEE S&P 2014.

**后续章节待补方向**（全文参考文献目标 50-80 篇）：LLM4SE 10+、Coding Agent 8+、RAG/Context Engineering 8+（含 Agent Memory、GraphRAG）、Software Traceability 5+（[13]-[15] 已覆盖 3 篇）、知识图谱/代码图谱 10+（含 Joern、Code Property Graph 相关）、SWE-bench 类基准、Word2Vec/TransE/BERT/BGE 与 Transformer/GPT/LLaMA/ChatGLM 源头文献。

**工具官方资料（[EB/OL]，2026-08 版本事实，以本文研究/实验采用版本为准）**：GitHub Spec Kit（仓库 0.14.x / PyPI specify-cli 0.16.4，2026-08-14）；OpenSpec（npm 1.7.0 / 主干 1.9.0 开发线，OPSX）；Superpowers（v6.3.0，2026-08-12）；社区对比案例：OpenSpec Discussion #1159（2026-06 bake-off，非学术证据）；Claude Code Skill；MCP.

**奠基性方法文献（源头引用）**：Pearl J. Probabilistic Reasoning in Intelligent Systems（noisy-OR）. 1988；Vaswani A, et al. Attention Is All You Need. NeurIPS 2017；Word2Vec / TransE / BERT / BGE 系列源头文献；知识图谱基础文献.

## 附录 A 后端主要代码

- CLI 层核心代码：命令解析、状态管理、依赖检查、模板系统。
- 知识图谱构建代码：多语言解析器、四层模型构建、多源证据融合、noisy-OR 聚合。
- 上下文生成 Pipeline 代码：锚点选择、双向 BFS 裁剪、骨架分级、序列化、Token 预算迭代。
- AI 层 Skill 代码：三段式契约、14 个 /wpw 命令、Plan-as-tracker。
- 对比实验代码与数据：美食推荐系统（vue+springboot）四方案实现记录与指标统计脚本。

## 致谢

- 导师、实验室、参与对比实验的开发者与评审、开源社区、家人朋友的致谢。

## 作者简历及在学研究成果

- 个人简历；科研项目；学术论文；知识产权（专利/软著）；奖励与荣誉。

## 独创性说明

- 声明论文为独立研究成果，引用已标注，承担法律结果。

## 关于论文使用授权的说明

- 授权学校保留、送交、编入数据库、复制汇编等使用权限。

## 学位论文数据集

- 关键词（中/英）、中图分类号、学科分类号、论文语种、学科专业、学位级别、研究方向、作者与导师信息、答辩日期、页数、参考文献数、数据集价值说明等。
