## Why

当前知识图谱检索存在三个体验瓶颈：中文关键词检索效果远弱于英文（双语 embedding 空间不匹配导致语义扩展断链）、重名函数无法区分所属页面（函数节点缺少文件上下文）、Pinia store 的 actions 未被索引（前端业务逻辑的关键一层缺失）。这三类问题共同降低了图谱的检索召回率和结果可用性，需要一次性补齐。

## What Changes

- **中文检索增强**：在向量语义检索和名称匹配两条路径上增加中文支持，包括对 JSDoc/注释/中文名的索引、多语言 embedding 或中文别名 fallback 策略，使中文关键词能触发与英文同等质量的语义扩展。
- **重名函数去歧义**：在 L4 函数节点上附加所属文件路径、所属组件/Pinia store 等上下文信息，搜索结果展示时展示完整 `file#function` 标识，排序时考虑上下文匹配度。
- **Pinia actions 索引**：扩展解析器支持 `.js/.ts` 格式的 Pinia store，将 `defineStore` 中的 actions、getters、state 字段作为 L4 节点纳入图谱，并建立与组件调用方的边关系。

## Capabilities

### New Capabilities
- `pinia-store-indexing`：Pinia store 解析与节点/边构建能力，覆盖 defineStore 的 actions/getters/state 索引及组件调用关系。

### Modified Capabilities
- `semantic-search`：增加中文检索支持要求，包括中文关键词的召回率、双语 embedding 或别名映射策略。
- `graph-build`：扩展节点属性规范（函数节点携带所属文件/组件信息），新增 Pinia store 节点类型。
- `graph-query`：搜索结果展示增加去歧义信息（文件路径 + 函数名），排序算法考虑上下文匹配度。

## Impact

- 解析层：`src/graph/parsers/` 新增 Pinia store 解析器，TS/Vue 解析器增加函数所属文件信息采集。
- 构建层：`src/graph/builders/` 新增 Pinia 节点/边构建逻辑，节点类型定义扩展。
- 检索层：`src/graph/search/semantic-search.ts` 增加中文处理流程，排序逻辑增加文件上下文权重。
- 向量索引：重新生成 embedding 需包含中文语义（或增加中文字段的独立 embedding + 融合）。
