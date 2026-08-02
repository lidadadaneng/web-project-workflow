## Why

当前知识图谱在需求维度存在三个基础质量问题：1）归档后需求节点 ID 因路径变化而改变，导致关联边断裂；2）增量更新（`wpw graph update`）不检测需求变更，归档后图谱状态不正确；3）需求节点仅从文档中提取纯文本用于向量化，未利用 PRD 中已有的 F1/F2 功能清单结构化信息。这些问题影响图谱的一致性、可用性和检索质量，且都是纯规则可解、零 token 成本的基础改进。

## What Changes

- 需求节点 ID 生成规则从「目录路径 + 名称」改为「名称」，保证归档后 ID 稳定，关联边不丢失
- `updateGraph` 新增需求变更检测能力（新增/归档/状态变更），归档后图谱正确反映 archived 状态
- 需求解析器新增 PRD 功能条目提取（F1/F2 功能清单 + 详细功能说明），作为需求节点属性存储，提升语义检索粒度
- 提供图谱 schema 版本检测与重建提示，应对 ID 规则变更导致的不兼容

## Capabilities

### New Capabilities

- `req-structured-features`：从 PRD 文档中结构化提取功能条目（编号、名称、优先级、描述），作为 L1 需求节点属性存储，支持更细粒度的需求检索和展示。

### Modified Capabilities

- `graph-build`：需求节点 ID 生成规则调整（name-based 替代 path-based），增量更新流程新增需求变更检测与同步，新增 schema 版本校验与不兼容提示。

## Impact

- `src/graph/parsers/requirement-parser.ts`：ID 生成规则变更 + 新增功能条目解析
- `src/graph/builders/graph-builder.ts`：`updateGraph` 新增需求变更处理逻辑 + schema 版本校验
- `src/graph/types.ts`：`NodeAttributes` 新增 `features` 字段
- `wpw/knowledge/graph/` 下的已有图谱数据不兼容，需全量重建（通过 schema 版本检测自动提示用户）
- 不影响 CLI 命令接口，不新增外部依赖
