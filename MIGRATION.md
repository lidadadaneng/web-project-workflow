# 从 soda 迁移到 wpw

本指南帮助将原 soda 项目迁移到 wpw。

## 主要变化

| 项 | 原 soda | 新 wpw |
|----|---------|--------|
| 命令前缀 | `soda:*` | `wpw:*` |
| 需求分析 | `soda:ard`（ARD） | `wpw:prd`（PRD） |
| 编码实施 | `soda:impl` | `wpw:apply` |
| 业务需求 | （无） | `wpw:brd`（新增） |
| 技术探索 | （无） | `wpw:explore`（新增） |
| 工作区 | `docs/features/active/` | `wpw/active/` |
| 归档 | `docs/features/completed/` | `wpw/archived/YYYY-MM/` |
| 状态 | `progress.md` | `.wpw.yaml` |
| 脚本 | `scripts/` 分散 | `wpw` CLI 统一 |
| 遥测 | 有 | 无（已剥离） |
| 内网依赖 | Cooper / skillshub | 无（已剥离） |

## 迁移步骤

```bash
# 1. 安装 wpw
npm install -g wpw

# 2. 运行迁移脚本（自动迁移目录 + 文档命名 + 生成 .wpw.yaml）
node scripts/migrate-from-soda.js

# 3. 验证
wpw list

# 4. 确认无误后删除旧目录
rm -rf docs/features/
```

## 文档命名迁移

| 原文件 | 新文件 |
|--------|--------|
| `ARD-{需求}.md` | `PRD-{需求}.md` |
| `BRD-{需求}.md` | `BRD-{需求}.md`（不变） |
| `Design-{需求}.md` | `Design-{需求}.md`（不变） |
| `Plan-{需求}.md` | `Plan-{需求}.md`（不变） |
| `Test-{需求}.md` | `TestPlan-{需求}.md` |

## 命令映射

| 原 soda | 新 wpw |
|---------|--------|
| `/soda:ard` | `/wpw:prd` |
| `/soda:design` | `/wpw:design` |
| `/soda:plan` | `/wpw:plan` |
| `/soda:test` | `/wpw:test` |
| `/soda:impl` | `/wpw:apply` |
| `/soda:cr` | `/wpw:cr` |
| `/soda:map` | `/wpw:map` |
| `/soda:archive` | `/wpw:archive` |
| `/soda:exp` | `/wpw:exp` |
| `/soda:sync` | `/wpw:sync` |
| `/soda:init` | `/wpw:init` |

## Hooks 迁移

| 原 | 新 |
|----|-----|
| `before_ard.md` | `before_prd.md` |
| `after_ard.md` | `after_prd.md` |
| `after_design.md` | `after_design.md` |
| `before_code.md` | `before_code.md` |
| `after_code.md` | `after_code.md` |
| `before_commit.md` | `before_commit.md` |
| （新增） | `before_brd.md` / `after_brd.md` / `after_explore.md` |

## 注意事项

- 迁移脚本会根据已存在的文档自动标记阶段为 `done`，未存在的为 `pending`
- Explore 阶段对老需求标记为 `skipped`（原 soda 无此阶段）
- 迁移后原 `progress.md` 不再使用，任务进度改由 `.wpw.yaml` 的 `progress` 字段管理
