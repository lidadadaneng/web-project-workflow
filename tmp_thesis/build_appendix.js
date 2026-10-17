// 生成论文附录（原方向），数据直接取自实验数据目录，避免手抄
const fs = require('fs');
const P = 'E:/project/web-project-workflow/论文/关键词召回实验数据_v4/';
const OUT = 'E:/project/web-project-workflow/论文/附录.md';
const B = '\u0060';
const load = f => JSON.parse(fs.readFileSync(P + f, 'utf8'));

const rt = load('retrieval_tasks.json');
const rr = load('retrieval_runs.json');
const qt = load('qa_tasks.json');
const qr = load('qa_runs_autonomous_scored.json');

// 先消掉浮点尾差再按四舍五入取位，避免 0.4825 被写成 0.482
const num = (x, d = 3) => (Math.round((Number(x) + 1e-9) * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const qtl = (a, p) => {
  const s = a.slice().sort((x, y) => x - y);
  const i = p * (s.length - 1), lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const int = n => n.toLocaleString('en-US');
const condName = { non_kg: '非 KG', wpw_map: 'WPW-Map', wpw_gen: 'WPW-Gen', full_wpw: '完整 wpw' };
const CONDS = ['non_kg', 'wpw_map', 'wpw_gen', 'full_wpw'];
const RCONDS = ['non_kg', 'wpw_map', 'full_wpw'];
const CATS = ['精确标识定位', '业务关键词定位', '同义或非代码命名表达', '组合条件定位'];
const QC = ['跨模块调用与数据流', '权限与业务约束', '变更影响分析', '规格与实现核对'];

const ranIds = new Set(qr.map(r => r.task_id));
const runOf = (tid, c) => rr.find(r => r.task_id === tid && r.condition === c);
const qaOf = (tid, c) => qr.find(r => r.task_id === tid && r.condition === c);
const L = [];
const p = s => L.push(s);

p('# 附录');
p('');
p('本附录收录第 6 章三个层面验证的原始记录：系统功能测试、美食推荐系统开发任务、项目场景检索与问答，以及实验环境、快照和冻结参数。正文只报告汇总结果，题集、逐项结果和依据集中放在这里，便于复核。');
p('');
p('需要先行说明两处口径问题，正文与本节按同一份数据核对后如实登记。第一，项目场景问答的题集定义了 100 题（五类各 20 题），实际运行的只有其中四类各 8 题、共 32 题，"现有功能解释"一类未运行，因此附录 D 各表的样本数为 32，正文按 100 计的分母与本节不一致。第二，T1—T3 中 T3 的四个任务与 T4 的四轮连续需求，本机没有留存原始运行记录（执行器 `sdd-eval` 的结果只到 T2-2），相关表格按占位处理，数值待原始记录补齐后回填。');
p('');

/* ---------------- 附录 A ---------------- */
p('## 附录 A 系统功能测试记录');
p('');
p('第 6.2 节的系统功能测试在 2026-08-23 执行，覆盖工作流门禁、图谱构建与查询、上下文生成与预算约束、增量更新与降级行为。测试的通过条件是命令输出、状态转换和持久化结果符合预期，不以单次大模型回答作为判据。表A-1 记录执行环境，表A-2 记录证据的留档状态。');
p('');
p('表A-1 wpw 系统测试环境与执行入口');
p('');
p('Table A-1 Test Environment and Entry Points of the wpw System');
p('');
p('| 项目 | 记录 | 获取方式 |');
p('|---|---|---|');
p('| 执行日期 | 2026-08-23 | 测试执行日期 |');
p('| 操作系统 | Microsoft Windows 11 家庭版中文版 10.0.26200，64 位 | 系统信息 |');
p('| Node.js | v20.20.2 | ' + B + 'node --version' + B + ' |');
p('| wpw 版本 | v0.1.8，提交 ' + B + 'a5ee173' + B + ' | 发布版本与 Git 提交 |');
p('| TypeScript | v5.9.3 | 依赖版本 |');
p('| 图谱 Schema | v3.1.0 | ' + B + 'meta.json' + B + ' 的 ' + B + 'schemaVersion' + B + ' |');
p('| 解析范围 | TypeScript、JavaScript、Vue、Java | 图谱配置 ' + B + 'languages' + B + ' |');
p('| 映射与裁剪配置 | ' + B + 'mapping.mode=local' + B + '；深度 3；最小边权重 0.7；最大节点数 100 | 未设置项目覆盖配置时取默认值 |');
p('| 上下文压缩 | ' + B + 'standard' + B + ' | 显式锚点测试不依赖向量索引 |');
p('| 执行入口 | ' + B + 'npm run build' + B + '、' + B + 'npm test' + B + '、' + B + 'npx ts-node src/graph/__verify__.ts' + B + ' | 终端输出或 CI 日志 |');
p('');
p('表A-2 功能测试项与证据留档状态');
p('');
p('Table A-2 Functional Test Items and Evidence Archival Status');
p('');
p('| 序号 | 测试项 | 实际输出或持久化证据 | 证据留档 |');
p('|---|---|---|---|');
const FTD = [
  ['1', '强依赖门禁', '{"artifact":"prd","canProceed":false,"missing":["brd"],"warnings":[]}；.wpw.yaml 中 PRD 仍为 pending', '待补'],
  ['2', '可选 Explore 决策', 'canProceed=true，missing=[]，warnings 含 1 条 Explore 决策提示；记录决策后该警告消失', '待补'],
  ['3', '图谱存储与索引', '写入并加载 4 个节点、3 条边；nodeMap.size=4，C、L1、L2、L3 各 1 个节点', '待补'],
  ['4', '代码与能力解析', 'Java 用例得到 1 个类节点、至少 2 个方法节点、至少 1 个常量节点及 2 条导入；能力节点含 description 与可选 features', '待补'],
  ['5', '全量构建与结构查询', 'success=true；validation.passed=true；meta.json 含 schemaVersion、节点数、边数和文件哈希快照', '待补'],
  ['6', '上下文生成与预算约束', '返回 1 个锚点、4 个子图节点、3 条边，estimatedTokens=286，小于 1000', '待补'],
  ['7', '增量更新与 Schema 兼容', '修改文件的 fileHash 与对应 L2/L3 节点更新，未修改文件保留；主版本不兼容时输出重建提示，新的 schemaVersion=3.1.0', '待补'],
  ['8', '向量索引缺失降级', '返回含锚点的结构化上下文；未发生状态文件写入失败或流程硬阻塞', '待补'],
];
for (const r of FTD) p('| ' + r.join(' | ') + ' |');
p('');
p('表A-2 的"证据留档"一列目前均为待补：该轮测试的终端输出与 CI 日志未随论文留档，正文第 6.2 节表6-3 记录的是当时的命令输出摘要。若要复核，需要按表A-1 的执行入口在 ' + B + 'a5ee173' + B + ' 版本上重跑。');
p('');

/* ---------------- 附录 B ---------------- */
p('## 附录 B 开发任务运行记录');
p('');
p('第 6.4 节的开发专项把美食推荐系统的连续开发过程划分为 T1 基础搭建、T2 业务核心和 T3 迭代增强三个任务集，另以 T4 的四轮连续需求作长期演化补充。本专项只统计模型总 Token，不计算检索或上下文质量指标。表B-1 列出任务构成，表B-2 与表B-3 给出两种方法的模型总 Token 对照，表B-4 记录逐次运行的元数据。');
p('');
p('表B-1 美食推荐系统开发任务');
p('');
p('Table B-1 Development Tasks for the Food Recommendation System');
p('');
p('| 任务集 | 场景 | 任务数量 | 任务内容 |');
p('|---|---|---:|---|');
p('| T1 | 基础搭建 | 2 | 用户认证、美食分类和美食信息管理 |');
p('| T2 | 业务核心 | 2 | 个性化推荐、购物车和订单流程 |');
p('| T3 | 迭代增强 | 4 | 收藏、评论、美食资讯和个人中心 |');
p('| T4 | 长期演化 | 4 | 会员积分、优惠券、会员等级、配送规则（四轮连续需求） |');
p('');
p('表B-2 T1—T3 开发任务模型总 Token 对照');
p('');
p('Table B-2 Total Model Tokens for T1–T3 Development Tasks');
p('');
p('| 任务 | 方法 | 模型总 Token | wpw 相对变化 | 原始记录 |');
p('|---|---|---:|---:|---|');
const T13 = [
  ['T1-1 用户注册与登录', 'OpenSpec', '7,154,327', '—', 'results/T1-1-openspec-r01-20260905-175358.json'],
  ['T1-1 用户注册与登录', 'wpw', '4,341,714', '-39.31%', 'results/T1-1-wpw-r01-20260905-151814.json'],
  ['T1-2 美食分类和美食信息管理', 'OpenSpec', '11,162,207', '—', 'results/T1-2-openspec-r01-20260905-185750.json'],
  ['T1-2 美食分类和美食信息管理', 'wpw', '≈3,549,700', '-68.20%', 'results/T1-2-wpw-r01-20260905-163226.json（估算口径）'],
  ['T2-1 个性化推荐接口', 'OpenSpec', '5,953,742', '—', 'results/T2-1-openspec-r01-20260905-200235.json'],
  ['T2-1 个性化推荐接口', 'wpw', '4,489,079', '-24.60%', 'results/T2-1-wpw-r01-20260905-182808.json（续跑口径）'],
  ['T2-2 购物车与订单流程', 'OpenSpec', '13,874,175', '—', 'results/T2-2-openspec-r01-20260905-205019.json'],
  ['T2-2 购物车与订单流程', 'wpw', '9,723,130', '-29.92%', 'results/T2-2-wpw-r01-20260905-193859.json（作者订正，记录文件内为 14,723,130）'],
  ['T3-1 收藏', 'OpenSpec', '待补', '待补', '待补（无原始记录）'],
  ['T3-1 收藏', 'wpw', '待补', '待补', '待补（无原始记录）'],
  ['T3-2 评论', 'OpenSpec', '待补', '待补', '待补（无原始记录）'],
  ['T3-2 评论', 'wpw', '待补', '待补', '待补（无原始记录）'],
  ['T3-3 美食资讯', 'OpenSpec', '待补', '待补', '待补（无原始记录）'],
  ['T3-3 美食资讯', 'wpw', '待补', '待补', '待补（无原始记录）'],
  ['T3-4 个人中心', 'OpenSpec', '待补', '待补', '待补（无原始记录）'],
  ['T3-4 个人中心', 'wpw', '待补', '待补', '待补（无原始记录）'],
];
for (const r of T13) p('| ' + r.join(' | ') + ' |');
p('| **T1—T3 合计** | **OpenSpec** | **71,141,143**（含 T3 待补） | — | — |');
p('| **T1—T3 合计** | **wpw** | **42,422,522**（含 T3 待补） | **-40.37%** | — |');
p('');
p('表B-2 的 T1—T2 四个任务共 8 次运行有完整记录，数值取自执行器 ' + B + 'sdd-eval' + B + ' 的结果 JSON，目录为仓库外的 ' + B + 'E:/project/sdd-eval/' + B + '。T3 的四个任务在 ' + B + 'src/tasks.ts' + B + ' 中有任务定义，但没有对应的运行记录，因此 Token 与相对变化留空待补；正文第 6.4.3 节的 T1—T3 合计 71,141,143 与 42,422,522 包含这四个任务，回填前应视为待核。');
p('');
p('表B-3 T4 连续开发任务模型总 Token 对照');
p('');
p('Table B-3 Total Model Tokens for the T4 Continuous Development Task');
p('');
p('| 轮次 | 需求 | OpenSpec 模型总 Token | wpw 模型总 Token | wpw 相对减少 | 原始记录 |');
p('|---|---|---:|---:|---:|---|');
const T4 = ['T4-1 会员积分', 'T4-2 优惠券', 'T4-3 会员等级', 'T4-4 配送规则'];
for (const t of T4) p('| ' + t + ' | 待补 | 待补 | 待补 | 待补 | 待补（无原始记录） |');
p('| **合计** | — | **待补** | **待补** | **待补** | — |');
p('');
p('表B-3 的 T4 四轮同样没有留存原始运行记录，正文第 6.4.3 节的 40,332,312、25,732,630 与 T1—T4 合计 111,473,455、68,155,152 待原始记录补齐后回填。');
p('');
p('表B-4 T1—T2 开发任务逐次运行元数据');
p('');
p('Table B-4 Run Metadata of the T1–T2 Development Tasks');
p('');
p('| 任务 | 方法 | 起始提交 | 状态 | 执行耗时/s | Recall | Precision | 返工次数 | 累计上下文 Token | 搜索/图谱/读取 | 模型标识 |');
p('|---|---|---|---|---:|---:|---:|---:|---:|---|---|');
const DEVROWS = [
  ['T1-1-openspec-r01-20260905-175358.json', 'T1-1 用户注册与登录', 'OpenSpec'],
  ['T1-1-wpw-r01-20260905-151814.json', 'T1-1 用户注册与登录', 'wpw'],
  ['T1-2-openspec-r01-20260905-185750.json', 'T1-2 美食分类和美食信息管理', 'OpenSpec'],
  ['T1-2-wpw-r01-20260905-163226.json', 'T1-2 美食分类和美食信息管理', 'wpw'],
  ['T2-1-openspec-r01-20260905-200235.json', 'T2-1 个性化推荐接口', 'OpenSpec'],
  ['T2-1-wpw-r01-20260905-182808.json', 'T2-1 个性化推荐接口', 'wpw'],
  ['T2-2-openspec-r01-20260905-205019.json', 'T2-2 购物车与订单流程', 'OpenSpec'],
  ['T2-2-wpw-r01-20260905-193859.json', 'T2-2 购物车与订单流程', 'wpw'],
];
const DIR = 'E:/project/sdd-eval/results/';
for (const [f, task, method] of DEVROWS) {
  const j = JSON.parse(fs.readFileSync(DIR + f, 'utf8'));
  const m = j.metrics || {}, md = j.metadata || {};
  const rawModel = (md.model || '').toString();
  const model = !rawModel ? '未记录'
    : rawModel.length > 24 ? '未记录（原记录写为「' + rawModel.slice(0, 22) + '…」）'
      : rawModel;
  p('| ' + [task, method, (md.baselineCommit || '—').slice(0, 8), j.status,
    Math.round((m.taskTimeMs || 0) / 1000),
    m.recall == null ? '—' : num(m.recall, 3), m.precision == null ? '—' : num(m.precision, 3),
    (m.reworkCount ?? '—'), int(m.cumulativeContextTokens || 0),
    [m.searchCount, m.graphQueryCount, m.sourceReadCount].map(x => x ?? '—').join('/'), model].join(' | ') + ' |');
}
for (const t of ['T3-1 收藏', 'T3-2 评论', 'T3-3 美食资讯', 'T3-4 个人中心', 'T4-1 会员积分', 'T4-2 优惠券', 'T4-3 会员等级', 'T4-4 配送规则']) {
  p('| ' + t + ' | OpenSpec / wpw | 待补 | 待补 | 待补 | 待补 | 待补 | 待补 | 待补 | 待补 | 待补 |');
}
p('');
p('表B-4 的三处协议例外如实登记。其一，T1-2 的 wpw 与 T1-1 处于同一对话，模型总 Token 按 T1-1 的精确用量乘以耗时比例与探索事件比例的均值估算，Recall 与 Precision 亦为估算值，因此表B-2 中该格写 ≈3,549,700。其二，T2-1 的 wpw 为续跑运行，当次会话开始前已存在规格与实现，精确 Token 只覆盖续跑阶段。其三，T2-2 的 wpw 起点含 T2-1 未提交的变更，且模型总 Token 采用作者订正值。上述例外在正文第 6.4.3 节与第 6.8 节一并登记。另外，T1-1 与 T1-2 的运行记录里模型标识栏的取值不同（分别为 ' + B + 'gpt-5.6-sol' + B + ' 与 ' + B + 'gpt-5.3-codex-spark' + B + '），实验操作者确认两次运行使用同一模型，表B-4 按原记录照录。');
p('');

/* ---------------- 附录 C ---------------- */
p('## 附录 C 场景检索题集与结果');
p('');
p('第 6.5 节的场景检索子实验包含 100 个信息需求，按四类各 25 题组织。表C-1 给出题集与人工标注的 Gold 文件，表C-2 给出三条件的总体结果，表C-3 按查询类别拆分，表C-4 给出配对检验，表C-5 逐题列出三项指标。');
p('');
p('表C-1 场景检索题集与 Gold 标注');
p('');
p('Table C-1 Retrieval Task Set and Gold Annotation');
p('');
p('| 编号 | 类别 | 问题族 | 信息需求 | 查询文本 | Gold 文件 |');
p('|---|---|---|---|---|---|');
const rSorted = rt.slice().sort((a, b) => a.id.localeCompare(b.id));
for (const t of rSorted) {
  p('| ' + [t.id, t.category, t.family, t.information_need, t.query,
    t.gold_files.map(g => B + g + B).join('<br>')].join(' | ') + ' |');
}
p('');
p('Gold 根据冻结源码、规格和测试证据人工标注，不由任何被测条件返回结果反向定义，判据是文件是否满足查询背后的信息需求而不是是否机械包含查询词。100 题共标注 ' +
  rt.reduce((a, t) => a + t.gold_files.length, 0) + ' 个 Gold 文件，平均每题 ' + num(rt.reduce((a, t) => a + t.gold_files.length, 0) / rt.length, 2) + ' 个。冻结提交为 ' + B + rt[0].commit + B + '。');
p('');
p('表C-2 场景检索总体结果');
p('');
p('Table C-2 Overall Results of Scenario Retrieval');
p('');
p('| 条件 | Recall@5 | Recall@10 | Precision@10 | Recall@10=0 的任务数 | 查询时间中位数/ms |');
p('|---|---:|---:|---:|---:|---:|');
for (const c of RCONDS) {
  const v = rr.filter(r => r.condition === c);
  p('| ' + [condName[c], num(mean(v.map(r => r.recall_at_5))), num(mean(v.map(r => r.recall_at_10))),
    num(mean(v.map(r => r.precision_at_10))), v.filter(r => r.recall_at_10 === 0).length,
    num(qtl(v.map(r => r.elapsed_ms), 0.5), 2)].join(' | ') + ' |');
}
p('');
p('表C-3 不同查询类别的检索结果');
p('');
p('Table C-3 Retrieval Results by Query Category');
p('');
p('| 查询类别 | 条件 | Recall@10 | Precision@10 |');
p('|---|---|---:|---:|');
for (const cat of CATS) {
  for (const c of RCONDS) {
    const v = rr.filter(r => r.condition === c && r.category === cat);
    p('| ' + [cat, condName[c], num(mean(v.map(r => r.recall_at_10))), num(mean(v.map(r => r.precision_at_10)))].join(' | ') + ' |');
  }
}
p('');
p('表C-4 场景检索配对检验');
p('');
p('Table C-4 Paired Tests of Scenario Retrieval');
p('');
p('| 指标 | 查询级 Friedman χ² | p | 问题族聚合 Friedman χ² | p | 完整 wpw vs 非 KG（Holm 校正 p） | 配对秩二列相关 |');
p('|---|---:|---|---:|---|---:|---:|');
p('| Recall@5 | 41.113 | <0.001 | 16.851 | <0.001 | 0.0020 | 0.750 |');
p('| Recall@10 | 46.455 | <0.001 | 19.140 | <0.001 | 0.00050 | 0.842 |');
p('| Precision@10 | 46.455 | <0.001 | 19.271 | <0.001 | 0.00028 | 0.866 |');
p('');
p('检索指标以同一查询下的三个条件为配对观测。问题族聚合后，完整 wpw 相对非 KG 的三项指标均显著更高；完整 wpw 与 WPW-Map 的三项差异均不显著，因此结果支持图谱增强检索相对 BM25 的定位增益，但不支持把该增益进一步归因于 ' + B + 'business_map' + B + '。');
p('');
p('表C-5 逐题检索结果');
p('');
p('Table C-5 Per-Query Retrieval Results');
p('');
p('| 编号 | 类别 | 非 KG R@10 | 非 KG P@10 | WPW-Map R@10 | WPW-Map P@10 | 完整 wpw R@10 | 完整 wpw P@10 |');
p('|---|---|---:|---:|---:|---:|---:|---:|');
for (const t of rSorted) {
  const cells = [t.id, t.category];
  for (const c of RCONDS) {
    const r = runOf(t.id, c);
    cells.push(r ? num(r.recall_at_10, 3) : '待补', r ? num(r.precision_at_10, 3) : '待补');
  }
  p('| ' + cells.join(' | ') + ' |');
}
p('');

/* ---------------- 附录 D ---------------- */
p('## 附录 D 项目场景问答记录');
p('');
p('第 6.6 节的问答子实验在非 KG、WPW-Map、WPW-Gen 和完整 wpw 四种条件下比较盲评通过率与累计上下文 Token。题集定义了 100 题（五类各 20 题），实际运行的只有其中四类各 8 题、共 32 题：表D-1 给出四种条件，表D-2 列出题集的全部定义与实际运行范围，表D-3 与表D-4 给出通过率与上下文规模，表D-5 逐题列出结果。');
p('');
p('表D-1 检索与问答条件');
p('');
p('Table D-1 Retrieval and Question-Answering Conditions');
p('');
p('| 条件 | 代码结构图 | 业务—代码映射 | 上下文组织 | 用途 |');
p('|---|---|---|---|---|');
p('| 非 KG | 关闭 | 关闭 | 非图候选的相关行窗口 | 非图检索基线 |');
p('| WPW-Map | 保留 | 关闭 | 代码图导航与相关行窗口 | 检验代码结构图的作用 |');
p('| WPW-Gen | 保留 | 保留 | 候选文件截断原文，不做结构化行裁剪 | 检验上下文生成管线的作用 |');
p('| 完整 wpw | 保留 | 保留 | 图谱摘要与候选文件相关行窗口 | 完整方法 |');
p('');
p('表D-2 场景问答题集与实际运行范围');
p('');
p('Table D-2 QA Task Set and Actual Run Coverage');
p('');
p('| 编号 | 类别 | 问题族 | 问题 | 是否运行 |');
p('|---|---|---|---|---|');
const qSorted = qt.slice().sort((a, b) => a.id.localeCompare(b.id));
for (const t of qSorted) {
  p('| ' + [t.id, t.category, t.family, t.question.replace(/\|/g, '\\|'), ranIds.has(t.id) ? '已运行' : '未运行'] .join(' | ') + ' |');
}
p('');
p('100 题的类别分布为五类各 20 题。实际运行的是 Q2（跨模块调用与数据流）、Q3（权限与业务约束）、Q4（变更影响分析）、Q5（规格与实现核对）四类的前 8 题，共 32 题；Q1（现有功能解释）整类 20 题未运行。表D-3 至表D-5 的样本数因此为 32 题 × 4 条件 = 128 条运行，而正文第 6.6 节按 100 题报告，两处需在合稿时统一口径。');
p('');
p('表D-3 项目场景问答总体结果');
p('');
p('Table D-3 Overall Results of Project-Scenario Question Answering');
p('');
p('| 条件 | 盲评通过 | 通过率 | 规则通过率 | 累计上下文 Token 中位数 [IQR] | 累计上下文 Token 均值 |');
p('|---|---:|---:|---:|---:|---:|');
for (const c of CONDS) {
  const v = qr.filter(r => r.condition === c);
  const ctx = v.map(r => r.cumulative_context_tokens);
  const blind = v.filter(r => r.judge_pass === true).length;
  const rule = v.filter(r => r.passed === true).length;
  p('| ' + [condName[c], blind + '/' + v.length, num(blind / v.length * 100, 1) + '%',
    num(rule / v.length * 100, 1) + '%',
    int(Math.round(qtl(ctx, 0.5))) + ' [' + int(Math.round(qtl(ctx, 0.25))) + ', ' + int(Math.round(qtl(ctx, 0.75))) + ']',
    int(Math.round(mean(ctx)))].join(' | ') + ' |');
}
p('');
p('表D-3 的样本数为 32。正文第 6.6 节表6-12 写作"84/100""91/100"，对应的是本表 27/32（84.4%）与 29/32（90.6%）按百题换算后的写法；该表的累计上下文 Token 合计（3,903,813、2,711,819、4,234,822、2,520,353）亦为均值乘以 100 的归一化值（如 39,038 × 100 = 3,903,813）。本表报告未归一化的实测值，完整 wpw 相对 WPW-Gen 的累计上下文 Token 降幅为 40.49%，与正文一致。');
p('');
p('表D-4 不同问题类型的问答通过率');
p('');
p('Table D-4 Question-Answering Pass Rates by Question Type');
p('');
p('| 问题类型 | 非 KG | WPW-Map | WPW-Gen | 完整 wpw |');
p('|---|---:|---:|---:|---:|');
for (const cat of QC) {
  const cells = [cat];
  for (const c of CONDS) {
    const v = qr.filter(r => r.condition === c && r.category === cat);
    const blind = v.filter(r => r.judge_pass === true).length;
    cells.push(v.length ? num(blind / v.length * 100, 1) + '%' : '待补');
  }
  p('| ' + cells.join(' | ') + ' |');
}
p('');
p('表D-4 的每一类各 8 题，因此百分比均为 12.5% 的整数倍。类别结果方向并不完全一致，不能据此推断普遍优势。');
p('');
p('表D-5 逐题问答结果');
p('');
p('Table D-5 Per-Question QA Results');
p('');
p('| 编号 | 类别 | 非 KG | WPW-Map | WPW-Gen | 完整 wpw |');
p('|---|---|---|---|---|---|');
const ranSorted = qSorted.filter(t => ranIds.has(t.id));
for (const t of ranSorted) {
  const cells = [t.id, t.category];
  for (const c of CONDS) {
    const r = qaOf(t.id, c);
    cells.push(r ? (r.judge_pass ? '通过' : '未通过') + '（' + int(r.cumulative_context_tokens || 0) + '）' : '待补');
  }
  p('| ' + cells.join(' | ') + ' |');
}
p('');
p('表D-5 每格为盲评结论与该次运行的实际累计上下文 Token（未归一化）。四条件的回答在评分前按固定随机种子打乱并标记为 A—D，评分器不知道条件名称。');
p('');

/* ---------------- 附录 E ---------------- */
p('## 附录 E 实验环境、快照与冻结记录');
p('');
p('表E-1 记录实验载体与规范目录对应的快照，表E-2 记录正式运行前冻结的题集与参数，表E-3 记录两种实验图谱的规模。');
p('');
p('表E-1 源码与规范快照');
p('');
p('Table E-1 Source and Specification Snapshot');
p('');
p('| 项目 | 规模 | 快照标识 |');
p('|---|---|---|');
p('| 源码仓库 | 12 个模块、393 个源文件、1,369 个代码元素（L2/L3 口径） | ' + B + 'afca51b09abd73c619986659a7af34b8d616d9b1' + B + ' |');
p('| 能力规范 | 25 份能力规范（' + B + 'wpw/specs/<能力名>/spec.md' + B + '） | 与源码仓库同一快照 |');
p('| 图谱构建产物 | 完整 wpw：1,799 节点、2,434 条边、1,794 条向量，Schema v3.1.0 | 与源码仓库同一快照 |');
p('| 留档形式 | 压缩包 ' + B + 'snapshot-afca51b09abd.zip' + B + '，各条件从该快照复制独立工作区 | 数据目录 ' + B + '关键词召回实验数据_v4/' + B + ' |');
p('');
p('表E-2 题集与参数冻结记录');
p('');
p('Table E-2 Frozen Question Sets and Parameters');
p('');
p('| 项目 | 内容或取值 | 冻结方式 |');
p('|---|---|---|');
p('| 开发任务与对照方法 | T1—T3 的 8 个配对任务与 T4 的 4 轮连续需求；OpenSpec 与 wpw 两种方法；每种方法每任务运行 1 次 | 见附录 B 表B-1 |');
p('| 场景检索题集 | 100 题，四类各 25 题；每题人工标注 Gold；非 KG、WPW-Map、完整 wpw 三条件，共 300 次执行 | 见附录 C 表C-1 |');
p('| 场景问答题集 | 定义 100 题（五类各 20 题），实际运行 32 题（四类各 8 题）；非 KG、WPW-Map、WPW-Gen、完整 wpw 四条件 | 见附录 D 表D-2 |');
p('| 评分规则 | 盲评通过条件要求主要机制覆盖度达标、关键结论至少有一条源码证据支持、无重大事实错误；规则通过率仅作敏感性对照 | 评分材料含必答事实、支撑证据、可接受替代证据与重大错误定义 |');
p('| 检索参数 | 语义检索相似度阈值 0.6；每查询锚点上限 5；子图扩展深度 2；节点上限 200；扩展最小边权重 0.7 | 图谱默认配置与运行参数 |');
p('| 上下文预算 | 压缩档位 ' + B + 'standard' + B + '；问答阶段四条件使用同一模型、同一只读快照、同一回答格式与相同只读工具预算 | 运行前冻结 |');
p('');
p('所有题目、Gold、评分规则、检索参数、上下文预算和代码快照在正式执行前冻结，试运行只用于检查事件采集和评分流程，不进入正式统计。');
p('');
p('表E-3 实验图谱规模对照');
p('');
p('Table E-3 Comparison of Experimental Graph Sizes');
p('');
p('| 图谱 | C 层能力节点 | L1 | L2 | L3 | 总边数 | business_map 边 | 向量数 | 构建结果 |');
p('|---|---:|---:|---:|---:|---:|---:|---:|---|');
p('| WPW-Map | 0 | 12 | 393 | 1,369 | 2,134 | 0 | 1,769 | 通过校验 |');
p('| 完整 wpw | 25 | 12 | 393 | 1,369 | 2,434 | 300 | 1,794 | 通过校验 |');
p('');
p('两张图均构建自表E-1 的冻结快照，使用相同的代码结构层，完整 wpw 额外增加 Capability 节点及 business_map 边，用于检验业务语义映射的增量作用。');
p('');

fs.writeFileSync(OUT, L.join('\n'), 'utf8');
console.log('written', OUT, L.length, 'lines');