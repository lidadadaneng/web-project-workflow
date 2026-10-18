# Proposal: wpw-console-viz

## Why

wpw 目前只有 CLI 交互，工作流状态、知识图谱、上下文生成等核心能力对用户不可见，既不利于日常使用，也不利于直观展示系统实现效果。需要一个本地可视化控制台，启动时自动打开浏览器展示；同时为控制台配置大模型 API 后可直接对话（可注入图谱上下文），形成上下文工程方法的端到端可交互演示。

## What Changes

分期实施，**按前后端分期而非按功能分期**：

**一期（纯前端，本 change 范围）**：
- 新增 `viz/` 独立前端子工程（Vue3 + Element Plus + ECharts），不污染 CLI 依赖树
- 实现 10 个页面的完整 UI 与交互，全部消费 mock 数据：
  1. 总览 Dashboard
  2. 工作流看板（六阶段 DAG 状态视图 + Plan 任务进度）
  3. 图谱可视化（C-L1-L2-L3 力导向图、business_map 高亮、节点详情）
  4. 图谱统计（节点/边分布、多源证据权重、映射覆盖率）
  5. 上下文生成演示（锚点→BFS 扩展→三档压缩对比→Token 预算）
  6. 知识库展示（能力 Spec 列表 + Markdown 渲染）
  7. 归档中心（按 YYYY-MM 时间轴浏览归档需求及制品）
  8. Token 消耗统计（按需求/阶段/时间维度图表）
  9. 大模型 API 配置（base_url/apikey/model，连接测试）
  10. 对话页（mock 流式输出、"注入项目上下文"开关、双栏对比布局）
- mock 数据采用**契约优先**策略：`src/api/` fetcher 层统一入口，mock JSON 结构即未来二期 `/api/*` 响应结构；优先用本仓库真实 CLI 输出（`wpw list --json`、`wpw graph stat --json` 等）生成 fixture
- 对话与 API 配置作为顶栏全局入口，其余页面按「过程 / 知识 / 资产 / 洞察」分组放侧边栏

**二期（不在本 change 范围，仅记录方向）**：
- 新增 `wpw viz` 命令：Node 本地 HTTP 服务，serve `viz/dist` 构建产物，启动后自动打开浏览器
- `/api/*` 路由直接读取 `wpw/` 工作区文件与图谱 JSONL；LLM 对话由后端代理转发（SSE 流式）
- Token 消耗落盘统计（对话 API usage + 工作流阶段上报）

## Capabilities

### New Capabilities
- `console-viz`: wpw 本地可视化控制台的前端展示能力——以 Web 页面呈现工作流状态、知识图谱、上下文生成过程、知识库与归档资产，并提供大模型 API 配置与对话交互界面。一期为纯前端 + mock 数据，后端服务在后续 change 中实现。

### Modified Capabilities
（无——一期不改动 CLI 任何现有行为）

## Impact

- **新增**：`viz/` 目录（独立 package.json，Vite 构建）
- **不影响**：`src/` CLI 源码、`package.json` 依赖与 `files` 字段（viz 不进入 npm 发布包，二期再决定）
- **数据契约**：`viz/mock/*.json` 即二期 API 的响应契约
- **演示价值**：图谱可视化、上下文演示、对话（图谱增强对比）三页可直接产出系统截图与演示素材
