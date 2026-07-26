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
| `wpw graph build` | 全量构建知识图谱 |
| `wpw graph update` | 增量更新知识图谱 |
| `wpw graph rebuild` | 强制重建知识图谱 |
| `wpw graph stat` | 查看图谱统计 |
| `wpw graph query [options]` | 结构化查询（节点/依赖/路径） |
| `wpw graph search <query>` | 语义检索图谱节点 |
| `wpw graph context [query]` | 端到端上下文生成（直接喂给 LLM） |

## 知识图谱子系统

四层图谱模型，零手动配置，纯本地运行：

```
L1 业务需求 → L2 业务模块 → L3 文件 → L4 代码元素
```

**核心特性**：
- 五层混合映射：文档提取 → 语义匹配 → Git 历史 → 命名匹配 → 可选 AI 校准
- 加权双向 BFS 子图裁剪，支持节点上限与 Token 预算约束
- 三档压缩（loose / standard / extreme），层级符号化序列化输出
- 端到端 context pipeline：检索 → 裁剪 → 骨架抽取 → 序列化
- 纯 JSONL + 二进制向量索引，零数据库依赖

**快速使用**：

```bash
# 构建图谱
wpw graph build

# 查看统计
wpw graph stat

# 生成上下文（直接喂给 LLM）
wpw graph context "用户登录认证"

# 指定 Token 预算
wpw graph context "登录" --token-budget 8000

# JSON 输出（供上层 AI 层调用）
wpw graph context "登录" --json
```

详见 `src/graph/` 源码。

## 架构

```
AI 层（Skill + /wpw:xxx）  →  CLI 层（wpw 命令）  →  文件系统（wpw/ + .wpw.yaml）
理解/生成/交互              状态/依赖/路径/模板      工作区
```

详见 `ai-layer/skills/wpw-workflow/SKILL.md`。

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

## 本地开发

### 编译与全局链接

```bash
# 编译 TypeScript 到 dist/
npm run build

# 编译并链接到全局（开发时使用本地版本）
npm run dev:link

# 验证
wpw --version
```

### 测试知识图谱

```bash
# 1. 构建图谱
wpw graph build

# 2. 查看统计
wpw graph stat

# 3. 结构化查询
wpw graph query --level L2
wpw graph query --downstream <moduleId> --depth 2

# 4. 上下文生成（核心功能）
# 4.1 直接指定锚点
wpw graph context --anchors <moduleId> --compression standard

# 4.2 三档压缩对比
wpw graph context --anchors <moduleId> --compression loose
wpw graph context --anchors <moduleId> --compression standard
wpw graph context --anchors <moduleId> --compression extreme

# 4.3 Token 预算约束
wpw graph context --anchors <moduleId> --token-budget 500

# 5. 语义检索（首次运行会下载 embedding 模型，约 80MB）
wpw graph search "命令注册" --limit 5

# 6. 端到端上下文（语义检索 + 子图裁剪 + 压缩）
wpw graph context "CLI 命令注册" --token-budget 2000

# 7. JSON 输出（供程序调用）
wpw graph stat --json
wpw graph query --level L3 --json
wpw graph context "登录" --json
```

### 综合验证脚本

```bash
# 运行覆盖所有模块的端到端验证
npx ts-node src/graph/__verify__.ts
```

输出 12 个阶段，全部 ✅ 通过即为正常。

## License

MIT
