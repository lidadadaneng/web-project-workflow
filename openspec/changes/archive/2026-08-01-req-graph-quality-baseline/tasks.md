## 1. 类型与基础设施

- [x] 1.1 在 `GraphMeta` 接口中新增 `schemaVersion` 字段，定义当前 schema 版本常量（如 `"2.0"`）
- [x] 1.2 在 `NodeAttributes` 中新增 `features` 字段（数组类型，包含 id/name/priority/description）
- [x] 1.3 确认 `JsonMetaStore` 能正确读写新增的 schemaVersion 字段

## 2. 需求节点 ID 稳定化

- [x] 2.1 修改 `requirement-parser.ts` 中 `generateNodeId('req', ...)` 的调用，从 `[dirPath, name]` 改为 `[name]`
- [x] 2.2 在 `wpw new` 创建需求时，增加全局重名检查（同时检查 active 和 archived）
- [x] 2.3 更新 `parseAllRequirements` 中 archived 需求的解析逻辑，确保 ID 生成规则一致
- [x] 2.4 构建验证：TypeScript 编译通过

## 3. updateGraph 需求变更检测

- [x] 3.1 在 `updateGraph` 中新增需求层面的变更检测（在文件变更检测之后）
- [x] 3.2 实现需求差异对比逻辑：全量重解析所有需求，与旧图谱对比，识别新增/归档/属性变更
- [x] 3.3 实现需求节点更新：新增节点、更新 archived 状态、更新 docPath、更新 status
- [x] 3.4 修改"无文件变更直接返回 null"的逻辑：需求有变更时继续执行

> **已知限制**：增量更新中需求变更不重建 business_map 边（与文件变更的 business_map 处理策略一致，均为首版简化）。
> 需求有变更时，建议执行 `wpw graph rebuild` 全量重建以确保 business_map 边完整。

## 4. Schema 版本校验

- [x] 4.1 在 `updateGraph` 开头增加 schema 版本检查
- [x] 4.2 版本不兼容时，自动降级为全量构建（`buildGraph`）
- [x] 4.3 降级时输出明确的提示信息，说明原因和正在执行重建
- [x] 4.4 全量构建时正确写入当前 schema 版本到 meta

## 5. PRD 功能条目结构化提取

- [x] 5.1 在 `requirement-parser.ts` 中实现 `extractFeaturesFromPRD` 函数
- [x] 5.2 实现「功能清单」表格解析（识别表头列，提取每行的编号/功能名/优先级/描述）
- [x] 5.3 实现「详细功能说明」章节解析，按 `### Fx: ` 匹配并提取详细描述
- [x] 5.4 将功能条目存入需求节点的 `attrs.features` 属性
- [x] 5.5 更新 `extractDocContent` / 向量化文本构建，将功能条目纳入向量输入

## 6. 验证与测试

- [x] 6.1 执行 `npm run build` 确认 TypeScript 编译无错
- [x] 6.2 验证归档后需求节点 ID 不变：构建 → 归档 → updateGraph → 检查节点数和边数
- [x] 6.3 验证功能条目提取：用项目内已有需求的 PRD 做测试
- [x] 6.4 验证 schema 版本不兼容时降级全量构建
- [x] 6.5 验证 `wpw new` 重名检查正确拦截
