## Why

当前图谱存储是单图谱单目录模型：`wpw/knowledge/graph/` 下直接写 `graph.jsonl` / `vectors.bin` / `mapping.json` / `meta.json`，一次 `wpw graph build` 产出一个图谱，覆盖整个工作根。这在单技术栈项目下工作良好，但无法支撑 vue + springboot 这类多技术栈全栈项目：

- 一个工作根下若同时含前端（.vue/.ts）与后端（.java），单图谱会把两端混在一起，模块推断（moduleRoots vs Spring Boot 业务包）、项目类型嗅探（frontend vs backend-java）互相干扰
- 现实中前后端往往是不同技术栈、不同构建体系、不同演进节奏，强行合并成一张图既不自然也难维护
- AI 辅助开发时，针对前端问题的上下文检索不该被后端节点稀释，反之亦然

需要引入**多图谱存储模型**：按技术栈分文件夹维护独立图谱，`graph build` 可针对子目录多次执行产出多个命名图谱，检索时由 AI 决定启动哪个图谱。wpw 仅提供多图谱工具原语（构建/检索/列举），技术栈判断与图谱选择由 AI 层（`/wpw:map`）决定，遵循三层分离架构。

## What Changes

- 存储布局改为 `wpw/knowledge/graph/<stack>/` 分文件夹，每个命名图谱独立存储（graph.jsonl / vectors.bin / mapping.json / meta.json）
- `graph build` 新增 `--name <stack>` 与 `--root <subdir>` 参数：按子目录构建命名图谱，可多次执行产出多个图谱；每次 build 按子目录独立嗅探项目类型
- `graph update` / `graph rebuild` / `graph stat` / `graph query` / `graph search` / `graph context` 新增 `--graph <stack>` 参数，指定操作哪个图谱
- 新增 `graph list` 命令，列举所有命名图谱及其统计
- 默认图谱向后兼容：无 `--name` 的 build 写入 `default` 图谱；现有单图谱迁移到 `default/` 文件夹
- 不支持跨图谱联合查询（首版）；AI 层可在检索层发起多次单图谱查询并聚合

## Capabilities

### New Capabilities

- `multi-graph-management`: 多图谱存储与寻址能力。负责分文件夹存储布局、命名图谱注册与列举、`--graph` 参数契约、默认图谱与单图谱向后兼容迁移

### Modified Capabilities

- `graph-build`: 新增 `--name` / `--root` 参数，支持按子目录构建命名图谱，多次执行产出多图谱，每次 build 独立嗅探项目类型
- `graph-query`: 新增 `--graph <stack>` 参数指定查询的图谱
- `semantic-search`: 新增 `--graph <stack>` 参数指定语义检索的图谱
- `graph-context`: 新增 `--graph <stack>` 参数指定上下文生成的图谱；AI 层决定检索哪个图谱

## Impact

- `src/graph/storage/graph-store.ts` / `vector-store.ts` / `mapping-store.ts` / `meta-store.ts`：存储路径加 `<stack>` 段，按图谱名路由
- `src/graph/builders/graph-builder.ts`：`buildGraph` / `updateGraph` / `rebuildGraph` 接受 stack 名与 scan root 参数；项目类型嗅探按 scan root 而非工作根
- `src/graph/commands/graph.ts`：所有子命令新增 `--name` / `--root` / `--graph` 参数；新增 `graph list` 子命令
- `src/graph/config.ts`：可能新增默认图谱名配置
- `src/graph/types.ts`：新增图谱注册条目类型（GraphRegistryEntry）
- 迁移逻辑：首次升级时将现有 `wpw/knowledge/graph/*` 单图谱文件迁到 `default/` 子文件夹
- `ai-layer/`：`/wpw:map` AI 命令编排多图谱构建与检索（AI 层，本 change 提供 CLI 原语）
- 依赖：`expand-graph-backend-java` 依赖本 change，Java 图谱存入独立命名文件夹
