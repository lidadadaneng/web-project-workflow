# Design: wpw-console-viz 一期（纯前端）

## Context

见 proposal.md - Why。仓库现状：纯 TypeScript CLI（commander + tree-sitter），无任何前端代码与构建工具链；图谱数据为本地 JSONL + 二进制向量索引；工作流状态在 `wpw/active/<change>/.wpw.yaml`。本 change 只建前端工程，不动 CLI。

## Goals / Non-Goals

**Goals**
- `viz/` 独立前端子工程，10 个页面 UI 与交互完整，可 `npm run dev` 本地预览
- 统一 fetcher 层 + 契约化 mock JSON（mock 结构 = 二期 `/api/*` 响应结构）
- mock fixture 优先由本仓库真实 CLI 输出生成

**Non-Goals**
- 不实现 `wpw viz` CLI 命令、不起本地 HTTP 服务（二期）
- 不实现真实 LLM 调用与真实流式响应（对话页用 mock 流式）
- 不改动 `src/` 任何代码、不改动根 `package.json` 依赖
- Token 统计页一期只画 UI，数据为手写 mock（真实埋点属二期）

## Decisions

### D1: 技术栈 Vue3 + Vite + Element Plus + ECharts
中后台组件现成（表格/表单/菜单/描述列表），10 个页面出活快；ECharts 同时覆盖统计图（柱状/饼图/折线）与力导向图（`series.type: 'graph'`）。
- 备选 AntV G6：图谱交互更强，但其余图表仍需 ECharts，一期图谱页需求（力导向 + 过滤 + 高亮 + 详情）ECharts graph 足够；若二期交互升级可页面级替换为 G6，不动架构。
- 备选 React + AntD：无技术对错，纯熟练度选择，Vue 生态对系统演示与截图场景同等胜任。

### D2: 独立子工程 `viz/`，不纳入 CLI 发布
```
web-project-workflow/
├── viz/
│   ├── package.json        # 独立依赖：vue, element-plus, echarts, vue-router, pinia(可选)
│   ├── vite.config.ts      # dev 端口 5173；二期 build 产物由 CLI serve
│   ├── mock/               # 契约化 mock JSON（= 二期 API 响应）
│   │   ├── changes.json        # wpw list --json 真实输出
│   │   ├── change-detail.json  # wpw status/apply --json 合成
│   │   ├── graph.json          # wpw graph query --json 抽样
│   │   ├── graph-stat.json     # wpw graph stat --json 真实输出
│   │   ├── context-demo.json   # wpw graph context --json 三档压缩各一份
│   │   ├── specs.json          # 能力 Spec 列表 + markdown 内容
│   │   ├── archived.json       # 归档列表 + 制品内容
│   │   ├── token-stats.json    # 手写 mock（真实埋点在二期）
│   │   └── chat.json           # mock 流式应答语料
│   └── src/
│       ├── api/            # fetcher 层：getChanges() 等，一期读 /mock，二期改 baseURL
│       ├── layout/         # 侧边栏 + 顶栏骨架
│       ├── views/          # 10 个页面
│       └── router/
```
根 `package.json` 的 `files` 不含 `viz/`，npm 包体积不受影响；二期再决定是否把 `viz/dist` 打入发布包。

### D3: 布局——侧边栏分组 + 顶栏全局入口
```
┌──────────────────────────────────────────────┐
│  wpw console                  💬对话  ⚙API配置│  ← 顶栏：全局入口
├──────────┬───────────────────────────────────┤
│ 总览      │                                   │
│ ─过程─── │                                   │
│ 工作流看板 │                                   │
│ 归档中心  │            主内容区                │
│ ─知识─── │         （vue-router 出口）        │
│ 图谱可视化 │                                   │
│ 图谱统计  │                                   │
│ 上下文演示 │                                   │
│ 知识库    │                                   │
│ ─洞察─── │                                   │
│ Token统计 │                                   │
└──────────┴───────────────────────────────────┘
```
对话与 API 配置放顶栏：对话需要「注入上下文」开关全局可达，API 配置失败时任何页面都应能一键跳转修复。

### D4: 图谱可视化交互模型（ECharts graph）
- 层级配色：C / L1 / L2 / L3 四色固定；边类型用颜色 + 线型区分（contain 实线灰、import 浅蓝、call 橙、business_map 紫色加粗——这是图谱的核心关系，视觉权重最高）
- 左侧控制栏：层级勾选、边类型勾选、搜索框（命中定位并高亮）、「仅看 business_map」开关
- 右侧详情抽屉：点击节点展示 GraphNode JSON（id/level/type/name/attrs 表格化）
- 规模保护：mock 阶段用抽样子图（~300 节点）；页面预留「节点上限」控件，避免二期接真实全量图谱时卡顿

### D5: 上下文演示页的信息架构
三段式自上而下：
1. 输入区：任务描述输入框 + Token 预算滑块 + 「生成」按钮
2. 过程区：锚点列表（含相关度分数）→ BFS 扩展子图（复用 D4 的小型图组件，高亮扩展路径，对应上下文生成流程）
3. 结果区：loose / standard / extreme 三栏并排，各显示节点数、Token 估算、序列化文本预览（等宽字体 + 复制按钮）

### D6: 对话页 mock 策略
- mock 流式：`chat.json` 存若干问答对，前端按 30-50ms/字 切片吐出，模拟 SSE 体感
- 「注入项目上下文」开关：开启时请求体带 `withContext: true`，mock 返回中带 `contextTokens` 与上下文摘要，消息气泡下方展示注入标记
- 双栏对比：左右两列消息流，同一提问分别取 `chat.json` 中的 `plain` 与 `augmented` 应答
- API 配置页数据存 `localStorage`（一期无后端）；apikey 展示脱敏 `sk-****xxxx`

### D7: mock fixture 的真实数据来源
在本仓库直接执行 CLI 生成 fixture（脚本或手动均可）：
- `wpw list --json` → `mock/changes.json`
- `wpw graph build && wpw graph stat --json` → `mock/graph-stat.json`
- `wpw graph query --level L1 --json` 等抽样合并 → `mock/graph.json`
- `wpw graph context "..." --compression <level> --json` × 3 → `mock/context-demo.json`
这样演示截图即为真实系统数据。

## Risks / Trade-offs

- [ECharts force 图在大节点量下卡顿] → mock 用抽样子图；页面预留节点上限控件；二期必要时单页替换 G6，不返工架构
- [mock 契约与二期真实 API 漂移] → mock 一律从真实 CLI `--json` 输出生成，二手编写的手写字段控制在 token-stats 一处；二期发现漂移时以 CLI 输出为准修 mock
- [`viz/` 依赖膨胀仓库体积] → 独立 package.json，`viz/node_modules` 加入 `.gitignore`，不进根 `files` 字段
- [对话页 mock 做得太真导致误以为已接后端] → 对话页头部加「Mock 模式」水印标签，二期接后端后移除

## Migration Plan

纯新增，无存量迁移。回滚 = 删除 `viz/` 目录与 `openspec/changes/wpw-console-viz/`。

## Open Questions

- 二期 `wpw viz` 的默认端口与自动开浏览器实现（`open` 包 vs `child_process start`），二期 change 再定
- 图谱页若需 G6 级交互（节点展开/收起、子图钻取），二期评估替换
