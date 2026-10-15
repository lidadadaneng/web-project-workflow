# Hook: after_code

**触发时机**：代码落盘后（Apply 阶段每任务编码后）
**用途**：Lint / 风险扫描

## 检查项

- [ ] 代码是否符合项目规范（ESLint / Prettier / 语言风格）
- [ ] 是否引入未声明的依赖
- [ ] 是否有明显的安全风险（硬编码密钥 / SQL 注入 / XSS）
- [ ] 是否有明显的性能问题（N+1 查询 / 不必要循环）
- [ ] 任务标记已置为 done（`wpw task --state done`）
- [ ] progress 已同步
