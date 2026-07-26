## Why

当前 WPW 工具的 AI 工作流在上下文构建上依赖人工指定文件路径与目录范围，缺乏对「业务需求—模块—源码文件—代码元素」全链路的结构化建模能力，导致 AI 编码时上下文冗余度高、需求与代码追溯困难、变更影响分析依赖人工经验。知识图谱子系统通过自动构建四层研发知识图谱并提供语义检索、子图裁剪、结构化压缩能力，为上层 AI 编码、需求追溯、变更分析提供统一的知识底座，显著提升 AI 编码的精准度与上下文利用效率。

## What Changes

- 新增 `wpw graph build` 命令：全量构建业务需求-模块-文件-代码元素四层知识图谱
- 新增 `wpw graph update` 命令：基于文件哈希快照的增量图谱更新
- 新增 `wpw graph rebuild` 命令：强制清空并重建图谱
- 新增 `wpw graph stat` 命令：输出图谱统计概览
- 新增 `wpw graph query` 命令：节点精准查询、依赖链路查询、最短路径查询
- 新增 `wpw graph search` 命令：自然语言语义检索与多条件组合过滤
- 新增 `wpw graph context` 命令：端到端上下文生成（检索 + 子图裁剪 + 结构化压缩，直接输出给 AI 使用）
- 新增最小连通子图裁剪能力：基于加权双向 BFS 的多锚点子图生成，支持 Token 预算约束
- 新增结构感知层级化提示压缩：语法骨架抽取 + 层级符号化序列化 + 分级粒度控制
- 新增 `.wpf/` 本地存储目录：图谱数据文件 + 向量索引 + 本地缓存（不纳入 Git）
- 新增 `workflow.config.yaml` 图谱构建配置项：忽略目录、支持语言、相似度阈值、压缩等级、Embedding 配置等

## Capabilities

### New Capabilities

- `graph-build`：图谱构建能力，包含全量构建、增量更新、强制重建与构建校验，对接 wpw/ 需求目录与项目源码
- `graph-query`：图谱查询能力，支持节点精准查询、批量过滤、依赖链路查询、最短路径、统计概览
- `semantic-search`：语义检索能力，基于本地 Embedding 向量的自然语言召回与多条件组合过滤
- `subgraph-trimming`：最小连通子图裁剪能力，加权双向 BFS 多锚点扩展 + Token 预算约束
- `prompt-compression`：结构感知层级化提示压缩，语法骨架抽取 + 层级符号化序列化 + 分级粒度控制 + 三档压缩等级
- `graph-context`：端到端上下文生成能力，整合语义检索、子图裁剪、提示压缩，输出 AI 可用的结构化上下文

### Modified Capabilities

- `change-state`：`.wpw.yaml` 状态文件类型扩展（图谱运行时按需读取状态信息，向后兼容，无破坏性变更）
- `workflow-config`：`workflow.config.yaml` 新增 `graph` 配置段，含构建规则、模块划分、映射策略、检索参数、压缩等级、Embedding 配置等图谱全局配置

## Impact

- **新增依赖**：`web-tree-sitter`（WASM 语法解析）、`@xenova/transformers`（本地 Embedding，纯 JS 无原生依赖）
- **新增目录**：`src/graph/`（图谱子系统源码）、`.wpf/`（本地图谱产物，加入 .gitignore）
- **新增命令**：`wpw graph` 命令组（build / update / rebuild / stat / query / search / context 子命令）
- **配置扩展**：`workflow.config.yaml` 新增 `graph` 配置段，含构建规则、检索参数、压缩等级、Embedding 配置
- **对外接口**：通过 CLI 命令 + JSON 输出供上层 AI 层 Skill 调用，零付费 Token 运行（默认本地 Embedding）
- **AI 使用边界**：默认纯本地运行（规则 + 本地 Embedding + Git 追溯），零付费 Token；支持用户开启 AI 校准增强（可选，消耗极少量 Token，20 个需求约 ¥0.01），进一步提升映射质量
- **存储方案**：纯内存计算 + JSONL 结构化数据文件 + 独立二进制向量索引，首版全量重写模式，无需 SQLite 依赖
- **非破坏性**：不修改现有命令与工作流逻辑，纯新增子模块，向后兼容
