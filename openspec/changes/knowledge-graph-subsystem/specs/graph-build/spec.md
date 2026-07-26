## ADDED Requirements

### Requirement: 全量图谱构建
系统 SHALL 支持通过 `wpw graph build` 命令执行全量图谱构建，遍历 `wpw/` 需求目录与项目源码，生成 L1-L4 四层节点与三类关系边，并持久化至本地 `.wpf/` 目录。

#### Scenario: 首次全量构建成功
- **WHEN** 用户在项目根目录执行 `wpw graph build`，且项目包含有效的 `wpw/` 需求目录与源码目录
- **THEN** 系统生成完整的 `graph.jsonl` 图谱数据文件、`vector.index` 向量索引文件、`meta.json` 元数据文件至 `.wpf/` 目录
- **AND** 输出构建统计报告（各层级节点数、边数、向量数、构建耗时）
- **AND** 写入构建元数据与源文件哈希快照

#### Scenario: 配置缺失时降级构建
- **WHEN** 执行 `wpw graph build` 但 `workflow.config.yaml` 不存在或缺少 graph 配置段
- **THEN** 系统使用默认配置完成构建
- **AND** 输出配置使用提示

#### Scenario: 空项目构建
- **WHEN** 执行 `wpw graph build` 但项目中无 `wpw/` 目录且无可解析源码文件
- **THEN** 系统生成空图谱（元数据存在，节点边为空）
- **AND** 输出警告信息提示无有效数据源

### Requirement: 增量图谱更新
系统 SHALL 支持通过 `wpw graph update` 命令执行增量更新，基于上一次构建的源文件哈希快照，仅对变更文件执行解析与图谱更新。

#### Scenario: 单文件修改后增量更新
- **WHEN** 已有完整图谱，且某个源码文件被修改后执行 `wpw graph update`
- **THEN** 系统仅重新解析该变更文件及其关联的节点与边
- **AND** 更新对应节点的语义向量
- **AND** 更新哈希快照与元数据
- **AND** 增量更新耗时 ≤ 3s（单文件场景）

#### Scenario: 增量更新原子性
- **WHEN** 增量更新过程中发生异常中断
- **THEN** 原有图谱数据保持完整可用，不被破坏
- **AND** 系统输出错误信息

#### Scenario: 首次执行增量更新
- **WHEN** 项目中不存在历史图谱，执行 `wpw graph update`
- **THEN** 系统自动降级为全量构建

### Requirement: 强制重建图谱
系统 SHALL 支持通过 `wpw graph rebuild` 命令清空现有图谱并从零重建。

#### Scenario: 配置变更后强制重建
- **WHEN** 用户修改了 `workflow.config.yaml` 中的 graph 配置后执行 `wpw graph rebuild`
- **THEN** 系统清空现有图谱数据、向量索引与缓存快照
- **AND** 按照全量构建流程生成全新图谱

### Requirement: 构建完整性校验
系统 SHALL 在每次构建完成后自动执行图谱完整性校验。

#### Scenario: 构建校验通过
- **WHEN** 全量或增量构建完成
- **THEN** 系统自动校验节点 ID 唯一性、边的节点引用合法性、向量映射一致性
- **AND** 校验结果包含在构建统计报告中

#### Scenario: 构建校验发现异常
- **WHEN** 构建完成后校验发现节点 ID 冲突或边引用不存在节点
- **THEN** 系统输出异常告警，列出具体异常项
- **AND** 建议用户执行 `wpw graph rebuild` 修复

### Requirement: 需求节点解析
系统 SHALL 从 WPW 现有 `wpw/` 需求目录与 `.wpw.yaml` 状态文件解析生成 L1 业务需求节点，并与现有需求体系完全对齐。

#### Scenario: 从 .wpw.yaml 读取需求基础信息
- **WHEN** 构建时解析 `wpw/active/` 与 `wpw/archived/` 下的需求
- **THEN** 从 `.wpw.yaml` 读取需求名称、创建时间、schema、各 artifact 状态、项目类型
- **AND** 根据目录位置标记 `archived` 属性（active=false, archived=true）

#### Scenario: 从需求文档提取语义文本
- **WHEN** 构建时为每个需求生成语义向量
- **THEN** 提取 BRD 与 PRD 文档的纯文本内容（剔除 Markdown 格式标记）
- **AND** 将 BRD + PRD 文本拼接后生成需求节点的语义向量
- **AND** Explore / Design / Plan / TestPlan 文档不参与向量化

#### Scenario: .wpw.yaml 无 graph 配置时降级
- **WHEN** 需求的 `.wpw.yaml` 中没有 `graph` 配置段
- **THEN** 该需求的 business_map 边完全通过语义匹配自动生成
- **AND** 不影响需求节点本身的创建

### Requirement: 文档提取自动映射
系统 SHALL 从 PRD、Design 等需求文档的特定章节自动提取模块名、接口名等信息，生成高置信 business_map 边。

#### Scenario: 从 PRD 依赖模块字段提取
- **WHEN** 需求的 PRD 文档中"依赖模块"章节填写了模块名称
- **THEN** 自动提取模块名并在代码中匹配
- **AND** 匹配成功生成 business_map 边，权重 0.85（高置信）

#### Scenario: 从 Design 模块划分表格提取
- **WHEN** 需求的 Design 文档中"模块划分"表格包含模块名和职责
- **THEN** 自动提取模块名并在代码中匹配
- **AND** 匹配成功生成 business_map 边，权重 0.85

#### Scenario: 从 Design 接口设计提取
- **WHEN** 需求的 Design 文档中"接口设计"章节包含接口路径和名称
- **THEN** 自动提取接口名并在代码中匹配对应的控制器/路由
- **AND** 匹配成功生成 business_map 边，权重 0.8

#### Scenario: 文档无相关内容时降级
- **WHEN** 需求文档中未包含可提取的模块或接口信息
- **THEN** 自动降级，继续通过其他层（语义匹配、Git 追溯等）建立映射

### Requirement: 语义匹配自动映射
系统 SHALL 基于本地 Embedding 向量的语义相似度自动建立需求与代码的 business_map 边。

#### Scenario: 语义匹配生成映射边
- **WHEN** 需求与某个模块/文件的语义相似度超过阈值
- **THEN** 生成 business_map 边
- **AND** 边权重 = 相似度 × 0.75（动态权重）

#### Scenario: 低相似度不建边
- **WHEN** 需求与模块/文件的语义相似度低于阈值
- **THEN** 不生成 business_map 边
- **AND** 避免误匹配污染图谱

### Requirement: Git 历史追溯映射
系统 SHALL 基于 Git 提交历史自动追溯需求关联的代码文件。

#### Scenario: 从 commit message 识别相关 commit
- **WHEN** Git 历史中存在 commit message 含需求名或关键词的提交
- **THEN** 统计这些 commit 修改的文件频次
- **AND** 高频文件生成 business_map 边，权重按频次动态计算（0.4~0.7）

#### Scenario: 无 Git 历史时跳过
- **WHEN** 项目不是 Git 仓库或没有匹配的 commit
- **THEN** 跳过 Git 追溯
- **AND** 不影响其他映射方式

### Requirement: 命名匹配兜底映射
系统 SHALL 基于需求名称与模块/文件名的字符串匹配建立低权重兜底映射。

#### Scenario: 命名匹配生成边
- **WHEN** 需求名称与模块/文件名存在关键词匹配（含中英文映射）
- **THEN** 生成低权重 business_map 边（0.4）
- **AND** 作为长尾兜底，避免完全匹配不到

### Requirement: 多层证据权重叠加
系统 SHALL 对多层映射命中的同一目标执行权重叠加，多证据命中的目标置信度更高。

#### Scenario: 多证据命中权重叠加
- **WHEN** 同一个模块被文档提取 + 语义匹配 + Git 追溯同时命中
- **THEN** 边权重按叠加规则提升（最高不超过 0.95）
- **AND** 比单证据命中的目标权重更高

#### Scenario: 单证据命中保持基础权重
- **WHEN** 目标仅被一层证据命中
- **THEN** 边权重为该层的基础权重

### Requirement: AI 校准增强（可选）
系统 SHALL 支持可选的 LLM 校准模式，在前四层自动映射的基础上，用 LLM 做精排与去伪存真，极少量 Token 消耗换取更高的映射质量。

#### Scenario: 开启 AI 校准后映射质量提升
- **WHEN** 配置 `graph.mapping.mode: ai-refine` 执行构建
- **THEN** 对每个需求的候选映射结果调用一次 LLM 进行校准
- **AND** 去除明显不相关的误匹配
- **AND** 调整各目标的最终置信度
- **AND** 每个需求 Token 消耗 ≤ 2000

#### Scenario: 默认关闭 AI 校准
- **WHEN** 使用默认配置（mode: local）执行构建
- **THEN** 不调用任何 LLM API
- **AND** 零付费 Token 运行

#### Scenario: 模块划分 AI 校准
- **WHEN** 开启 AI 校准模式
- **THEN** 全项目调用一次 LLM 校准模块划分结果
- **AND** 补充模块职责描述、校正前后端属性
- **AND** Token 消耗 ≤ 5000（一次性）

### Requirement: 模块自动划分
系统 SHALL 基于源码目录结构自动推断 L2 业务模块节点，支持配置覆盖自动推断结果。

#### Scenario: 模块化目录自动识别
- **WHEN** 项目源码中存在 `src/modules/<name>/` 或类似模块化目录结构
- **THEN** 每个子目录自动识别为一个业务模块
- **AND** 模块名称与目录名一致

#### Scenario: 配置手动定义模块
- **WHEN** `workflow.config.yaml` 的 `graph.modules` 中手动定义了模块列表
- **THEN** 使用配置的模块定义覆盖自动推断结果
- **AND** 每个模块包含名称、所属端、目录、描述等属性

#### Scenario: 通用目录排除
- **WHEN** 目录名为 `utils`、`helpers`、`common`、`shared`、`lib` 等通用名称
- **THEN** 该目录不被识别为业务模块
- **AND** 可通过 `graph.build.commonDirs` 配置调整排除列表

### Requirement: 模块前后端区分
系统 SHALL 为每个 L2 模块节点标记所属端（前端/后端/共享），区分规则与现有 project.type 体系对齐。

#### Scenario: 纯前端/纯后端项目
- **WHEN** 项目类型为纯前端（frontend-*）或纯后端（backend-*）
- **THEN** 所有模块的所属端与项目类型一致

#### Scenario: 全栈项目自动区分
- **WHEN** 项目类型为 fullstack
- **THEN** 根据模块目录特征与文件类型自动判断所属端
- **AND** 无法判断的模块标记为 `shared`

#### Scenario: 配置明确指定
- **WHEN** 模块配置中明确指定了 `side` 属性
- **THEN** 使用配置值，优先级最高

### Requirement: 需求状态同步
系统 SHALL 将需求的状态信息同步到图谱节点，并支持状态变化时的增量更新。

#### Scenario: 归档需求标记
- **WHEN** 需求位于 `wpw/archived/` 目录下
- **THEN** 该需求节点的 `archived` 属性为 true
- **AND** 语义检索默认过滤归档需求

#### Scenario: 需求状态变更触发增量更新
- **WHEN** 需求在 active 与 archived 目录间移动，或 `.wpw.yaml` 状态变化
- **THEN** 增量更新时检测到文件变化，自动更新需求节点属性
- **AND** 同步更新相关边的权重（如归档需求的 business_map 边权重降低）

### Requirement: 本地 Embedding 零付费运行
系统 SHALL 使用本地 Embedding 模型生成向量，纯本地运行，不调用任何远程 API。

#### Scenario: 本地模型生成向量
- **WHEN** 执行 `wpw graph build`
- **THEN** 系统使用本地 Embedding 模型（@xenova/transformers）生成所有向量
- **AND** 不发起任何外部 API 调用
- **AND** 首次构建时自动下载模型文件至本地缓存
