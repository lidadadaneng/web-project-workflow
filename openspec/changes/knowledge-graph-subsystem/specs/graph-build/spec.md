## ADDED Requirements

### Requirement: 向量索引构建集成
图谱构建流程 SHALL 集成向量索引生成，全量构建时自动为所有支持的节点生成语义向量并持久化。

#### Scenario: 全量构建生成向量
- **WHEN** 执行 `wpw graph build` 且 embedding.enabled 为 true
- **THEN** 系统在构建完图谱结构后，自动为 L1/L2/L3/L4 节点生成向量
- **AND** 向量索引与 mapping 持久化到 `wpw/knowledge/graph/index/` 目录
- **AND** meta.json 中 totalVectors 字段正确更新

#### Scenario: 向量构建失败降级
- **WHEN** Embedding 模型下载或加载失败
- **THEN** 系统跳过向量生成，输出警告信息
- **AND** 图谱结构数据正常保存
- **AND** `wpw graph search` 提示向量索引不存在
- **AND** `wpw graph context` 的 `--anchors` 模式仍可正常使用

#### Scenario: 增量更新重建向量
- **WHEN** 执行 `wpw graph update` 且有文件变更
- **THEN** 向量索引全量重建（首版简化实现）
- **AND** 与全量构建的向量结果一致

#### Scenario: 关闭向量生成
- **WHEN** 配置 `graph.embedding.enabled: false`
- **THEN** 构建流程跳过向量生成阶段
- **AND** 构建速度更快

### Requirement: Embedding 模型镜像源配置
系统 SHALL 支持配置 Embedding 模型下载镜像源，以适配不同网络环境（如国内无法访问 HuggingFace）。

#### Scenario: 默认 HuggingFace 源
- **WHEN** 未配置 `graph.embedding.mirror` 或配置为 `huggingface`
- **THEN** 系统从 HuggingFace（huggingface.co）下载模型

#### Scenario: 切换 ModelScope 镜像
- **WHEN** 配置 `graph.embedding.mirror: modelscope`
- **THEN** 系统从 ModelScope（modelscope.cn）下载模型
- **AND** 下载的模型与 HuggingFace 源等价
- **AND** 模型缓存后后续构建无需重复下载

#### Scenario: 查询与构建使用同一模型
- **WHEN** 执行 `wpw graph search` 或 `wpw graph context` 语义检索
- **THEN** 查询向量生成使用与构建时相同的模型名与镜像源
- **AND** 从配置中读取，确保查询向量与索引向量维度一致

### Requirement: 多前端语言支持
源码解析器 SHALL 支持 TypeScript、TSX、JavaScript、JSX、Vue SFC 五种前端主流文件格式。

#### Scenario: TypeScript 文件解析
- **WHEN** 解析 `.ts` 文件
- **THEN** 使用 tree-sitter-typescript 解析
- **AND** 提取函数、类、接口、常量、类型别名

#### Scenario: TSX 文件解析
- **WHEN** 解析 `.tsx` 文件
- **THEN** 使用 tree-sitter-tsx（独立 WASM）解析
- **AND** 提取函数、组件、类、接口、常量
- **AND** 首字母大写的函数标记为组件类型

#### Scenario: JavaScript 文件解析
- **WHEN** 解析 `.js` / `.mjs` / `.cjs` 文件
- **THEN** 使用 tree-sitter-javascript 解析
- **AND** 提取函数、类、常量

#### Scenario: JSX 文件解析
- **WHEN** 解析 `.jsx` 文件
- **THEN** 使用 tree-sitter-javascript 解析（原生支持 JSX）
- **AND** 提取函数、组件、类、常量
- **AND** 首字母大写的函数标记为组件类型

#### Scenario: Vue SFC 文件解析
- **WHEN** 解析 `.vue` 文件
- **THEN** 系统提取 `<script>` 或 `<script setup>` 块内容
- **AND** 如果 `lang="ts"`，用 TypeScript 解析；否则用 JavaScript 解析
- **AND** 文件节点标记为 Vue 组件
- **AND** 组件名从文件名推断（PascalCase）

#### Scenario: Vue SFC 无 script 块
- **WHEN** 解析的 `.vue` 文件没有 `<script>` 块
- **THEN** 仍生成文件节点（标记为 Vue 组件）
- **AND** 没有 L4 元素节点
- **AND** 不报错

#### Scenario: import 边生成支持所有格式
- **WHEN** 构建 import 边时
- **THEN** TS/TSX/JS/JSX/Vue 文件的 import 语句都被正确提取
- **AND** 跨格式的 import 关系（如 .vue import .ts）正确建立
