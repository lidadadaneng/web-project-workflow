/**
 * 阶段制品（BRD / PRD / Explore / Design / Plan / TestPlan）的读写与版本管理。
 *
 * 制品主文件始终是「当前版本」，路径由 schema 的 `file` 模板决定
 * （见 six-phase.ts 的 resolveFileName，如 `BRD-<需求名>.md`）。
 * 历史版本落在 `<changeDir>/.wpw-docs/<phase>/v<n>.md`，索引为同目录 versions.json。
 *
 * Plan 任务清单的解析/勾选也集中在此，供 `wpw apply`、`wpw task` 与 viz 服务共用，
 * 避免三处各写一份正则而逐步漂移。
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  ArtifactId,
  getArtifact,
  getSchema,
  resolveFileName,
} from '../schema/six-phase';
import { getChangeDir, loadStateOrThrow } from './state';

// ==================== 制品文件 ====================

/** 解析某个阶段制品在需求目录下的绝对路径 */
export function getDocPath(root: string, name: string, phase: ArtifactId): string {
  const state = loadStateOrThrow(root, name);
  const schema = getSchema(state.schema);
  const artifact = getArtifact(schema, phase);
  return path.join(getChangeDir(root, name), resolveFileName(artifact, name));
}

/** 制品文件名（不含目录） */
export function getDocFileName(name: string, phase: ArtifactId, schemaName?: string): string {
  const schema = getSchema(schemaName ?? 'wpw-six-phase');
  const artifact = getArtifact(schema, phase);
  return resolveFileName(artifact, name);
}

export function docExists(root: string, name: string, phase: ArtifactId): boolean {
  return fs.existsSync(getDocPath(root, name, phase));
}

/** 读取制品内容；不存在返回 null */
export function readDoc(root: string, name: string, phase: ArtifactId): string | null {
  const p = getDocPath(root, name, phase);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

/** 覆盖写入制品主文件 */
export function writeDoc(root: string, name: string, phase: ArtifactId, content: string): void {
  const p = getDocPath(root, name, phase);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

/** 列出该需求所有阶段的制品存在情况 */
export function listDocs(
  root: string,
  name: string,
  schemaName?: string,
): { phase: ArtifactId; file: string; exists: boolean }[] {
  const schema = getSchema(schemaName ?? 'wpw-six-phase');
  return schema.artifacts.map((a) => {
    const file = resolveFileName(a, name);
    return {
      phase: a.id,
      file,
      exists: fs.existsSync(path.join(getChangeDir(root, name), file)),
    };
  });
}

// ==================== Plan 任务清单 ====================

export type PlanTaskState = 'pending' | 'in-progress' | 'done';

export interface PlanTask {
  id: string;
  text: string;
  state: PlanTaskState;
}

export const PLAN_TASK_STATES: PlanTaskState[] = ['pending', 'in-progress', 'done'];

/** 解析 Plan 文档里的 `- [ ] / - [x] / - [🔄]` 任务行 */
export function parsePlanTasks(planPath: string): PlanTask[] {
  if (!fs.existsSync(planPath)) return [];
  const tasks: PlanTask[] = [];
  let id = 0;
  for (const line of fs.readFileSync(planPath, 'utf8').split('\n')) {
    const m = line.match(/^-\s*\[([ x]|🔄)\]\s*(.+)$/);
    if (!m) continue;
    id++;
    const mark = m[1];
    tasks.push({
      id: String(id),
      text: m[2].replace(/^\d+\.\s*/, ''),
      state: mark === 'x' ? 'done' : mark === '🔄' ? 'in-progress' : 'pending',
    });
  }
  return tasks;
}

/** 统计任务进度（total / completed / inProgress） */
export function summarizeTasks(tasks: PlanTask[]): {
  total: number;
  completed: number;
  inProgress: number;
} {
  return {
    total: tasks.length,
    completed: tasks.filter((t) => t.state === 'done').length,
    inProgress: tasks.filter((t) => t.state === 'in-progress').length,
  };
}

/**
 * 勾选/取消 Plan 中的某个任务，返回改写后的全文与统计。
 *
 * 只改 mark（`[ ]` / `[x]` / `[🔄]`），保留行内其余内容原样。
 */
export function markTaskInPlan(
  planPath: string,
  taskId: string,
  newState: PlanTaskState,
): { content: string; total: number; completed: number; inProgress: number } {
  const content = fs.readFileSync(planPath, 'utf8');
  let currentId = 0;
  let total = 0;
  let completed = 0;
  let inProgress = 0;
  const targetId = Number(taskId);
  const newMark = newState === 'done' ? 'x' : newState === 'in-progress' ? '🔄' : ' ';

  const lines = content.split('\n').map((line) => {
    const m = line.match(/^(-\s*\[)([ x]|🔄)(\]\s*)(.+)$/);
    if (!m) return line;
    currentId++;
    total++;
    let mark = m[2];
    if (currentId === targetId) mark = newMark;
    if (mark === 'x') completed++;
    else if (mark === '🔄') inProgress++;
    return `${m[1]}${mark}${m[3]}${m[4]}`;
  });

  return { content: lines.join('\n'), total, completed, inProgress };
}

// ==================== 制品版本链 ====================

export interface DocVersion {
  v: number;
  ts: number;
  note: string;
}

export interface DocVersionIndex {
  versions: DocVersion[];
  /** 当前版本号 */
  current: number;
}

function docsRoot(root: string, name: string, phase: ArtifactId): string {
  return path.join(getChangeDir(root, name), '.wpw-docs', phase);
}

function indexPath(root: string, name: string, phase: ArtifactId): string {
  return path.join(docsRoot(root, name, phase), 'versions.json');
}

function versionFilePath(root: string, name: string, phase: ArtifactId, v: number): string {
  return path.join(docsRoot(root, name, phase), `v${v}.md`);
}

/**
 * 读取版本索引；缺失时用当前制品文件初始化 v1。
 *
 * 制品可能是 AI 层（/wpw:xxx 命令）直接写入的——此时没有版本索引，
 * 这里以「当前文件内容 = v1」的方式补一个起点，之后所有改动都有版本可追溯。
 */
export function loadDocIndex(root: string, name: string, phase: ArtifactId): DocVersionIndex {
  const p = indexPath(root, name, phase);
  if (fs.existsSync(p)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as DocVersionIndex;
      if (Array.isArray(parsed.versions) && parsed.versions.length > 0) return parsed;
    } catch {
      // 索引损坏 → 重新初始化
    }
  }

  const content = readDoc(root, name, phase) ?? '';
  const index: DocVersionIndex = {
    versions: [{ v: 1, ts: Date.now(), note: content ? '初始版本' : '空版本' }],
    current: 1,
  };
  const dir = docsRoot(root, name, phase);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(versionFilePath(root, name, phase, 1), content, 'utf8');
  fs.writeFileSync(p, JSON.stringify(index, null, 2), 'utf8');
  return index;
}

/** 读取某版本内容 */
export function readDocVersion(
  root: string,
  name: string,
  phase: ArtifactId,
  v: number,
): string | null {
  loadDocIndex(root, name, phase);
  const p = versionFilePath(root, name, phase, v);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8');
}

/**
 * 追加一个新版本：写版本文件 → 更新索引 current → 同步制品主文件。
 */
export function addDocVersion(
  root: string,
  name: string,
  phase: ArtifactId,
  content: string,
  note: string,
): DocVersion {
  const index = loadDocIndex(root, name, phase);
  const nextV = index.versions.reduce((max, x) => Math.max(max, x.v), 0) + 1;
  const version: DocVersion = { v: nextV, ts: Date.now(), note };

  fs.mkdirSync(docsRoot(root, name, phase), { recursive: true });
  fs.writeFileSync(versionFilePath(root, name, phase, nextV), content, 'utf8');
  index.versions.push(version);
  index.current = nextV;
  fs.writeFileSync(indexPath(root, name, phase), JSON.stringify(index, null, 2), 'utf8');
  writeDoc(root, name, phase, content);

  return version;
}

/**
 * 回退到指定版本：把该版本内容写回制品主文件，并把它设为 current。
 * 非破坏性——更新版本仍留在版本链中，可随时再切回去。
 */
export function revertDocVersion(
  root: string,
  name: string,
  phase: ArtifactId,
  v: number,
): string | null {
  const content = readDocVersion(root, name, phase, v);
  if (content === null) return null;

  const index = loadDocIndex(root, name, phase);
  index.current = v;
  fs.writeFileSync(indexPath(root, name, phase), JSON.stringify(index, null, 2), 'utf8');
  writeDoc(root, name, phase, content);
  return content;
}