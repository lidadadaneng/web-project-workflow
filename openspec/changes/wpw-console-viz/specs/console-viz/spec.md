# console-viz 能力规格（Delta）

## Purpose

为 wpw 提供本地可视化控制台的前端展示能力：以 Web 页面呈现工作流状态、知识图谱、上下文生成过程、知识库与归档资产，并提供大模型 API 配置与对话交互界面，使系统内部状态可见、可交互、可演示。

## ADDED Requirements

### Requirement: 控制台页面与导航结构

控制台 SHALL 提供 10 个页面：总览、工作流看板、图谱可视化、图谱统计、上下文演示、知识库、归档中心、Token 统计、API 配置、对话。导航 SHALL 采用侧边栏分组（过程 / 知识 / 资产 / 洞察）加顶栏全局入口的布局，其中对话与 API 配置 MUST 在任意页面一键可达。

#### Scenario: 页面可达性

- WHEN 用户打开控制台
- THEN 默认进入总览页，且侧边栏与顶栏可到达全部 10 个页面，无死链

#### Scenario: 对话全局入口

- WHEN 用户处于任意页面
- THEN 顶栏存在对话与 API 配置入口，点击后直接进入对应页面

### Requirement: 工作流看板展示

工作流看板 SHALL 列出全部活跃需求，并以 DAG 形式展示每个需求的六阶段状态（pending / done / skipped 可区分），强依赖与弱依赖 MUST 以不同线型区分。进入单个需求后 SHALL 展示 Plan 任务进度（总数 / 已完成 / 进行中）与 Explore 拍板记录。

#### Scenario: 阶段状态可见

- WHEN 用户查看某需求的 DAG 视图
- THEN 各阶段以颜色或标记区分 pending / done / skipped，可选阶段有明确标识

#### Scenario: 任务进度可见

- WHEN 用户进入某需求详情
- THEN 展示 Plan 任务清单及进度统计，Test 未完成时展示质量风险提示

### Requirement: 工作流阶段操作

工作流看板 MUST NOT 仅是只读展示。用户 SHALL 能在看板上对当前阶段执行操作：每个需求行提供「继续」入口定位到下一个可推进阶段；点击 DAG 中任一阶段节点 SHALL 打开该阶段的操作面板。操作面板 SHALL 展示该阶段的依赖检查结果（canProceed、缺失的强前置、警告），并按状态提供可用操作：标记完成、跳过（仅可跳过阶段）、Explore 拍板、Apply 任务勾选；同时 SHALL 给出对应 AI 层命令（如 `/wpw:design <需求名>`）供复制后在 IDE 中执行。依赖门禁判定规则 MUST 与 CLI 内置 Schema（six-phase）的 dependsOn / optionalDeps / skippable 定义一致。一期状态变更 SHALL 持久化到浏览器本地存储，页面刷新后不丢失。

#### Scenario: 继续推进

- WHEN 用户点击某需求的「继续」按钮
- THEN 系统定位到该需求下一个可推进的阶段（首个强依赖已满足且状态为 pending 的阶段）并打开其操作面板

#### Scenario: 门禁拦截

- WHEN 用户打开某阶段操作面板且其强前置未全部完成
- THEN 面板展示缺失的前置阶段列表，操作按钮不可用

#### Scenario: 阶段操作写回

- WHEN 用户在操作面板中将某阶段标记为 done 或 skipped
- THEN 看板 DAG 中该阶段节点状态即时更新，刷新页面后状态保持

#### Scenario: Explore 拍板

- WHEN Explore 已完成但未记录选定方案
- THEN Design 阶段的依赖检查给出警告，且用户可在 Explore 操作面板中录入拍板选项

### Requirement: 知识图谱可视化

图谱可视化页 SHALL 以图形方式渲染 C-L1-L2-L3 四层节点与边，层级 MUST 可视觉区分，边类型（contain / import / call / business_map）MUST 可区分。页面 SHALL 支持按层级/类型过滤、按名称搜索定位节点，选中节点时展示其 GraphNode 属性详情。`business_map` 边 SHALL 支持一键高亮。

#### Scenario: 层级过滤

- WHEN 用户取消勾选 L3 层级
- THEN L3 节点从图中隐藏，其余层级与边保持可见

#### Scenario: 节点详情

- WHEN 用户点击图中任一节点
- THEN 侧边展示该节点的 id、level、type、name 及 attrs 扩展属性

### Requirement: 上下文生成演示

上下文演示页 SHALL 接受自然语言任务输入，并分步展示：命中的锚点、子图扩展结果、以及 loose / standard / extreme 三档压缩的对比输出与各自 Token 估算。页面 SHALL 提供 Token 预算调节控件。

#### Scenario: 三档压缩对比

- WHEN 用户输入任务并触发生成
- THEN 三档压缩结果并排展示，各自标注节点数与 Token 估算值

### Requirement: 知识库展示

知识库页 SHALL 列出全部能力 Spec，支持以渲染后的 Markdown 阅读 spec 内容，并展示知识库构建产物（图谱、向量索引）的元信息（构建时间、节点数、边数）。

#### Scenario: 能力阅读

- WHEN 用户点击某一能力 Spec
- THEN 主区域渲染该 spec 的 Markdown 内容

### Requirement: 归档中心

归档中心 SHALL 按归档月份（YYYY-MM）组织展示已归档需求，支持查看归档需求的阶段制品（BRD / PRD / Design / Plan 等文档）的渲染内容。

#### Scenario: 按月浏览

- WHEN 用户选择某个月份
- THEN 展示该月归档的需求列表，点击进入可阅读其阶段制品

### Requirement: Token 消耗统计

Token 统计页 SHALL 以图表展示 Token 消耗，支持按需求、按阶段、按时间三个维度切换查看，并区分输入与输出 Token。

#### Scenario: 维度切换

- WHEN 用户切换统计维度
- THEN 图表按所选维度重新聚合展示

### Requirement: 大模型 API 配置

API 配置页 SHALL 支持配置 base_url、apikey、model 三项，并提供连接测试功能。apikey MUST 脱敏显示（仅保留首尾少量字符），MUST NOT 写入任何会提交至版本库的文件。

#### Scenario: 连接测试

- WHEN 用户填写配置并点击连接测试
- THEN 页面给出连接成功或失败的明确反馈

#### Scenario: 密钥脱敏

- WHEN 用户查看已保存的 apikey
- THEN 页面仅显示脱敏形式（如 `sk-****xxxx`）

### Requirement: 对话交互

对话页 SHALL 在 API 配置完成后支持直接对话，响应以流式方式逐段呈现。页面 SHALL 提供「注入项目上下文」开关，开启时提问 MUST 附带图谱检索上下文。页面 SHALL 支持双栏对比模式，同一问题并列展示「纯模型」与「图谱增强」两个回答。

#### Scenario: 上下文注入开关

- WHEN 用户开启「注入项目上下文」并提问
- THEN 请求中包含项目上下文内容，且界面对该次注入可见（如展示注入的 Token 量或上下文摘要）

#### Scenario: 双栏对比

- WHEN 用户启用对比模式并提问
- THEN 左右两栏分别呈现纯模型回答与图谱增强回答

### Requirement: 数据契约与 Mock

一期前端 SHALL 通过统一的 API fetcher 层获取数据，全部数据来自 mock 文件；mock 文件的结构 MUST 与二期真实 API 响应结构一致，使得二期切换仅需修改 fetcher 的请求地址而不改动页面代码。mock 数据 SHALL 优先采用本仓库真实 CLI 输出（如 `wpw list --json`、`wpw graph stat --json`）生成。

#### Scenario: 二期无缝切换

- WHEN 二期后端就绪，将 fetcher 的请求地址从 mock 切换为 `/api/*`
- THEN 各页面无需修改即可正常工作（页面组件不直接引用 mock 文件路径）

### Requirement: 工作流 AI 协同与历史回溯

工作流看板 SHALL 支持在流转过程中与 AI 对话协同：阶段操作面板 SHALL 提供「AI 对话」页签，会话按「需求 × 阶段」隔离；用户 SHALL 能通过自然语言指令随时调整本阶段制品内容，系统 SHALL 为每次调整生成文档新版本（版本链持久化）；「阶段文档」页签 SHALL 支持查看任意历史版本并回退。系统 SHALL 记录看板上的全部状态变更（阶段推进/跳过/重置、Explore 拍板、任务勾选、文档修订、回退动作）为带状态快照的历史事件流，「历史回溯」页签 SHALL 以时间线展示并支持将需求回退到任一历史事件的状态快照。一期对话应答与文档修订为 mock 实现，事件与版本持久化到浏览器本地存储。

#### Scenario: 对话调整文档

- WHEN 用户在 AI 对话页签输入调整类指令（如「把缓存 TTL 改成 120s」）
- THEN 系统生成文档新版本并在应答中说明变更内容，文档页签可立即查看

#### Scenario: 文档版本回退

- WHEN 用户在阶段文档页签选择历史版本并点击「回退到此版本」
- THEN 当前版本指针切换到所选版本，版本链完整保留

#### Scenario: 进度回溯

- WHEN 用户在历史回溯页签对某条历史事件点击「回退到此」并确认
- THEN 需求的阶段状态恢复到该事件快照，且回退动作本身被记录为新的历史事件
