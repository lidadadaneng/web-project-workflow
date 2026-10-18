## 1. 存储层分文件夹改造

- [x] 1.1 `JsonlGraphStore` / `BinaryVectorStore` / `VectorMappingStore` / `JsonMetaStore` 构造函数接受 `<stack>` 段，路径改为 `wpw/knowledge/graph/<stack>/`
- [x] 1.2 新增 `resolveGraphDir(root, stack)` 工具函数，统一图谱目录解析（缺省 stack = `default`）
- [x] 1.3 `meta.json` 新增 `graphName` 与 `scanRoot` 字段，构建时写入
- [x] 1.4 编写存储层分文件夹单元测试（多图谱共存、同名覆盖）

## 2. 构建流程支持 --name / --root

- [x] 2.1 `buildGraph` / `updateGraph` / `rebuildGraph` 接受 `stack` 与 `scanRoot` 参数
- [x] 2.2 项目类型嗅探改为按 `scanRoot`（子目录）而非工作根（`sniffProjectType(scanRoot)`）
- [x] 2.3 模块推断、源码扫描按 `scanRoot` 计算（`parseModules` / `scanSourceFiles` 接受 scanRoot）
- [x] 2.4 构建统计输出仅含当前图谱数据
- [x] 2.5 `--name` 命名格式校验（kebab-case、非空、非保留名 `default` 冲突校验）
- [x] 2.6 编写按子目录构建命名图谱的集成测试（前端子目录 + 后端子目录各建一图谱）

## 3. 命令行参数扩展

- [x] 3.1 `wpw graph build` 新增 `--name <stack>` 与 `--root <subdir>` 参数
- [x] 3.2 `wpw graph update` / `rebuild` 新增 `--graph <stack>` 参数；update 从 meta 读取 scanRoot
- [x] 3.3 `wpw graph stat` / `query` / `search` / `context` 新增 `--graph <stack>` 参数（缺省 default）
- [x] 3.4 `--graph` 指向不存在的图谱时报错并提示 `wpw graph list`（退出码非 0）
- [x] 3.5 编写命令参数解析单元测试

## 4. graph list 与 graph remove 命令

- [x] 4.1 新增 `wpw graph list` 子命令：枚举 `wpw/knowledge/graph/` 下含 `meta.json` 的子文件夹
- [x] 4.2 `graph list` 输出表格（图谱名、节点数、边数、builtAt、scanRoot）+ `--json` 输出
- [x] 4.3 无图谱时输出"暂无图谱"提示
- [x] 4.4 新增 `wpw graph remove <stack>` 子命令：删除指定图谱子文件夹
- [x] 4.5 `graph remove` 删除不存在的图谱时报错
- [x] 4.6 编写 list / remove 单元测试

## 5. 单图谱向后兼容迁移

- [x] 5.1 检测旧式直写图谱（`wpw/knowledge/graph/graph.jsonl` 存在且无 `default/` 子文件夹）
- [x] 5.2 迁移逻辑：创建 `default/`，移动旧文件到 `default/`
- [x] 5.3 `default/` 已存在时不执行迁移（不覆盖）
- [x] 5.4 迁移前后输出文件清单供核对
- [x] 5.5 迁移在首次 graph 命令执行时自动触发（或在 `wpw graph list` / `build` 时检测）
- [x] 5.6 编写迁移单元测试（旧式 -> default、已存在 default 不迁移、迁移失败回滚）

## 6. update 从 meta 复用 scanRoot

- [x] 6.1 `graph update --graph <stack>` 从 `meta.json` 读取 `scanRoot`
- [x] 6.2 meta 缺 `scanRoot`（旧图谱）时提示 rebuild 重建补全元数据
- [x] 6.3 编写 update 复用 scanRoot 单元测试

## 7. AI 层编排支持（CLI 原语就绪）

- [x] 7.1 确认 CLI 原语就绪：`graph build --name --root`、`graph list`、`--graph` 检索（供 `/wpw:map` AI 层调用）
- [x] 7.2 （AI 层，可选/另开）`/wpw:map` 命令编排多图谱构建与检索（本 change 仅保证 CLI 原语，AI 层实现另计）
- [x] 7.3 README 文档更新多图谱使用示例（多次 build 命名图谱、--graph 检索、graph list）

## 8. 端到端验证

- [x] 8.1 在 vue+springboot 示例项目上：`graph build --name frontend-vue --root frontend` + `graph build --name backend-springboot --root backend`
- [x] 8.2 `graph list` 确认两图谱共存且统计独立
- [x] 8.3 `graph context --graph frontend-vue` 与 `--graph backend-springboot` 各自只返回对应端节点
- [x] 8.4 现有单图谱项目无 `--name` 升级后仍正常工作（迁移到 default，行为不变）
- [x] 8.5 `__verify__.ts` 综合验证脚本新增多图谱阶段验证
