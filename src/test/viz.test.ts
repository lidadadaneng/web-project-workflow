/**
 * viz 后端（真实交互）测试。
 *
 * 覆盖三块与 mock 脱钩时最易出错的地方：
 *   1. 事件日志与快照回退（历史回溯的数据来源）
 *   2. Plan 任务解析/勾选（从 apply.ts / task.ts 抽取后的等价性）
 *   3. /api 路由 happy path —— 用临时工作区 + 真实 HTTP 请求跑通「新建需求 → 阶段 →
 *      写制品 → 拍板 → 勾任务 → 回退」整条写链路，并校验服务端做的契约适配
 *      （createdAt ISO→ms、deriveApply、evidenceSources / coverage 现算）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  appendEvent,
  getEventsPath,
  makeEvent,
  readEvents,
  snapshotOf,
} from '../lib/events';
import {
  getDocFileName,
  markTaskInPlan,
  parsePlanTasks,
  summarizeTasks,
} from '../lib/artifact';
import {
  getChangeDir,
  initState,
  restoreSnapshot,
  saveState,
  setStatus,
  loadState,
} from '../lib/state';
import { appendUsage, aggregateUsage, readUsage } from '../viz/llm';
import { computeGraphStat } from '../viz/store';
import { startVizServer, type VizServerHandle } from '../viz/server';

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-viz-'));
}

// ==================== 1. 事件日志 ====================

test('appendEvent / readEvents：按时间升序返回，损坏行跳过', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'ch');
  fs.mkdirSync(dir, { recursive: true });

  appendEvent(dir, { ...makeEvent('create', '第一条'), ts: 200 });
  appendEvent(dir, { ...makeEvent('phase', '第二条'), ts: 100 });

  // 手工塞一行坏数据，模拟日志被编辑坏掉
  fs.appendFileSync(getEventsPath(dir), '{ 这不是 JSON\n', 'utf8');
  fs.appendFileSync(getEventsPath(dir), '\n', 'utf8');

  const events = readEvents(dir);
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => e.label),
    ['第二条', '第一条'],
  );
});

test('readEvents：日志不存在时返回空数组', () => {
  assert.deepEqual(readEvents(path.join(tmpRoot(), 'nope')), []);
});

test('setStatus 追加 phase 事件并携带前后快照', () => {
  const root = tmpRoot();
  saveState(root, initState('login'));
  setStatus(root, 'login', 'brd', 'done');

  const events = readEvents(getChangeDir(root, 'login'));
  const phaseEvent = events.find((e) => e.type === 'phase');
  assert.ok(phaseEvent, '应有一条 phase 事件');
  assert.equal(phaseEvent!.before!.status.brd, 'pending');
  assert.equal(phaseEvent!.after!.status.brd, 'done');
});

test('restoreSnapshot 还原状态并追加 rollback 事件', () => {
  const root = tmpRoot();
  const state = initState('login');
  saveState(root, state);
  const snapshot = snapshotOf(state);

  setStatus(root, 'login', 'brd', 'done');
  setStatus(root, 'login', 'prd', 'done');
  assert.equal(loadState(root, 'login')!.status.prd, 'done');

  const restored = restoreSnapshot(root, 'login', snapshot, '回到起点');
  assert.equal(restored.status.brd, 'pending');
  assert.equal(restored.status.prd, 'pending');
  // 落盘同样生效
  assert.equal(loadState(root, 'login')!.status.brd, 'pending');

  const events = readEvents(getChangeDir(root, 'login'));
  assert.equal(events[events.length - 1].type, 'rollback');
  assert.equal(events[events.length - 1].label, '回到起点');
});

// ==================== 2. Plan 任务解析 ====================

const PLAN_MD = [
  '# 开发计划',
  '',
  '- [x] 1. 建表',
  '- [ ] 2. 写接口',
  '- [🔄] 3. 联调',
  '- 这不是任务行',
].join('\n');

test('parsePlanTasks 识别三种标记并剥离序号', () => {
  const root = tmpRoot();
  const p = path.join(root, 'Plan-x.md');
  fs.writeFileSync(p, PLAN_MD, 'utf8');

  const tasks = parsePlanTasks(p);
  assert.equal(tasks.length, 3);
  assert.deepEqual(
    tasks.map((t) => [t.id, t.text, t.state]),
    [
      ['1', '建表', 'done'],
      ['2', '写接口', 'pending'],
      ['3', '联调', 'in-progress'],
    ],
  );
  assert.deepEqual(summarizeTasks(tasks), { total: 3, completed: 1, inProgress: 1 });
});

test('parsePlanTasks 对不存在的文件返回空数组', () => {
  assert.deepEqual(parsePlanTasks(path.join(tmpRoot(), 'none.md')), []);
});

test('markTaskInPlan 只改目标行的标记，其余原样保留', () => {
  const root = tmpRoot();
  const p = path.join(root, 'Plan-x.md');
  fs.writeFileSync(p, PLAN_MD, 'utf8');

  const result = markTaskInPlan(p, '2', 'done');
  assert.deepEqual(
    { total: result.total, completed: result.completed, inProgress: result.inProgress },
    { total: 3, completed: 2, inProgress: 1 },
  );

  const lines = result.content.split('\n');
  assert.equal(lines[2], '- [x] 1. 建表'); // 未动
  assert.equal(lines[3], '- [x] 2. 写接口'); // 被勾选
  assert.equal(lines[4], '- [🔄] 3. 联调'); // 未动
  assert.equal(lines[5], '- 这不是任务行'); // 非任务行原样保留
});

test('markTaskInPlan 支持回退为 pending / in-progress', () => {
  const root = tmpRoot();
  const p = path.join(root, 'Plan-x.md');
  fs.writeFileSync(p, PLAN_MD, 'utf8');

  const back = markTaskInPlan(p, '1', 'pending');
  assert.equal(back.content.split('\n')[2], '- [ ] 1. 建表');

  const doing = markTaskInPlan(p, '1', 'in-progress');
  assert.equal(doing.content.split('\n')[2], '- [🔄] 1. 建表');
  assert.equal(doing.inProgress, 2);
});

// ==================== 3. /api 路由 happy path ====================

/** 造一张最小图谱：C 能力 → L1 模块 的 business_map + 一条 structure 的 contain */
function seedGraph(root: string): void {
  const dir = path.join(root, 'wpw', 'knowledge', 'graph', 'default');
  fs.mkdirSync(dir, { recursive: true });

  const lines = [
    { _kind: 'node', id: 'cap:cart', level: 'C', type: 'capability', name: '购物车' },
    { _kind: 'node', id: 'cap:order', level: 'C', type: 'capability', name: '订单' },
    { _kind: 'node', id: 'mod:store', level: 'L1', type: 'module', name: 'store' },
    { _kind: 'node', id: 'mod:other', level: 'L1', type: 'module', name: 'other' },
    { _kind: 'node', id: 'file:cart.ts', level: 'L3', type: 'file', name: 'cart.ts' },
    {
      _kind: 'edge', id: 'e1', from: 'mod:store', to: 'file:cart.ts',
      type: 'contain', weight: 1, source: 'structure',
    },
    {
      _kind: 'edge', id: 'e2', from: 'cap:cart', to: 'mod:store',
      type: 'business_map', weight: 0.6, source: 'semantic',
    },
  ];
  fs.writeFileSync(
    path.join(dir, 'graph.jsonl'),
    lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
    'utf8',
  );
  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      builtAt: 1700000000000,
      totalNodes: 5,
      totalEdges: 2,
      totalVectors: 3,
      fileHashes: {},
      configVersion: 'cfg-1',
      graphName: 'default',
      projectType: 'vue',
    }),
    'utf8',
  );
}

async function json(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('computeGraphStat 现算 evidenceSources 与 coverage', () => {
  const root = tmpRoot();
  seedGraph(root);

  const stat = computeGraphStat(root, 'default');
  assert.equal(stat.totalNodes, 5);
  assert.equal(stat.totalEdges, 2);
  assert.deepEqual(stat.nodesByLevel, { C: 2, L1: 2, L3: 1 });
  assert.deepEqual(stat.edgesByType, { contain: 1, business_map: 1 });

  // 边来源分组：structure 先出现且数量相同时按 count 降序，两者 count 都是 1
  const structure = stat.evidenceSources.find((s) => s.source === 'structure')!;
  const semantic = stat.evidenceSources.find((s) => s.source === 'semantic')!;
  assert.equal(structure.count, 1);
  assert.equal(structure.avgWeight, 1);
  assert.equal(semantic.count, 1);
  assert.equal(semantic.avgWeight, 0.6);

  // 只有 cap:cart 有 business_map 出边；模块侧只有 mod:store 被映射
  assert.deepEqual(stat.coverage, {
    mappedCapabilities: 1,
    totalCapabilities: 2,
    mappedModules: 1,
    totalModules: 2,
  });
});

test('图谱不存在时统计不抛错，返回空图', () => {
  const root = tmpRoot();
  const stat = computeGraphStat(root, 'default');
  assert.equal(stat.totalNodes, 0);
  assert.equal(stat.totalEdges, 0);
  assert.deepEqual(stat.evidenceSources, []);
  assert.deepEqual(stat.coverage, {
    mappedCapabilities: 0,
    totalCapabilities: 0,
    mappedModules: 0,
    totalModules: 0,
  });
});

// —— 起一个真实服务，跑通整条写链路 ——

let root: string;
let server: VizServerHandle;
let api: string;

test.before(async () => {
  root = tmpRoot();
  seedGraph(root);
  // port 0 → 系统分配空闲端口
  server = await startVizServer({ root, graph: 'default', port: 0 });
  api = server.url;
});

test.after(async () => {
  await server.close();
});

test('/api/meta 反映真实工作区（空 active / 有图谱）', async () => {
  const { status, body } = await json('GET', `${api}/api/meta`);
  assert.equal(status, 200);
  assert.equal(body.root, path.resolve(root));
  assert.equal(body.graph, 'default');
  assert.equal(body.hasActive, false);
  assert.equal(body.hasSpecs, false);
  assert.equal(body.graphs.length, 1);
  assert.equal(body.graphs[0].name, 'default');
  assert.equal(body.graphs[0].totalNodes, 5);
});

test('空工作区：/api/changes 返回空数组，而不是报错', async () => {
  const { status, body } = await json('GET', `${api}/api/changes`);
  assert.equal(status, 200);
  assert.deepEqual(body, []);
});

test('新建需求 → 阶段推进 → 制品写入 → 拍板 → 勾任务 → 回退（整条写链路）', async () => {
  const name = 'cart-coupon';

  // 1) 新建：等价 wpw new，落真实 .wpw.yaml
  const created = await json('POST', `${api}/api/changes`, { name });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, name);
  assert.equal(created.body.phases.brd, 'pending');
  assert.equal(created.body.phases.apply, 'pending', 'plan 未 done 时 apply 派生为 pending');
  assert.equal(typeof created.body.createdAt, 'number', 'createdAt 已由 ISO 转成毫秒数');
  assert.ok(fs.existsSync(path.join(getChangeDir(root, name), '.wpw.yaml')));
  assert.ok(fs.existsSync(getEventsPath(getChangeDir(root, name))), '新建即写入 create 事件');

  // 2) 重名拒绝
  const dup = await json('POST', `${api}/api/changes`, { name });
  assert.equal(dup.status, 409);

  // 3) 非法名拒绝（服务端复用 validateChangeName）
  const bad = await json('POST', `${api}/api/changes`, { name: 'Bad_Name' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /不合法/);

  // 4) 阶段推进
  const brdDone = await json('POST', `${api}/api/changes/${name}/phases/brd`, { state: 'done' });
  assert.equal(brdDone.status, 200);
  assert.equal(brdDone.body.phases.brd, 'done');

  // 5) 不可跳过的阶段拒绝 skipped（design 无 skippable）
  const badSkip = await json('POST', `${api}/api/changes/${name}/phases/design`, { state: 'skipped' });
  assert.equal(badSkip.status, 400);
  assert.match(badSkip.body.error, /不可跳过/);

  // 6) 可跳过的阶段（explore）允许
  const skipExplore = await json('POST', `${api}/api/changes/${name}/phases/explore`, { state: 'skipped' });
  assert.equal(skipExplore.status, 200);
  assert.equal(skipExplore.body.phases.explore, 'skipped');

  // 7) apply 不能直接标记——只能由任务完成度派生
  const directApply = await json('POST', `${api}/api/changes/${name}/phases/apply`, { state: 'done' });
  assert.equal(directApply.status, 400);
  assert.match(directApply.body.error, /派生/);

  // 8) 制品写入：真实文件 + 版本链
  const brdFile = getDocFileName(name, 'brd');
  const put = await json('PUT', `${api}/api/changes/${name}/docs/brd`, {
    content: '# 业务需求\n\n- 目标：优惠券',
    note: '首稿',
  });
  assert.equal(put.status, 200);
  assert.equal(put.body.file, brdFile);
  assert.equal(put.body.exists, true);
  assert.equal(put.body.index.current, 2, '空文件初始化 v1，写入后为 v2');
  assert.ok(fs.existsSync(path.join(getChangeDir(root, name), brdFile)));
  assert.equal(
    fs.readFileSync(path.join(getChangeDir(root, name), brdFile), 'utf8'),
    '# 业务需求\n\n- 目标：优惠券',
  );
  // 版本文件落盘
  assert.ok(
    fs.existsSync(path.join(getChangeDir(root, name), '.wpw-docs', 'brd', 'v2.md')),
    '版本文件落在 .wpw-docs/<phase>/v<n>.md',
  );

  // 9) 拍板 explore
  const decided = await json('POST', `${api}/api/changes/${name}/decision`, { option: '方案B' });
  assert.equal(decided.status, 200);
  assert.equal(decided.body.exploreDecision, '方案B');

  // 10) Plan 制品 + 勾任务
  const planFile = getDocFileName(name, 'plan');
  fs.writeFileSync(
    path.join(getChangeDir(root, name), planFile),
    ['# 计划', '- [ ] 1. 建表', '- [ ] 2. 接口', '- [ ] 3. 页面'].join('\n'),
    'utf8',
  );
  await json('POST', `${api}/api/changes/${name}/phases/plan`, { state: 'done' });

  const planDetail = await json('GET', `${api}/api/changes/${name}`);
  assert.equal(planDetail.body.planTasks.length, 3);
  assert.deepEqual(planDetail.body.tasks, { total: 3, done: 0, inProgress: 0 });
  assert.equal(planDetail.body.phases.apply, 'pending', '任务未勾完时 apply 仍为 pending');

  const marked = await json('POST', `${api}/api/changes/${name}/tasks/1`, { state: 'done' });
  assert.equal(marked.status, 200);
  assert.deepEqual(marked.body.tasks, { total: 3, done: 1, inProgress: 0 });
  // 改写真实 Plan 文件
  assert.match(
    fs.readFileSync(path.join(getChangeDir(root, name), planFile), 'utf8'),
    /- \[x\] 1\. 建表/,
  );

  // 勾完剩余任务 → apply 自动变成 done
  await json('POST', `${api}/api/changes/${name}/tasks/2`, { state: 'done' });
  const allDone = await json('POST', `${api}/api/changes/${name}/tasks/3`, { state: 'done' });
  assert.deepEqual(allDone.body.tasks, { total: 3, done: 3, inProgress: 0 });
  assert.equal(allDone.body.phases.apply, 'done', 'Plan done + 任务全勾完 → apply 派生为 done');

  // 11) 事件日志：create / phase / doc / decide / task 都留痕
  const events = await json('GET', `${api}/api/changes/${name}/events`);
  assert.equal(events.status, 200);
  const kinds = new Set(events.body.map((e: { type: string }) => e.type));
  for (const expected of ['create', 'phase', 'decide', 'task']) {
    assert.ok(kinds.has(expected), `事件日志应包含 ${expected}`);
  }
  assert.equal(events.body[0].type, 'create');
  assert.equal(events.body[0].change, name);

  // 12) 回退到「创建需求」那一刻——状态清空，且回退本身也进日志
  const createEvent = events.body.find((e: { type: string }) => e.type === 'create');
  const rolled = await json('POST', `${api}/api/changes/${name}/rollback`, { eventId: createEvent.id });
  assert.equal(rolled.status, 200);
  // 创建那一刻的快照：阶段状态与拍板都回到初始
  assert.equal(rolled.body.phases.brd, 'pending');
  assert.equal(rolled.body.phases.plan, 'pending');
  assert.equal(rolled.body.phases.explore, 'pending');
  assert.equal(rolled.body.exploreDecision, undefined);
  assert.equal(rolled.body.phases.apply, 'pending');
  // 回退的是「工作流状态」；制品内容（含 Plan 的勾选）另有 .wpw-docs 版本链，不回退
  assert.deepEqual(rolled.body.tasks, { total: 3, done: 3, inProgress: 0 });

  const after = await json('GET', `${api}/api/changes/${name}/events`);
  assert.equal(after.body[after.body.length - 1].type, 'rollback');

  // 状态确实落盘
  assert.equal(loadState(root, name)!.status.brd, 'pending');

  // 13) 不存在的需求 / 事件 → 404，且错误信息可读
  const missing = await json('GET', `${api}/api/changes/not-there`);
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /不存在/);

  const badEvent = await json('POST', `${api}/api/changes/${name}/rollback`, { eventId: 'nope' });
  assert.equal(badEvent.status, 404);
});

test('GET /api/changes 返回列表，且列表项含派生的 apply', async () => {
  const { status, body } = await json('GET', `${api}/api/changes`);
  assert.equal(status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].name, 'cart-coupon');
  assert.ok('apply' in body[0].phases);
});

test('GET /api/graph/:name 做 from/to → source/target 转换', async () => {
  const { status, body } = await json('GET', `${api}/api/graph/default`);
  assert.equal(status, 200);
  assert.equal(body.nodes.length, 5);
  assert.equal(body.edges.length, 2);

  const edge = body.edges.find((e: { type: string }) => e.type === 'business_map');
  assert.ok(edge);
  assert.equal(edge.source, 'cap:cart');
  assert.equal(edge.target, 'mod:store');
  assert.equal(edge.weight, 0.6);
  assert.equal('from' in edge, false, '不应把内部的 from/to 泄漏给前端');
});

test('GET /api/graph/:name 支持 levels 过滤', async () => {
  const { body } = await json('GET', `${api}/api/graph/default?levels=C`);
  assert.equal(body.nodes.length, 2);
  assert.ok(body.nodes.every((n: { level: string }) => n.level === 'C'));
  // 过滤后两条边的端点都被裁掉，应无残留边
  assert.equal(body.edges.length, 0);
});

test('GET /api/graph/:name/stat 汇总真实统计', async () => {
  const { status, body } = await json('GET', `${api}/api/graph/default/stat`);
  assert.equal(status, 200);
  assert.equal(body.graphName, 'default');
  assert.equal(body.totalNodes, 5);
  assert.equal(body.totalVectors, 3);
  assert.equal(body.coverage.mappedCapabilities, 1);
  assert.equal(body.coverage.totalCapabilities, 2);
});

test('GET /api/graphs 与 /api/specs /api/archived 空工作区不报错', async () => {
  const graphs = await json('GET', `${api}/api/graphs`);
  assert.equal(graphs.status, 200);
  assert.equal(graphs.body.length, 1);

  const specs = await json('GET', `${api}/api/specs`);
  assert.equal(specs.status, 200);
  assert.deepEqual(specs.body.specs, []);

  const archived = await json('GET', `${api}/api/archived`);
  assert.equal(archived.status, 200);
  assert.deepEqual(archived.body, []);
});

test('GET /api/token-stats 无调用记录时返回空序列', async () => {
  const { status, body } = await json('GET', `${api}/api/token-stats`);
  assert.equal(status, 200);
  assert.deepEqual(body.byChange, []);
  assert.deepEqual(body.byPhase, []);
  assert.deepEqual(body.byTime, []);
});

test('appendUsage 落盘后 /api/token-stats 聚合出三个维度', async () => {
  // 用量来自真实大模型调用，这里直接写日志验证聚合口径（不伪造调用）
  const day1 = new Date('2026-03-05T10:00:00Z').getTime();
  const day2 = new Date('2026-03-06T10:00:00Z').getTime();
  appendUsage(root, { ts: day1, change: 'cart-coupon', phase: 'brd', model: 'm', input: 100, output: 40 });
  appendUsage(root, { ts: day1, change: 'cart-coupon', phase: 'brd', model: 'm', input: 50, output: 20 });
  appendUsage(root, { ts: day2, change: 'cart-coupon', phase: '设计', model: 'm', input: 10, output: 5 });

  const stats = aggregateUsage(readUsage(root));
  assert.deepEqual(stats.byChange, [{ name: 'cart-coupon', input: 160, output: 65 }]);
  assert.deepEqual(
    stats.byPhase.slice().sort((a, b) => b.input - a.input),
    [
      { phase: 'brd', input: 150, output: 60 },
      { phase: '设计', input: 10, output: 5 },
    ],
  );
  assert.equal(stats.byTime.length, 2);
  assert.equal(
    stats.byTime.reduce((s, d) => s + d.input, 0),
    160,
  );

  // 端点每次请求都重读日志，不需要重启服务（用量是持续追加的）
  const { body } = await json('GET', `${api}/api/token-stats`);
  assert.deepEqual(body.byChange, [{ name: 'cart-coupon', input: 160, output: 65 }]);
});

test('用量日志按根目录隔离，且损坏行不影响读取', () => {
  const other = tmpRoot();
  assert.deepEqual(readUsage(other), [], '别的根目录不应看到本工作区的用量');

  fs.appendFileSync(
    path.join(root, '.wpw-console', 'usage.jsonl'),
    '{ 坏行\n',
    'utf8',
  );
  assert.equal(readUsage(root).length, 3);
});

test('缺少大模型配置时 /api/chat 报错、/api/llm/test 返回 ok:false', async () => {
  // 对话是写链路，缺配置直接以错误终止（SSE 端点是先 400 再关闭）
  const chat = await json('POST', `${api}/api/chat`, { prompt: 'hi', mode: 'plain' });
  assert.equal(chat.status, 400);
  assert.match(chat.body.error, /API 配置/);

  // 连通性探测本身就是「测失败也算结果」，用 200 + ok:false 表达，前端读 ok 字段
  const probe = await json('POST', `${api}/api/llm/test`, {});
  assert.equal(probe.status, 200);
  assert.equal(probe.body.ok, false);
  assert.match(probe.body.message, /API 配置/);
});

test('归档后状态与事件都迁移到 archived 目录', async () => {
  const archived = await json('POST', `${api}/api/changes/cart-coupon/archive`);
  assert.equal(archived.status, 200);
  assert.equal(archived.body.archived, true);
  assert.match(archived.body.month, /^\d{4}-\d{2}$/);
  // dest 是相对工作区的路径，即 wpw/archived/YYYY-MM/<name>
  assert.equal(
    archived.body.dest,
    path.join('wpw', 'archived', archived.body.month, 'cart-coupon'),
  );
  assert.ok(fs.existsSync(path.join(root, archived.body.dest, '.wpw.yaml')));
  assert.ok(
    fs.existsSync(path.join(root, archived.body.dest, '.wpw-events.jsonl')),
    '事件日志随需求目录一起迁入归档',
  );

  // 已归档需求不再出现在 active 列表
  const list = await json('GET', `${api}/api/changes`);
  assert.deepEqual(list.body, []);

  // 归档记录能在归档页读取
  const arch = await json('GET', `${api}/api/archived`);
  assert.equal(arch.body.length, 1);
  assert.equal(arch.body[0].name, 'cart-coupon');
  assert.ok(arch.body[0].docs.length > 0, '归档应带上制品内容');
});