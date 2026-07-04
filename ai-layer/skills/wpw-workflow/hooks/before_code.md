# Hook: before_code

**触发时机**：写代码前（Apply 阶段每任务编码前）
**用途**：环境/方案就绪检查

## 检查项

- [ ] Plan 已落盘（`wpw apply` 返回 state=ready）
- [ ] 当前任务在 Plan 中已定位
- [ ] Design 文档已读取，方案明确
- [ ] 依赖的上下游模块已确认
- [ ] 任务标记已置为 in-progress（`wpw task --state in-progress`）
