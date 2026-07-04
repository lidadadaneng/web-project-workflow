# Hooks

各阶段命令文件在指定 Step 通过 Read 明确绑定对应钩子，AI 不会自动扫描目录。

## 钩子清单

| 钩子文件 | 触发时机 | 用途 |
|----------|----------|------|
| `before_brd.md` | BRD 生成前 | 需求输入完整性检查 |
| `after_brd.md` | BRD 确认后 | 业务需求覆盖检查 |
| `before_prd.md` | PRD 生成前 | BRD 完整性检查 |
| `after_prd.md` | PRD 确认后 | 需求覆盖检查 |
| `after_explore.md` | Explore 确认后 | 方案完整性检查 |
| `after_design.md` | Design 确认后 | 架构完整性检查 |
| `before_code.md` | 写代码前（Apply 每任务前） | 环境/方案就绪检查 |
| `after_code.md` | 代码落盘后（Apply 每任务后） | Lint/风险扫描 |
| `before_commit.md` | 提交时 | 提交门禁：CR 状态 + 敏感信息扫描 |

## 使用方式

AI 在执行各阶段命令时，于对应 Step 主动 Read 钩子文件并执行其检查项。钩子不通过时，提示用户修正后再继续。

## 与原 soda hooks 的迁移关系

| 原 soda | 新 wpw | 说明 |
|---------|--------|------|
| `before_ard.md` | `before_prd.md` | ARD 改名 PRD |
| `after_ard.md` | `after_prd.md` | ARD 改名 PRD |
| `after_design.md` | `after_design.md` | 保留 |
| `before_code.md` | `before_code.md` | 保留 |
| `after_code.md` | `after_code.md` | 保留 |
| `before_commit.md` | `before_commit.md` | 保留 |
| （新增） | `before_brd.md` | BRD 阶段新增 |
| （新增） | `after_brd.md` | BRD 阶段新增 |
| （新增） | `after_explore.md` | Explore 阶段新增 |
