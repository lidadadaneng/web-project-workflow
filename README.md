# wpw - Web Project Workflow CLI

AI 驱动的六阶段 Web 项目开发工作流 CLI。CLI 承载确定性逻辑（状态/依赖/路径/模板），AI 层负责理解与生成，三层分离。

## 安装

```bash
npm install -g wpw
```

或免全局安装：

```bash
npx wpw <command>
```

## 快速开始

```bash
# 1. 初始化项目（生成 workflow.config.yaml + 目录 + 释放 AI 层到 .claude/）
wpw init

# 2. 创建需求
wpw new <需求名>

# 3. 在支持 Skill 的 IDE 中执行 AI 命令驱动各阶段
/wpw:brd <需求名>        # 业务需求
/wpw:prd <需求名>        # 产品需求
/wpw:explore <需求名>    # 技术探索（可跳过）
/wpw:design <需求名>     # 技术设计
/wpw:plan <需求名>       # 开发计划
/wpw:test <需求名>       # 测试方案
/wpw:apply <需求名>      # 编码实施
```

## 六阶段流程

```
BRD → PRD → Explore(可选) → Design → Plan → Test → Apply
业务   产品   探索        设计     计划   验证   实施
```

- **强依赖**：前置阶段必须 `done` 才能进入下一阶段
- **弱依赖**：Design 弱依赖 Explore（有则读，可跳过）
- **拍板**：Explore 落盘后用户拍板（`wpw decision`）才能进入 Design

## CLI 命令

| 命令 | 功能 |
|------|------|
| `wpw init [path]` | 初始化项目 |
| `wpw new <name>` | 创建需求（幂等） |
| `wpw list [--json]` | 列出所有需求 |
| `wpw status [name] --json` | 查看状态 |
| `wpw check <phase> -c <name> --json` | 依赖检查 |
| `wpw template <phase> -c <name>` | 取模板路径 |
| `wpw done <phase> -c <name>` | 标记阶段完成 |
| `wpw skip <phase> -c <name>` | 标记阶段跳过（explore） |
| `wpw decision <phase> -c <name> --option <choice>` | 记录拍板 |
| `wpw apply <name> --json` | 实施准备（返回 contextFiles/tasks） |
| `wpw task <name> --mark <id> --state <state>` | 任务标记 |
| `wpw archive <name>` | 归档到 `wpw/archived/YYYY-MM/` |
| `wpw map [--json]` | 扫描项目生成知识图谱骨架 |

## 架构

```
AI 层（Skill + /wpw:xxx）  →  CLI 层（wpw 命令）  →  文件系统（wpw/ + .wpw.yaml）
理解/生成/交互              状态/依赖/路径/模板      工作区
```

详见 `SKILL.md`。

## 配置（workflow.config.yaml）

```yaml
version: '1.0.0'
project:
  name: my-project
  type: frontend-h5        # frontend-h5 | backend-node | fullstack | auto
commands:
  design:
    output: ['Design-Fe.md']   # 覆盖默认模板
```

模板选择优先级：`commands.<cmd>.output` → `project.type` 默认 → 文件嗅探。

## 从 soda 迁移

参见 `MIGRATION.md`，运行 `node scripts/migrate-from-soda.js`。

## License

MIT
