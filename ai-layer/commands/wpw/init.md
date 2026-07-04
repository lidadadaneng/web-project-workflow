---
name: "WPW: Init"
description: 初始化 wpw 项目
category: Workflow
tags: [workflow, init]
---

# /wpw:init [路径]

初始化 wpw 项目。

## 执行流程

### 1. 执行 CLI 初始化

```bash
wpw init [路径]
```

CLI 自动完成：
- 生成 `workflow.config.yaml`（已存在则只更新路径字段，保留用户自定义）
- 创建 `wpw/active`、`wpw/archived`、`wpw/knowledge` 目录
- 释放 AI 层到 `.claude/`（SKILL.md + `commands/wpw/` + hooks）

### 2. 确认项目类型

检查 `workflow.config.yaml` 的 `project.type`。若为 `auto`，CLI 已嗅探判断。

### 3. 输出

提示用户可用的 `/wpw:*` 命令，建议从 `/wpw:brd <需求名>` 开始第一个需求。
