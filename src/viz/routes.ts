/**
 * viz 服务的 API 端点。
 *
 * 所有读写都直接落在真实工作区上：
 *   wpw/active/<name>/.wpw.yaml        — 阶段状态、拍板、任务进度
 *   wpw/active/<name>/<制品>.md        — 阶段制品（BRD-<name>.md 等）
 *   wpw/active/<name>/.wpw-events.jsonl— 事件日志（历史回溯的数据源）
 *   wpw/knowledge/graph/<g>/           — 知识图谱
 *   wpw/specs/*\/spec.md               — 能力规格
 *   wpw/archived/YYYY-MM/<name>/       — 归档需求
 *
 * 服务端还承担一层「契约适配」：把 CLI 的真实数据整形为前端既有的字段
 * （如 createdAt 转毫秒、边 from/to → source/target、补一个派生的 apply 阶段），
 * 这样视图层几乎不用改。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ArtifactId,
  getArtifact,
  getSchema,
  sixPhaseSchema,
  resolveFileName,
} from '../schema/six-phase';
import {
  archiveChange,
  changeNameExists,
  getActiveDir,
  getArchivedDir,
  getChangeDir,
  initState,
  listChanges,
  loadState,
  resolveChangeDir,
  restoreSnapshot,
  saveState,
  setDecision,
  setProgress,
  setStatus,
  validateChangeName,
  type ChangeState,
} from '../lib/state';
import { getProjectType } from '../lib/config';
import { checkArtifact } from '../lib/dependency';
import {
  addDocVersion,
  docExists,
  getDocFileName,
  loadDocIndex,
  markTaskInPlan,
  parsePlanTasks,
  readDoc,
  readDocVersion,
  revertDocVersion,
  summarizeTasks,
  writeDoc,
} from '../lib/artifact';
import { appendEvent, makeEvent, readEvents, snapshotOf } from '../lib/events';
import { computeGraphStat, listGraphSummaries, loadGraph, toVizGraph } from './store';
import { buildChatContext, generateContext } from './context';
import {
  aggregateUsage,
  appendUsage,
  probeLlm,
  readUsage,
  streamChat,
  type ChatMessage,
  type LlmConfig,
} from './llm';

/** 内置六阶段的展示顺序；apply 不在 schema 中，由 plan 的任务完成度派生 */
const PHASE_ORDER: ArtifactId[] = ['brd', 'prd', 'explore', 'design', 'plan', 'testplan'];
const DOC_PHASES = PHASE_ORDER;

export interface VizRequest {
  method: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  root: string;
}

export interface SseWriter {
  send(event: string, data: unknown): void;
  end(): void;
}

export interface VizResponse {
  json(data: unknown, status?: number): void;
  text(data: string, status?: number): void;
  sse(): SseWriter;
}

export interface Route {
  method: string;
  pattern: string;
  handler: (req: VizRequest, res: VizResponse) => Promise<void> | void;
}

// ==================== 契约适配 ====================

function artifactPath(root: string, name: string, phase: ArtifactId, schemaName: string): string {
  const artifact = getArtifact(getSchema(schemaName), phase);
  return path.join(getChangeDir(root, name), resolveFileName(artifact, name));
}

/**
 * 派生的 apply 阶段。
 *
 * schema 里 apply 不是 artifact（只是个门禁 + 任务来源），所以没有持久状态。
 * 这里按「Plan 已 done 且任务全部勾完」判定它完成——这也正是 `wpw apply` 的语义。
 */
function deriveApply(state: ChangeState, tasks: { total: number; completed: number }): string {
  if (state.status['plan'] !== 'done') return 'pending';
  return tasks.total > 0 && tasks.completed === tasks.total ? 'done' : 'pending';
}

function tasksOf(root: string, name: string, schemaName: string) {
  return summarizeTasks(parsePlanTasks(artifactPath(root, name, 'plan', schemaName)));
}

interface ChangeItemDto {
  name: string;
  schema: string;
  projectType: string;
  createdAt: number;
  phases: Record<string, string>;
  tasks: { total: number; done: number; inProgress: number };
  exploreDecision?: string;
}

function toChangeItem(root: string, state: ChangeState): ChangeItemDto {
  const tasks = tasksOf(root, state.name, state.schema);
  const phases: Record<string, string> = {};
  for (const id of PHASE_ORDER) phases[id] = state.status[id] ?? 'pending';
  phases.apply = deriveApply(state, tasks);

  return {
    name: state.name,
    schema: state.schema,
    projectType: state.config?.projectType ?? 'auto',
    // CLI 存 ISO 字符串，前端按毫秒数渲染
    createdAt: Date.parse(state.createdAt) || Date.now(),
    phases,
    tasks: { total: tasks.total, done: tasks.completed, inProgress: tasks.inProgress },
    exploreDecision: state.decisions?.explore?.chosenOption ?? undefined,
  };
}

function collectWarnings(root: string, name: string, state: ChangeState): string[] {
  const warnings: string[] = [];
  for (const art of sixPhaseSchema.artifacts) {
    try {
      warnings.push(...checkArtifact(root, name, art.id).warnings);
    } catch {
      // 单个阶段检查失败不影响其余
    }
  }
  if (state.status['testplan'] !== 'done') {
    warnings.push(
      state.status['testplan'] === 'skipped'
        ? 'Test 已跳过：Apply 缺少测试用例驱动，开发后无法验证用例，存在质量风险'
        : 'Test 未完成：Apply 将缺少测试用例驱动，推荐先执行 /wpw:test',
    );
  }
  return [...new Set(warnings)];
}

function requirePhase(phase: string): ArtifactId {
  if (!DOC_PHASES.includes(phase as ArtifactId)) {
    throw new Error(`未知阶段: ${phase}，合法值: ${DOC_PHASES.join(', ')}`);
  }
  return phase as ArtifactId;
}

function docDto(root: string, name: string, phase: ArtifactId) {
  const index = loadDocIndex(root, name, phase);
  const content = readDoc(root, name, phase) ?? readDocVersion(root, name, phase, index.current) ?? '';
  return {
    phase,
    file: getDocFileName(name, phase),
    exists: docExists(root, name, phase),
    content,
    index,
  };
}

function llmFrom(body: any): LlmConfig {
  const llm = body?.llm ?? {};
  if (!llm.baseUrl || !llm.apiKey || !llm.model) {
    throw new Error('缺少大模型配置：请在「API 配置」页填写 Base URL / API Key / 模型');
  }
  return { baseUrl: String(llm.baseUrl), apiKey: String(llm.apiKey), model: String(llm.model) };
}

// ==================== 路由 ====================

export function createHandlers(root: string, defaultGraph: string): Route[] {
  const routes: Route[] = [];
  const add = (
    method: string,
    pattern: string,
    handler: (req: VizRequest, res: VizResponse) => Promise<void> | void,
  ) => routes.push({ method, pattern, handler });

  // ---------- 工作区元信息 ----------

  add('GET', '/api/meta', (_req, res) => {
    res.json({
      root,
      graph: defaultGraph,
      graphs: listGraphSummaries(root),
      hasActive: fs.existsSync(getActiveDir(root)),
      hasArchived: fs.existsSync(getArchivedDir(root)),
      hasSpecs: fs.existsSync(path.join(root, 'wpw', 'specs')),
    });
  });

  // ---------- 需求（工作流状态） ----------

  add('GET', '/api/changes', (_req, res) => {
    const items = listChanges(root)
      .map((name) => loadState(root, name))
      .filter((s): s is ChangeState => !!s)
      .map((s) => toChangeItem(root, s));
    res.json(items);
  });

  add('POST', '/api/changes', (req, res) => {
    const name = String((req.body as any)?.name ?? '').trim();
    const check = validateChangeName(name);
    if (!check.valid) {
      res.json({ error: `需求名不合法：${check.reason}` }, 400);
      return;
    }
    if (loadState(root, name) || changeNameExists(root, name)) {
      res.json({ error: `需求已存在：${name}（需求名全局唯一，含已归档）` }, 409);
      return;
    }

    const state = initState(name, getProjectType(root));
    saveState(root, state);
    appendEvent(
      getChangeDir(root, name),
      makeEvent('create', `创建需求 ${name}`, undefined, snapshotOf(state)),
    );
    res.json(toChangeItem(root, state), 201);
  });

  add('GET', '/api/changes/:name', (req, res) => {
    const name = req.params.name;
    const state = loadState(root, name);
    if (!state) {
      res.json({ error: `需求不存在: ${name}` }, 404);
      return;
    }
    const tasks = tasksOf(root, name, state.schema);
    res.json({
      ...toChangeItem(root, state),
      docs: sixPhaseSchema.artifacts.map((a) => ({
        phase: a.id,
        file: resolveFileName(a, name),
        exists: fs.existsSync(artifactPath(root, name, a.id, state.schema)),
      })),
      warnings: collectWarnings(root, name, state),
      planTasks: parsePlanTasks(artifactPath(root, name, 'plan', state.schema)).map((t) => ({
        id: t.id,
        title: t.text,
        state: t.state,
      })),
    });
  });

  add('POST', '/api/changes/:name/phases/:phase', (req, res) => {
    const { name, phase } = req.params;
    const target = String((req.body as any)?.state ?? '');
    if (!['done', 'skipped', 'pending'].includes(target)) {
      res.json({ error: `非法状态: ${target}（可选 done / skipped / pending）` }, 400);
      return;
    }
    if (phase === 'apply') {
      res.json({ error: 'apply 由 Plan 任务完成度派生，请勾选任务而非直接标记阶段' }, 400);
      return;
    }
    const id = requirePhase(phase);

    if (target === 'skipped') {
      const artifact = getArtifact(getSchema('wpw-six-phase'), id);
      if (!artifact.skippable) {
        res.json({ error: `阶段 ${id} 不可跳过` }, 400);
        return;
      }
    }

    const state = setStatus(root, name, id, target as any);
    res.json(toChangeItem(root, state));
  });

  add('POST', '/api/changes/:name/decision', (req, res) => {
    const option = String((req.body as any)?.option ?? '').trim();
    if (!option) {
      res.json({ error: '缺少 option' }, 400);
      return;
    }
    const state = setDecision(root, req.params.name, 'explore', option);
    res.json(toChangeItem(root, state));
  });

  add('POST', '/api/changes/:name/tasks/:id', (req, res) => {
    const { name, id } = req.params;
    const state = loadState(root, name);
    if (!state) {
      res.json({ error: `需求不存在: ${name}` }, 404);
      return;
    }
    const target = String((req.body as any)?.state ?? 'done');
    if (!['pending', 'in-progress', 'done'].includes(target)) {
      res.json({ error: `非法任务状态: ${target}` }, 400);
      return;
    }

    const planPath = artifactPath(root, name, 'plan', state.schema);
    if (!fs.existsSync(planPath)) {
      res.json({ error: `Plan 制品不存在：${path.basename(planPath)}` }, 404);
      return;
    }

    const result = markTaskInPlan(planPath, id, target as any);
    fs.writeFileSync(planPath, result.content, 'utf8');
    const updated = setProgress(root, name, result.total, result.completed);
    res.json(toChangeItem(root, updated));
  });

  add('GET', '/api/changes/:name/events', (req, res) => {
    const dir = resolveChangeDir(root, req.params.name);
    if (!dir) {
      res.json({ error: `需求不存在: ${req.params.name}` }, 404);
      return;
    }
    res.json(
      readEvents(dir).map((e) => {
        const snap = e.after ?? e.before;
        return {
          id: e.id,
          ts: e.ts,
          change: req.params.name,
          type: e.type,
          label: e.label,
          snapshot: snap
            ? {
                phases: snap.status,
                exploreDecision: snap.decisions?.explore?.chosenOption,
              }
            : undefined,
        };
      }),
    );
  });

  add('POST', '/api/changes/:name/rollback', (req, res) => {
    const eventId = String((req.body as any)?.eventId ?? '');
    const dir = resolveChangeDir(root, req.params.name);
    if (!dir) {
      res.json({ error: `需求不存在: ${req.params.name}` }, 404);
      return;
    }
    const event = readEvents(dir).find((e) => e.id === eventId);
    if (!event) {
      res.json({ error: `历史事件不存在: ${eventId}` }, 404);
      return;
    }
    const snapshot = event.after ?? event.before;
    if (!snapshot) {
      res.json({ error: '该事件没有快照，无法回退' }, 400);
      return;
    }
    // 归档需求不可回退（目录已移出 active）
    if (!loadState(root, req.params.name)) {
      res.json({ error: '已归档需求不支持回退，请先移回 wpw/active' }, 400);
      return;
    }
    const state = restoreSnapshot(root, req.params.name, snapshot, `回退到「${event.label}」`);
    res.json(toChangeItem(root, state));
  });

  // ---------- 阶段制品 ----------

  add('GET', '/api/changes/:name/docs/:phase', (req, res) => {
    const id = requirePhase(req.params.phase);
    if (!loadState(root, req.params.name)) {
      res.json({ error: `需求不存在: ${req.params.name}` }, 404);
      return;
    }
    res.json(docDto(root, req.params.name, id));
  });

  add('PUT', '/api/changes/:name/docs/:phase', (req, res) => {
    const id = requirePhase(req.params.phase);
    const body = req.body as any;
    if (typeof body?.content !== 'string') {
      res.json({ error: '缺少 content' }, 400);
      return;
    }
    if (!loadState(root, req.params.name)) {
      res.json({ error: `需求不存在: ${req.params.name}` }, 404);
      return;
    }

    const version = addDocVersion(
      root,
      req.params.name,
      id,
      body.content,
      String(body.note ?? '手动编辑'),
    );
    appendEvent(
      getChangeDir(root, req.params.name),
      makeEvent('doc', `写入 ${id} 制品 → v${version.v}`, undefined, undefined, {
        phase: id,
        version: version.v,
        note: version.note,
      }),
    );
    res.json(docDto(root, req.params.name, id));
  });

  add('POST', '/api/changes/:name/docs/:phase/revert', (req, res) => {
    const id = requirePhase(req.params.phase);
    const v = Number((req.body as any)?.v);
    if (!Number.isFinite(v)) {
      res.json({ error: '缺少版本号 v' }, 400);
      return;
    }
    const content = revertDocVersion(root, req.params.name, id, v);
    if (content === null) {
      res.json({ error: `版本不存在: v${v}` }, 404);
      return;
    }
    appendEvent(
      getChangeDir(root, req.params.name),
      makeEvent('doc', `${id} 制品回退到 v${v}`, undefined, undefined, { phase: id, version: v }),
    );
    res.json(docDto(root, req.params.name, id));
  });

  /**
   * 让大模型按指令重写制品，产出新版本。
   * 这是 PhaseActionDrawer 里「把……改成……」类指令的真实实现。
   */
  add('POST', '/api/changes/:name/docs/:phase/revise', async (req, res) => {
    const id = requirePhase(req.params.phase);
    const name = req.params.name;
    const body = req.body as any;
    const instruction = String(body?.instruction ?? '').trim();
    if (!instruction) {
      res.json({ error: '缺少 instruction' }, 400);
      return;
    }
    if (!loadState(root, name)) {
      res.json({ error: `需求不存在: ${name}` }, 404);
      return;
    }
    const cfg = llmFrom(body);
    const current = readDoc(root, name, id) ?? '';

    let rewritten = '';
    const usage = await streamChat(
      cfg,
      [
        {
          role: 'system',
          content:
            '你是技术文档编辑。请按用户指令修改给定的 Markdown 制品，直接输出修改后的完整 Markdown 全文，' +
            '不要输出解释、不要用代码块包裹全文、不要添加额外的前言后语。保持原文的语言与结构风格。',
        },
        { role: 'user', content: `【当前制品】\n\n${current}\n\n【修改指令】\n${instruction}` },
      ],
      (delta) => {
        rewritten += delta;
      },
    );

    if (!rewritten.trim()) {
      res.json({ error: '模型返回为空，未修改文档' }, 502);
      return;
    }

    const version = addDocVersion(root, name, id, rewritten, instruction.slice(0, 60));
    appendEvent(
      getChangeDir(root, name),
      makeEvent('doc', `AI 修订 ${id} 制品 → v${version.v}`, undefined, undefined, {
        phase: id,
        version: version.v,
        note: version.note,
      }),
    );
    appendUsage(root, {
      ts: Date.now(),
      change: name,
      phase: id,
      model: cfg.model,
      input: usage.promptTokens,
      output: usage.completionTokens,
    });

    res.json({ ...docDto(root, name, id), note: version.note });
  });

  // ---------- 归档 ----------

  add('POST', '/api/changes/:name/archive', (req, res) => {
    const name = req.params.name;
    if (!loadState(root, name)) {
      res.json({ error: `需求不存在: ${name}` }, 404);
      return;
    }
    // 与 `wpw archive` 共用同一实现，避免两处搬运逻辑漂移
    const { relative, month } = archiveChange(root, name);

    res.json({
      archived: true,
      name,
      month,
      dest: relative,
      note: '知识图谱未同步更新——如需更新请执行 wpw graph update',
    });
  });

  // ---------- 知识图谱 ----------

  add('GET', '/api/graphs', (_req, res) => {
    res.json(listGraphSummaries(root));
  });

  add('GET', '/api/graph/:name/stat', (req, res) => {
    res.json(computeGraphStat(root, req.params.name));
  });

  add('GET', '/api/graph/:name', (req, res) => {
    const data = loadGraph(root, req.params.name);
    const levels = req.query.levels ? req.query.levels.split(',').filter(Boolean) : undefined;
    const types = req.query.types ? req.query.types.split(',').filter(Boolean) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json(toVizGraph(data, { levels, types, limit }));
  });

  // ---------- 能力规格 ----------

  add('GET', '/api/specs', (_req, res) => {
    const specsDir = path.join(root, 'wpw', 'specs');
    const specs: { name: string; title: string; updatedAt: number; markdown: string }[] = [];

    if (fs.existsSync(specsDir)) {
      for (const entry of fs.readdirSync(specsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const specPath = path.join(specsDir, entry.name, 'spec.md');
        if (!fs.existsSync(specPath)) continue;

        const markdown = fs.readFileSync(specPath, 'utf8');
        const heading = markdown.split('\n').find((l) => l.trim().startsWith('# '));
        specs.push({
          name: entry.name,
          title: heading ? heading.replace(/^#\s*/, '').trim() : entry.name,
          updatedAt: fs.statSync(specPath).mtimeMs,
          markdown,
        });
      }
    }
    specs.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      specs,
      artifacts: listGraphSummaries(root).map((g) => ({
        name: g.name,
        builtAt: g.builtAt,
        nodes: g.totalNodes,
        edges: g.totalEdges,
        vectors: g.totalVectors,
      })),
    });
  });

  // ---------- 归档中心 ----------

  add('GET', '/api/archived', (_req, res) => {
    const archivedDir = getArchivedDir(root);
    if (!fs.existsSync(archivedDir)) {
      res.json([]);
      return;
    }

    const result: {
      month: string;
      name: string;
      archivedAt: number;
      docs: { title: string; markdown: string }[];
    }[] = [];

    for (const monthEntry of fs.readdirSync(archivedDir, { withFileTypes: true })) {
      if (!monthEntry.isDirectory()) continue;
      const monthPath = path.join(archivedDir, monthEntry.name);

      for (const changeEntry of fs.readdirSync(monthPath, { withFileTypes: true })) {
        if (!changeEntry.isDirectory()) continue;
        const changePath = path.join(monthPath, changeEntry.name);

        const docs = fs
          .readdirSync(changePath)
          .filter((f) => f.toLowerCase().endsWith('.md'))
          .map((f) => ({
            title: f,
            markdown: fs.readFileSync(path.join(changePath, f), 'utf8'),
          }));

        result.push({
          month: monthEntry.name,
          name: changeEntry.name,
          archivedAt: fs.statSync(changePath).mtimeMs,
          docs,
        });
      }
    }

    result.sort((a, b) => b.archivedAt - a.archivedAt);
    res.json(result);
  });

  // ---------- 上下文与对话 ----------

  add('POST', '/api/context', async (req, res) => {
    const body = req.body as any;
    const query = String(body?.query ?? '').trim();
    if (!query) {
      res.json({ error: '缺少 query' }, 400);
      return;
    }
    const result = await generateContext(root, query, {
      graph: body?.graph ?? defaultGraph,
      budget: body?.budget ? Number(body.budget) : undefined,
      depth: body?.depth ? Number(body.depth) : undefined,
      maxNodes: body?.maxNodes ? Number(body.maxNodes) : undefined,
      semantic: body?.semantic !== false,
    });
    res.json(result);
  });

  add('GET', '/api/token-stats', (_req, res) => {
    res.json(aggregateUsage(readUsage(root)));
  });

  add('POST', '/api/llm/test', async (req, res) => {
    try {
      res.json(await probeLlm(llmFrom(req.body)));
    } catch (e) {
      res.json({ ok: false, message: (e as Error).message });
    }
  });

  /**
   * 对话（SSE）。
   *
   * mode=augmented 时先用真实管线取一次上下文并注入 system prompt，
   * 这样「纯模型 vs 图谱增强」的双栏对比是有依据的，而不是两段固定文案。
   */
  add('POST', '/api/chat', async (req, res) => {
    const body = req.body as any;
    const prompt = String(body?.prompt ?? '').trim();
    if (!prompt) {
      res.json({ error: '缺少 prompt' }, 400);
      return;
    }

    let cfg: LlmConfig;
    try {
      cfg = llmFrom(body);
    } catch (e) {
      res.json({ error: (e as Error).message }, 400);
      return;
    }

    const augmented = body?.mode === 'augmented';
    const graph = body?.graph ?? defaultGraph;
    const change = body?.change ? String(body.change) : undefined;
    const phase = body?.phase ? String(body.phase) : undefined;

    const sse = res.sse();
    try {
      let contextInfo: { text: string; tokens: number; summary: string; degraded?: string } | null = null;
      if (augmented) {
        contextInfo = await buildChatContext(
          root,
          prompt,
          Number(body?.budget ?? 2000),
          graph,
        );
        sse.send('context', {
          summary: contextInfo?.summary ?? '未检索到相关上下文',
          tokens: contextInfo?.tokens ?? 0,
          degraded: contextInfo?.degraded,
        });
      }

      const messages: ChatMessage[] = [];
      if (contextInfo) {
        messages.push({
          role: 'system',
          content:
            '你是 wpw 工作流助手。下面是从项目知识图谱中检索到的上下文，请优先依据它回答，' +
            '不要编造上下文中没有的代码结构；若上下文不足以回答，请明确指出。\n\n' +
            `【项目上下文】\n${contextInfo.text}`,
        });
      } else {
        messages.push({
          role: 'system',
          content: '你是 wpw 工作流助手，负责协助 BRD/PRD/Explore/Design/Plan/Test 各阶段的推进。',
        });
      }
      messages.push({ role: 'user', content: prompt });

      const usage = await streamChat(cfg, messages, (delta) => sse.send('delta', { text: delta }));

      appendUsage(root, {
        ts: Date.now(),
        change,
        phase,
        model: cfg.model,
        input: usage.promptTokens,
        output: usage.completionTokens,
      });

      sse.send('done', { usage: { input: usage.promptTokens, output: usage.completionTokens } });
    } catch (e) {
      sse.send('error', { message: (e as Error).message });
    } finally {
      sse.end();
    }
  });

  return routes;
}