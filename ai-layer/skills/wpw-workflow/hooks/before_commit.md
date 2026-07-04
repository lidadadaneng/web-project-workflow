# Hook: before_commit

**触发时机**：用户说「提交 / push / 上线」时
**用途**：提交门禁 — CR 状态校验 + 敏感信息扫描

## 检查项

- [ ] 代码审查（`/wpw:cr`）已执行，无未修复 BLOCKER
- [ ] 改动是否扫描敏感信息（密钥 / token / 内网地址 / 个人信息）
- [ ] 提交信息是否符合规范（conventional commits）
- [ ] 是否误提交了大文件 / 临时文件 / node_modules
- [ ] Apply 任务是否全部 done

任一门禁不过则阻断提交，提示用户修复。
