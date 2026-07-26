## 1. 项目基础搭建

- [x] 1.1 新增 `src/graph/` 目录结构与 `index.ts` 入口文件
- [x] 1.2 添加依赖：`web-tree-sitter`、`@xenova/transformers` 至 package.json
- [x] 1.3 定义核心类型：节点类型、边类型、图谱配置、子图、上下文输出等（`types.ts`）
- [x] 1.4 实现图谱配置读取与默认值（`config.ts`），扩展 `workflow.config.yaml` 的 graph 配置段
- [x] 1.5 更新 `.gitignore`，添加 `.wpf/` 目录

## 2. 存储层实现（JSONL + 内存）

- [x] 2.1 定义 GraphStore 接口：load/save/getMeta/updateMeta
- [x] 2.2 实现 JSONL 格式的图谱数据读写（`storage/graph-store.ts`）
- [x] 2.3 实现向量索引二进制文件读写（`storage/vector-store.ts`）
- [x] 2.4 实现元数据与哈希快照存储（`storage/meta-store.ts`），meta.json 格式
- [x] 2.5 实现内存图谱数据结构：节点 Map、邻接表、向量映射
- [x] 2.6 实现原子写入：新文件写入 + 重命名替换

## 3. 解析器层实现

- [x] 3.1 实现需求文档解析器（`parsers/requirement-parser.ts`）：读取 `wpw/` 目录与 `.wpw.yaml`，生成 L1 需求节点
- [x] 3.2 对接现有 ChangeState 类型：解析需求名称、状态、schema、artifact 状态等基础属性
- [x] 3.3 实现需求文档文本提取：从 BRD/PRD Markdown 中提取纯文本（剔除格式标记），用于向量化
- [x] 3.4 实现文档信息提取：从 PRD "依赖模块"字段、Design "模块划分"表格、Design "接口设计"章节提取模块名和接口名
- [x] 3.5 实现模块目录解析器（`parsers/module-parser.ts`）：基于目录结构自动推断生成 L2 模块节点
- [x] 3.6 实现模块前后端区分规则：对接 project-type 体系，自动判断前后端
- [x] 3.7 实现通用目录排除逻辑
- [x] 3.8 实现 Git 历史追溯：从 commit message 匹配需求，统计修改文件频次
- [x] 3.9 实现命名匹配：需求名与模块/文件的关键词匹配（含中英文映射词典）
- [x] 3.10 实现源码文件解析调度器（`parsers/source-parser.ts`）：按文件类型分发到对应语言解析器
- [x] 3.11 初始化 web-tree-sitter 与 TypeScript/JavaScript 语言包
- [x] 3.12 实现 TypeScript 解析器（`parsers/ts-parser.ts`）：生成 L3 文件节点与 L4 元素节点（函数、类、接口、常量）
- [x] 3.13 实现 JavaScript 解析器（`parsers/js-parser.ts`）：复用 TS 解析器逻辑
- [x] 3.14 实现元素节点签名生成逻辑

## 4. 图谱构建引擎

- [x] 4.1 实现节点生成逻辑（`builders/node-builder.ts`）：统一节点 ID 生成与属性组装
- [x] 4.2 实现关系边生成逻辑（`builders/edge-builder.ts`）：从属边（contain）、文件级 import 边、文件内 call/inherit 边、业务映射边（business_map）
- [x] 4.3 实现五层混合 business_map 生成：文档提取（高权重）+ 命名匹配（低权重兜底）+ 权重叠加
- [x] 4.4 实现多证据权重叠加逻辑：多层命中的目标权重递增（不超过 0.95）
- [ ] 4.5 实现可选 LLM 校准模块（`builders/ai-refiner.ts`）：对候选结果精排去伪，每需求调用一次（首版延后，纯本地模式优先）
- [ ] 4.6 实现模块划分 LLM 校准：全项目一次调用，补充模块职责与前后端校正（首版延后）
- [x] 4.7 实现向量生成与索引构建（`builders/vector-builder.ts`）：基于 @xenova/transformers 本地生成语义向量
- [x] 4.8 实现全量构建调度器（`builders/graph-builder.ts`）：build 流程编排
- [x] 4.9 实现增量更新逻辑：哈希快照对比、变更文件识别、内存修改、全量重写
- [x] 4.10 实现需求状态变更检测：active/archived 目录移动、.wpw.yaml 状态变化
- [x] 4.11 实现强制重建逻辑：清空数据 + 全量重建
- [x] 4.12 实现构建完整性校验：节点 ID 唯一性、边引用合法性、向量映射一致性

## 5. 查询与检索能力

- [x] 5.1 实现结构化查询 API（`search/graph-query.ts`）：节点精准查询、批量过滤、依赖链路查询、最短路径、统计概览
- [x] 5.2 实现语义检索引擎（`search/semantic-search.ts`）：余弦相似度计算、Top-N 召回、多条件组合过滤
- [x] 5.3 实现归档需求过滤逻辑
- [x] 5.4 实现向量加载与缓存（查询时加载到内存）

## 6. 子图裁剪能力

- [x] 6.1 实现加权双向 BFS 算法（`trimming/subgraph-trimmer.ts`）
- [x] 6.2 实现多锚点子图合并与去重
- [x] 6.3 实现结构重要度计算（加权入度）
- [x] 6.4 实现节点上限裁剪：语义分 + 结构重要度综合得分排序
- [x] 6.5 实现 Token 预算约束裁剪：迭代调整粒度直至满足预算

## 7. 提示压缩能力

- [x] 7.1 实现语法骨架抽取（`compression/skeleton-extractor.ts`）：保留签名与类型，剔除实现体
- [x] 7.2 实现层级符号化序列化（`compression/hierarchical-serializer.ts`）：L1→L2→L3→L4 缩进输出 + 标准化符号（⊃→⇄）
- [x] 7.3 实现分级粒度控制：按锚点距离调整输出详细度（锚点/一级/二级+）
- [x] 7.4 实现三档压缩等级（loose / standard / extreme）
- [x] 7.5 实现 Token 估算与压缩率统计

## 8. Context Pipeline

- [x] 8.1 实现端到端 context pipeline（`context/context-pipeline.ts`）：检索 → 裁剪 → 骨架抽取 → 序列化
- [x] 8.2 实现 Token 预算迭代调整逻辑
- [x] 8.3 实现多锚点合并与去重
- [x] 8.4 实现上下文输出格式：文本模式与 JSON 模式
- [x] 8.5 实现统计信息收集：各阶段耗时、节点边数、Token 估算、压缩率

## 9. CLI 命令集成

- [x] 9.1 新增 `wpw graph build` 命令
- [x] 9.2 新增 `wpw graph update` 命令
- [x] 9.3 新增 `wpw graph rebuild` 命令
- [x] 9.4 新增 `wpw graph stat` 命令
- [x] 9.5 新增 `wpw graph query` 命令（节点查询、依赖查询、最短路径）
- [x] 9.6 新增 `wpw graph search` 命令（语义检索）
- [x] 9.7 新增 `wpw graph context` 命令（端到端上下文生成）
- [x] 9.8 注册 graph 子命令组到主 CLI
- [x] 9.9 所有查询类命令支持 `--json` 输出格式

## 10. 测试与验证

- [x] 10.1 编写存储层单元测试（JSONL 读写、原子写入、元数据）
- [x] 10.2 编写解析器单元测试（需求解析、模块解析、TS 源码解析）
- [x] 10.3 编写构建引擎测试（全量构建、增量更新、重建、校验）
- [x] 10.4 编写查询与检索测试（节点查询、依赖查询、语义检索、过滤）
- [x] 10.5 编写子图裁剪测试（双向 BFS、多锚点合并、节点上限、Token 预算）
- [x] 10.6 编写压缩序列化测试（骨架抽取、层级输出、分级粒度、压缩等级）
- [x] 10.7 编写 context pipeline 测试（端到端流程、JSON 输出、统计信息）
- [x] 10.8 端到端验证：在 WPW 项目自身运行 `wpw graph build` + `wpw graph context` 并验证结果

## 11. 文档与收尾

- [x] 11.1 更新 README，添加知识图谱功能介绍与命令说明
- [x] 11.2 导出类型定义与公共 API（`src/graph/index.ts`）
- [x] 11.3 验证 TypeScript 编译通过（`npx tsc --noEmit`）
- [x] 11.4 验证所有测试通过（综合验证脚本 + CLI 实测）
