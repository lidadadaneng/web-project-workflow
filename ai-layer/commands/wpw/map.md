---
name: "WPW: Map"
description: 扫描项目生成知识图谱
category: Workflow
tags: [workflow, map, knowledge]
---

# /wpw:map

扫描项目结构，生成知识图谱。CLI 扫结构，AI 填语义。

## 执行流程

### 1. CLI 扫描

```bash
wpw map --json
# 返回 { projectType, tech, entrypoints, dirs, apis }
```

### 2. AI 填语义

基于扫描骨架，AI 补充语义信息，生成/更新 `wpw/knowledge/` 下 YAML：

| 文件 | 内容 | 覆盖策略 |
|------|------|---------|
| `tech.yaml` | 技术栈·框架·依赖·构建配置 | 全量覆盖 |
| `service.yaml` | 服务职责·模块划分·上下游 | 全量覆盖 |
| `api.yaml` | 接口清单·路径·方法·状态 | 全量覆盖 |
| `terms.yaml` | 业务术语表 | **仅首次生成**（已存在则跳过） |

### 3. 落盘

写入 `wpw/knowledge/` 下对应 YAML 文件。

### 4. 引用

追加 `@wpw/knowledge/` 引用到 `CLAUDE.md`（若尚未引用）。
