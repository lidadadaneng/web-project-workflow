---
name: "WPW: Skills"
description: 管理联动 Skill（更新/列表）
category: Workflow
tags: [workflow, skills]
---

# /wpw:skills <update|list>

管理联动 Skill（`brainstorming` / `code-reviewer` / `humanizer-zh`）。这些 Skill 在各阶段 hook 中被引用（如 `@humanizer-zh` 用于去机器腔），需安装到 `.claude/skills/` 才能解析。

## update

```bash
wpw skills update
```

从 GitHub 拉取各源仓库默认分支最新版到当前项目 `.claude/skills/`，并写 manifest 记录 commit。用于实时更新到最新版本。

## list

```bash
wpw skills list
```

读取 `.claude/skills/.linked-skills-manifest.json`，显示每个联动 Skill 的来源仓库、分支、commit 与抓取时间。

## 说明

- `wpw init` 已自动释放**打包快照**版联动 Skill（维护者 `npm run update-skills` 抓取的版本）
- `wpw skills update` 跳过快照，直接拉各源仓库最新版（覆盖快照）
- 来源清单：仓库根 `linked-skills.json`（可编辑增删）
