## 1. 项目骨架与 CLI 框架

- [x] 1.1 初始化 npm 包项目（`package.json` 配 `bin: { wpw }`、TypeScript、commander 依赖、tsconfig）
- [x] 1.2 搭建 `src/` 目录结构（`commands/`、`schema/`、`lib/`、`templates/`、`ai-layer/`）
- [x] 1.3 实现 CLI 入口 `src/index.ts`（commander 注册所有子命令、`--json` 全局选项）

## 2. 内置 Schema 与状态管理

- [x] 2.1 定义 `src/schema/six-phase.ts`（六阶段 artifacts、`dependsOn`/`optionalDeps`、`skippable`、`apply.requires`）
- [x] 2.2 实现 `src/lib/state.ts`（`.wpw.yaml` 读写、status/decisions/progress 字段管理）
- [x] 2.3 实现 `src/lib/config.ts`（`workflow.config.yaml` 读写，已存在则只更新路径字段）
- [x] 2.4 实现 `src/lib/project-type.ts`（嗅探 `package.json`/`pom.xml`/`go.mod`）

## 3. 依赖检查引擎

- [x] 3.1 实现 `src/lib/dependency.ts`（强依赖校验、弱依赖可选、`skippable` 处理、explore 未拍板 warning）
- [x] 3.2 实现 `wpw check <阶段> -c <需求> --json` 命令（输出 `canProceed`/`missing`/`warnings`）

## 4. 模板系统

- [x] 4.1 实现 `src/lib/template-resolver.ts`（`output` 非空 → `project.type` 默认 → 文件嗅探 fallback）
- [x] 4.2 实现 `wpw template <阶段> -c <需求>` 命令（返回模板路径）
- [x] 4.3 编写内置模板 `src/templates/`（BRD、PRD、Explore、Design-{Fe|Server}、Plan-{Fe|Server}、Test-{Fe|Server}，剥离公司特定内容）

## 5. CLI 核心命令实现

- [x] 5.1 实现 `wpw init`（生成 `workflow.config.yaml` + 创建 `wpw/`、`docs/knowledge/` 目录 + 释放 AI 层到 `.claude/`）
- [x] 5.2 实现 `wpw new <需求名>`（创建需求目录 + `.wpw.yaml`，幂等）
- [x] 5.3 实现 `wpw status [需求名] --json`（返回 schemaName/artifacts/decisions/progress）
- [x] 5.4 实现 `wpw done` / `wpw skip` / `wpw decision` 命令（更新 `.wpw.yaml`）
- [x] 5.5 实现 `wpw list [--json]`（列出 `wpw/active/` 所有需求）
- [x] 5.6 实现 `wpw apply <需求> --json`（返回 contextFiles/tasks/progress/state，前置未完成返回 blocked）
- [x] 5.7 实现 `wpw task <需求> --mark <编号> <状态>`（更新 Plan 任务标记 + 同步 progress）
- [x] 5.8 实现 `wpw archive <需求>`（迁移到 `wpw/archived/YYYY-MM/`）
- [x] 5.9 实现 `wpw map [--json]`（扫描项目结构，输出知识图谱骨架供 AI 填语义）

## 6. AI 层 - SKILL.md 与命令文件

- [x] 6.1 重写 `SKILL.md`（三层架构说明 + 三段式契约 + 命令映射表 + 模板规范，移除 scripts 分散执行描述）
- [x] 6.2 编写 `wpw:brd` 命令文件（hybrid 输入：有输入整理/无输入 AskUserQuestion 问答）
- [x] 6.3 编写 `wpw:prd` 命令文件（依赖 BRD，生成产品需求文档）
- [x] 6.4 编写 `wpw:explore` 命令文件（多候选方案 + 对比 + 推荐，不拍板，可跳过）
- [x] 6.5 编写 `wpw:design` 命令文件（弱依赖 explore，校验拍板后进入，按拍板方案深化）
- [x] 6.6 编写 `wpw:plan` 与 `wpw:test` 命令文件
- [x] 6.7 编写 `wpw:apply` 命令文件（逐任务编码 `[ ]→[🔄]→[x]`，支持 `--from` 断点恢复）
- [x] 6.8 编写 `wpw:cr` / `wpw:map` / `wpw:archive` / `wpw:exp` / `wpw:sync` / `wpw:init` 命令文件

## 7. Hooks 机制

- [x] 7.1 迁移 hooks 文件（`before_ard`→`before_prd`、`after_ard`→`after_prd` 等，新增 explore 相关 hook）
- [x] 7.2 编写 `hooks/README.md`（钩子触发时机与用途说明）

## 8. 剥离内网依赖

- [x] 8.1 移除原 SKILL.md 遥测上报段（`<!-- telemetry:start -->` 整段删除）
- [x] 8.2 移除内网 URL（`skillshub.intra.xiaojukeji.com`）与 Cooper 知识库依赖
- [x] 8.3 清理模板与命令文件中所有公司特定内容（内部术语、内部系统引用）

## 9. 测试与验证

- [x] 9.1 CLI 单元测试（`state`/`dependency`/`template-resolver`/`project-type`）
- [x] 9.2 CLI 命令集成测试（`new → check → done → apply` 完整流程）
- [x] 9.3 端到端验证（`wpw init` + 走通六阶段 BRD→PRD→Explore→Design→Plan→Test→Apply）
- [x] 9.4 验证无内网依赖（离线环境执行所有命令正常）

## 10. 迁移与文档

- [x] 10.1 编写 migration 指南（`docs/features/active/` → `wpw/active/`，ARD 文件改名 PRD）
- [x] 10.2 编写 `README.md`（npm 安装、`wpw init`、六阶段使用说明）
- [x] 10.3 编写旧项目迁移脚本（自动迁移目录与文档命名）
