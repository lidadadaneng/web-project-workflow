# Tasks: wpw-console-viz 一期（纯前端）

## 1. 工程脚手架
- [x] 1.1 创建 `viz/` 子工程（Vite + Vue3 + TS），安装 element-plus、echarts、vue-router
- [x] 1.2 配置 `vite.config.ts`（别名 `@`、`/mock` 静态目录、dev 端口 5173）
- [x] 1.3 根 `.gitignore` 增加 `viz/node_modules`、`viz/dist`
- [x] 1.4 实现布局骨架：侧边栏（总览 / 过程 / 知识 / 洞察分组）+ 顶栏（对话、API 配置入口）+ 路由出口

## 2. API fetcher 层与 mock 契约
- [x] 2.1 实现 `src/api/` fetcher 层：`getChanges / getChangeDetail / getGraph / getGraphStat / getContextDemo / getSpecs / getArchived / getTokenStats / getChatReply`，一期统一从 `/mock/*.json` 读取，预留 baseURL 切换
- [x] 2.2 生成真实数据 fixture：在本仓库执行 `wpw list --json`、`wpw graph stat --json`、`wpw graph query --json`、`wpw graph context --json`（三档压缩各一），整理为 `mock/*.json`
- [x] 2.3 手写 `mock/token-stats.json`（按需求/阶段/时间三维）与 `mock/chat.json`（plain / augmented 应答对）

## 3. 页面实现（过程组）
- [x] 3.1 总览 Dashboard：需求数、阶段完成度、图谱规模、Token 概览卡片
- [x] 3.2 工作流看板：需求列表 + 六阶段 DAG 状态视图（pending/done/skipped 着色，强/弱依赖线型区分）
- [x] 3.3 需求详情抽屉：Plan 任务进度、Explore 拍板记录、Test 缺失风险提示
- [x] 3.4 归档中心：按 YYYY-MM 时间轴浏览，归档需求阶段制品 Markdown 渲染

## 4. 页面实现（知识组）
- [x] 4.1 图谱可视化：ECharts force 图，C-L1-L2-L3 四色，边类型区分，business_map 高亮开关
- [x] 4.2 图谱控制栏：层级/边类型过滤、搜索定位、节点上限控件；右侧节点详情抽屉（GraphNode 属性表）
- [x] 4.3 图谱统计：节点/边按层级与类型分布图、多源证据权重分布、映射覆盖率
- [x] 4.4 上下文演示页：输入区（任务 + Token 预算）→ 锚点列表 + BFS 扩展子图 → 三档压缩并排对比（节点数 / Token 估算 / 序列化预览 + 复制）
- [x] 4.5 知识库：能力 Spec 列表 + Markdown 渲染 + 图谱构建产物元信息

## 5. 页面实现（洞察与交互组）
- [x] 5.1 Token 统计页：按需求 / 阶段 / 时间三维切换图表，输入/输出 Token 区分
- [x] 5.2 API 配置页：base_url / apikey / model 表单、连接测试按钮（mock 反馈）、apikey 脱敏显示、localStorage 持久化
- [x] 5.3 对话页：消息流 UI、mock 流式输出（30-50ms/字切片）、「注入项目上下文」开关与注入标记、「Mock 模式」水印
- [x] 5.4 对话页双栏对比模式：左纯模型 / 右图谱增强，同一提问并排展示

## 6. 收尾
- [x] 6.1 全部 10 页走查：导航无死链、交互符合 specs/console-viz/spec.md 场景
- [x] 6.2 `openspec validate wpw-console-viz` 通过
- [x] 6.3 导出关键页面截图备用（论文第 5 章素材）
