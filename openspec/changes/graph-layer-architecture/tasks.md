## 1. 类型与 Schema 升级

- [ ] 1.1 修改 `src/graph/types.ts`：NodeLevel 从 L1-L4 改为 C/L1/L2/L3
- [ ] 1.2 新增 NODE_TYPE_CAPABILITY 常量，移除 NODE_TYPE_REQUIREMENT（或保留兼容）
- [ ] 1.3 Schema 版本常量升级到 3.0.0
- [ ] 1.4 构建验证：TypeScript 编译通过

## 2. C 层能力节点解析器

- [ ] 2.1 新建 `src/graph/parsers/capability-parser.ts`，从 wpw/specs/ 解析能力 spec
- [ ] 2.2 实现 Purpose 章节提取，作为节点 description
- [ ] 2.3 实现 Requirements/Scenarios 结构化提取，存入 attrs.features
- [ ] 2.4 空 specs 目录兼容（C 层节点数为 0，不报错）
- [ ] 2.5 移除原需求解析逻辑（parseAllRequirements 从构建流程中摘除）

## 3. 图谱构建器适配

- [ ] 3.1 修改 `graph-builder.ts` 构建流程：C 层替换原需求层
- [ ] 3.2 contain 边构建：L1 ⊃ L2 ⊃ L3（原 L2/L3/L4 逻辑平移）
- [ ] 3.3 business_map 边构建：C → L1/L2/L3（原需求映射逻辑迁移到能力节点）
- [ ] 3.4 节点统计输出：C/L1/L2/L3 分布
- [ ] 3.5 Schema 版本校验：检测到旧版本自动全量重建

## 4. 置信度衰减加权算法

- [ ] 4.1 在 `semantic-search.ts` 中实现置信度衰减加权函数
- [ ] 4.2 新增配置项：`graph.search.decayAlpha`，默认 3.0
- [ ] 4.3 锚点选择时：计算 C 层置信度 → 计算 L1 衰减权重 → L1 得分加权
- [ ] 4.4 L2/L3 层得分保持不变
- [ ] 4.5 C 层为空时 Conf_C = 0，L1 权重 = 1.0（兜底模式）
- [ ] 4.6 直接锚点模式（--anchors）跳过衰减

## 5. 上下文管线适配

- [ ] 5.1 修改 `context-pipeline.ts` 适配新层级命名
- [ ] 5.2 集成置信度衰减锚点选择（语义检索后、子图扩展前）
- [ ] 5.3 子图扩展路径适配：C 锚点 → business_map → 结构层
- [ ] 5.4 压缩输出层级标记更新：C=能力, L1=模块, L2=文件, L3=元素

## 6. 查询与检索命令适配

- [ ] 6.1 `wpw graph query` 层级参数适配：C/L1/L2/L3
- [ ] 6.2 `wpw graph search` 层级参数适配
- [ ] 6.3 `wpw graph context` 层级参数适配
- [ ] 6.4 旧层级值（L1/L2/L3/L4）向后兼容警告与映射
- [ ] 6.5 `wpw graph stat` 输出适配新命名

## 7. 归档能力沉淀机制

- [ ] 7.1 修改归档流程：归档前 AI 判断需求归属的能力领域
- [ ] 7.2 新增能力 spec 生成：新能力 → 创建 wpw/specs/<name>/spec.md（OpenSpec 格式）
- [ ] 7.3 已有能力更新：读取现有 spec → delta 合并 → 写回
- [ ] 7.4 business_map 证据合并：需求的映射证据合并到对应能力节点
- [ ] 7.5 AI 自动决策，无需用户确认

## 8. AI 层文档全面更新

- [ ] 8.1 `ai-layer/commands/wpw/map.md`：图谱四层模型说明全面更新为 C+L1/L2/L3
- [ ] 8.2 `ai-layer/skills/wpw-workflow/SKILL.md`：图谱章节同步更新
- [ ] 8.3 `ai-layer/commands/wpw/brd.md`：引用图谱的地方更新术语
- [ ] 8.4 `ai-layer/commands/wpw/explore.md`：图谱上下文调用更新
- [ ] 8.5 `ai-layer/commands/wpw/design.md`：图谱上下文调用更新
- [ ] 8.6 `ai-layer/commands/wpw/apply.md`：图谱上下文调用更新
- [ ] 8.7 `ai-layer/commands/wpw/archive.md`：新增能力沉淀说明
- [ ] 8.8 其他 AI 层文件中引用图谱层级的地方全部更新

## 9. 验证与测试

- [ ] 9.1 TypeScript 编译通过
- [ ] 9.2 Schema 版本不兼容时自动全量重建验证
- [ ] 9.3 空 specs 目录构建验证（C 层 0 节点，图谱正常）
- [ ] 9.4 C 层节点解析验证（从 spec.md 正确提取 name/description/features）
- [ ] 9.5 置信度衰减验证：高 C 置信时 L1 权重低，低 C 置信时 L1 权重高
- [ ] 9.6 子图扩展验证：C 锚点沿 business_map 正确扩展到结构层
- [ ] 9.7 查询命令层级参数验证：C/L1/L2/L3 均正常
