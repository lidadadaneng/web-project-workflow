## Context

当前图谱存储为单图谱单目录模型（`wpw/knowledge/graph/` 直写文件），无法支撑多技术栈全栈项目。本 change 引入多图谱存储模型：按技术栈分文件夹维护独立图谱，`graph build` 可按子目录多次执行，检索时由 AI 决定启动哪个图谱。wpw 提供多图谱工具原语，技术栈判断与图谱选择由 AI 层（`/wpw:map`）决定，遵循三层分离。

见 proposal.md 的 Why / What Changes。本 change 是 `expand-graph-backend-java` 的前置依赖--Java 图谱需存入独立命名文件夹，与 vue 图谱并列。

## Goals / Non-Goals

**Goals:**
- 存储布局改为 `wpw/knowledge/graph/<stack>/` 分文件夹
- `graph build` 支持 `--name <stack>` 与 `--root <subdir>`，多次执行产出多图谱，每次按子目录独立嗅探项目类型
- 所有检索/统计命令支持 `--graph <stack>` 指定图谱
- `graph list` 列举命名图谱
- 现有单图谱向后兼容迁移到 `default/`
- 不破坏现有单图谱项目的工作流（无 `--name` 即默认图谱）

**Non-Goals:**
- 不实现跨图谱联合查询（首版每个查询指向单一图谱；AI 层可多次查询聚合）
- 不实现图谱间引用/依赖边（图谱相互独立）
- 不实现 `/wpw:map` AI 编排逻辑（AI 层职责，本 change 只提供 CLI 原语）
- 不修改图谱内部数据模型（C/L1/L2/L3、节点/边类型不变）
- 不实现图谱版本管理（多版本快照）
- 不自动嗅探应建几个图谱（由 AI 层判断技术栈并发起 build）

## Decisions

### 决策 1：存储布局为 `<stack>/` 子文件夹

**决定：** 每个命名图谱存储在 `wpw/knowledge/graph/<stack>/` 子文件夹下，含完整的 `graph.jsonl` / `vectors.bin` / `mapping.json` / `meta.json`。多图谱并列共存。

```
wpw/knowledge/graph/
├── default/              ← 向后兼容默认图谱
│   ├── graph.jsonl
│   ├── vectors.bin
│   ├── mapping.json
│   └── meta.json
├── frontend-vue/         ← AI 命名的前端图谱
│   └── ...
└── backend-springboot/   ← AI 命名的后端图谱
    └── ...
```

**理由：** 文件夹隔离简单直观、人类可读、易调试；复用现有 store 类，仅路径加 `<stack>` 段；无并发写冲突（不同图谱不同文件夹）。

**备选方案：** 单目录多文件前缀（`graph-<stack>.jsonl`）。文件多、混乱、store 改动大，否决。

### 决策 2：图谱命名由 AI 层决定，CLI 不校验语义

**决定：** `--name <stack>` 的值由 AI 层（`/wpw:map`）根据技术栈判断给出（如 `frontend-vue`、`backend-springboot`）。CLI 仅校验命名格式（kebab-case、非空、不与保留名 `default` 冲突），不判断命名是否"正确"对应技术栈。

**理由：** 遵循三层分离--技术栈判断是理解层职责（AI），CLI 只提供工具；CLI 无法也不该判断"这个子目录是 vue 还是 react"。

**备选方案：** CLI 自动按子目录内容推断图谱名。违背三层分离，否决。

### 决策 3：`--root <subdir>` 设定扫描根，按子目录独立嗅探项目类型

**决定：** `graph build --name <stack> --root <subdir>` 将 `<subdir>`（相对工作根）作为扫描根与项目类型嗅探根。每次 build 独立嗅探 `<subdir>` 的项目类型（frontend-h5 / backend-java / ...），据此推断模块。无 `--root` 时扫描工作根。

**理由：** 多技术栈项目里前端与后端在不同子目录，各自嗅探才能得到正确的项目类型与模块推断（前端 moduleRoots vs Spring Boot 业务包）。这也意味着 `expand-graph-backend-java` 不需要 fullstack 合并检测--每个图谱单栈，嗅探单栈即可。

**备选方案：** 始终嗅探工作根，用 `--languages` 过滤。无法区分前端/后端模块推断策略，否决。

### 决策 4：图谱注册靠枚举子文件夹，无独立 registry.json

**决定：** `graph list` 通过枚举 `wpw/knowledge/graph/` 下含 `meta.json` 的子文件夹列举图谱，从各 `meta.json` 读取统计信息。不维护独立的 `registry.json`。

**理由：** 子文件夹即图谱，枚举即注册表，避免注册表与实际文件夹不一致的同步问题；`meta.json` 已含 schemaVersion / builtAt / totalNodes 等统计。

**备选方案：** 维护 `registry.json` 索引。需处理与文件夹的同步（删除文件夹忘了更新注册表等），首版不需要，否决。

### 决策 5：默认图谱 `default` 向后兼容

**决定：** 无 `--name` 的 `graph build` 写入 `default` 图谱；检索命令无 `--graph` 时操作 `default`。首次升级时，若 `wpw/knowledge/graph/` 下存在旧的单图谱文件（直接在 graph/ 下的 graph.jsonl 等），迁移到 `default/` 子文件夹。

**理由：** 现有单图谱项目无感升级；默认行为不变；多图谱是显式 opt-in（传 `--name`）。

**备选方案：** 强制要求 `--name`。破坏向后兼容，否决。

### 决策 6：检索命令 `--graph <stack>` 契约统一

**决定：** `graph stat` / `query` / `search` / `context` / `update` / `rebuild` 统一接受 `--graph <stack>` 参数指定操作图谱；缺省为 `default`。`--graph` 由 `multi-graph-management` 能力定义契约，各检索能力引用。

**理由：** 统一契约降低学习成本；缺省 default 保证向后兼容。

**备选方案：** 各命令各自定义参数名。不一致、难用，否决。

### 决策 7：首版不支持跨图谱联合查询

**决定：** 每个 `query` / `search` / `context` 指向单一图谱，不跨图谱联合检索。跨端上下文由 AI 层（`/wpw:map`）发起多次单图谱查询并自行聚合。

**理由：** 跨图谱联合检索涉及向量空间不一致（不同图谱独立 embedding）、子图裁剪跨图谱边不存在等复杂问题，首版不做；AI 层聚合更灵活，符合三层分离。

**备选方案：** 支持多图谱联合 context。复杂度高、价值待验证，列未来工作。

## Risks / Trade-offs

### 风险 1：迁移破坏现有图谱
[风险] 升级时迁移 `wpw/knowledge/graph/` 下旧文件到 `default/` 出错，导致现有图谱丢失 -> **缓解措施**：迁移前检测 `default/` 是否已存在；迁移是纯文件移动，失败可回滚；迁移前后输出文件清单供核对。

### 风险 2：图谱命名冲突
[风险] AI 层重复用同一 `--name` 构建不同技术栈，覆盖已有图谱 -> **缓解措施**：`graph build --name <stack>` 默认覆盖同名图谱（幂等重建）；构建前提示将覆盖；`graph list` 让 AI 层先查已有图谱名。

### 风险 3：向量空间不一致
[风险] 不同图谱独立 embedding，向量空间可能不一致（若模型/配置不同），跨图谱相似度比较无意义 -> **缓解措施**：首版不支持跨图谱查询（决策 7）；建议同项目多图谱用相同 embedding 配置。

### 风险 4：--root 子目录嗅探误判
[风险] 子目录边界不清（如 monorepo 前端在 `frontend/src`，`--root frontend` 嗅探到无 package.json 而误判）-> **缓解措施**：嗅探逻辑兼顾子目录与父目录特征；AI 层选择 `--root` 时应指向含项目标识文件（package.json / pom.xml）的目录。

### 风险 5：增量更新的图谱定位
[风险] `graph update` 需正确定位图谱与 scan root，否则更新错图谱 -> **缓解措施**：`meta.json` 记录该图谱的 scan root 与项目类型；update 时从 meta 读取，无需用户重复传 `--root`。

### 权衡：多图谱隔离 vs 跨端关联
多图谱彻底隔离了前后端，跨端关联（如前端调用某后端 API）无法在图谱内表达。首版由 AI 层在检索层聚合，牺牲了图谱内的跨端导航能力，换取了存储与检索的简洁性。列未来工作评估是否需要跨图谱引用边。

### 权衡：默认图谱 vs 显式命名
默认图谱保证向后兼容但可能让用户停留在单图谱思维。通过 `graph list` 与文档引导用户使用命名图谱。

## Migration Plan

- **存储迁移**：首次运行检测 `wpw/knowledge/graph/graph.jsonl`（旧式直写）存在且无 `default/` 子文件夹时，创建 `default/` 并移动旧文件；迁移输出文件清单
- **向后兼容**：无 `--name` / `--graph` 的命令全部默认 `default`，现有单图谱项目工作流不变
- **Schema 版本**：多图谱是存储层变更，不改变图谱内部 schema（仍 3.x.x）；可在 `meta.json` 加 `graphName` 字段标识图谱名
- **依赖 change**：`expand-graph-backend-java` 依赖本 change；Java 图谱通过 `graph build --name <java-stack> --root <backend-dir>` 构建到独立文件夹

## Open Questions

1. **`meta.json` 是否记录 scan root**：是否在 meta 里存该图谱的 `scanRoot` 与 `projectType`，供 `update` 自动复用？（风险 5，倾向是）
2. **图谱删除命令**：是否需要 `graph remove <stack>` 显式删除命名图谱？（首版可通过文件系统删除，列未来工作）
3. **`graph list` 输出格式**：表格 vs JSON；是否含每图谱的节点/边数、最后构建时间、scan root？（倾向表格 + `--json`）
4. **embedding 配置 per-graph**：是否允许不同图谱用不同 embedding 模型？（风险 3，倾向首版全局配置，列未来工作）
