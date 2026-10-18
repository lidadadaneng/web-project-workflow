/**
 * .wpw.yaml 状态管理。
 *
 * 每个需求一个 .wpw.yaml，记录各阶段 status、拍板决策、任务进度。
 * 依赖检查引擎（dependency.ts）消费此状态。
 *
 * 每次状态变更都会往同目录的 .wpw-events.jsonl 追加一条带前后快照的事件
 * （见 events.ts），使推进过程可回溯、可回退。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  ArtifactId,
  ArtifactStatus,
  getSchema,
  listArtifactIds,
  sixPhaseSchema,
} from '../schema/six-phase';
import { appendEvent, makeEvent, snapshotOf, type StateSnapshot } from './events';

export interface ExploreDecision {
  chosenOption: string | null;
  chosenAt: string | null;
}

/**
 * 校验需求名是否符合 kebab-case 格式。
 *
 * 规则：
 * - 小写字母 + 数字 + 短横线
 * - 首尾不能是短横线
 * - 不能有连续短横线
 * - 长度 2-30 字符
 */
export function validateChangeName(name: string): { valid: boolean; reason?: string } {
  if (typeof name !== 'string') {
    return { valid: false, reason: '需求名必须是字符串' };
  }
  if (name.length < 2) {
    return { valid: false, reason: `需求名至少 2 个字符（当前 ${name.length} 个）` };
  }
  if (name.length > 30) {
    return { valid: false, reason: `需求名最多 30 个字符（当前 ${name.length} 个）` };
  }
  if (name.startsWith('-')) {
    return { valid: false, reason: '需求名不能以短横线开头' };
  }
  if (name.endsWith('-')) {
    return { valid: false, reason: '需求名不能以短横线结尾' };
  }
  if (name.includes('--')) {
    return { valid: false, reason: '需求名不能包含连续短横线' };
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return { valid: false, reason: '需求名只能包含小写字母、数字和短横线（kebab-case 格式）' };
  }
  return { valid: true };
}

export interface ChangeState {
  name: string;
  createdAt: string;
  schema: string;
  status: Record<ArtifactId, ArtifactStatus>;
  decisions: {
    explore?: ExploreDecision;
  };
  progress: {
    totalTasks: number;
    completedTasks: number;
  };
  config: {
    projectType: string;
  };
}

export function initState(
  name: string,
  projectType: string = 'auto',
  schemaName: string = sixPhaseSchema.name,
): ChangeState {
  const schema = getSchema(schemaName);
  const status = {} as Record<ArtifactId, ArtifactStatus>;
  for (const id of listArtifactIds(schema)) {
    status[id] = 'pending';
  }
  return {
    name,
    createdAt: new Date().toISOString(),
    schema: schemaName,
    status,
    decisions: {},
    progress: { totalTasks: 0, completedTasks: 0 },
    config: { projectType },
  };
}

export function getActiveDir(root: string): string {
  return path.join(root, 'wpw', 'active');
}

export function getArchivedDir(root: string): string {
  return path.join(root, 'wpw', 'archived');
}

export function getChangeDir(root: string, name: string): string {
  return path.join(getActiveDir(root), name);
}

export function getStatePath(root: string, name: string): string {
  return path.join(getChangeDir(root, name), '.wpw.yaml');
}

export function loadState(root: string, name: string): ChangeState | null {
  const p = getStatePath(root, name);
  if (!fs.existsSync(p)) return null;
  const content = fs.readFileSync(p, 'utf8');
  return yaml.load(content) as ChangeState;
}

export function loadStateOrThrow(root: string, name: string): ChangeState {
  const s = loadState(root, name);
  if (!s) throw new Error(`需求不存在: ${name}（请先执行 wpw new ${name}）`);
  return s;
}

export function saveState(root: string, state: ChangeState): void {
  const dir = getChangeDir(root, state.name);
  fs.mkdirSync(dir, { recursive: true });
  const content = yaml.dump(state, { lineWidth: 120 });
  fs.writeFileSync(getStatePath(root, state.name), content, 'utf8');
}

export function setStatus(
  root: string,
  name: string,
  id: ArtifactId,
  status: ArtifactStatus,
): ChangeState {
  const state = loadStateOrThrow(root, name);
  const before = snapshotOf(state);
  state.status[id] = status;
  saveState(root, state);
  appendEvent(
    getChangeDir(root, name),
    makeEvent('phase', `阶段 ${id} → ${status}`, before, snapshotOf(state), {
      phase: id,
      status,
    }),
  );
  return state;
}

export function setDecision(
  root: string,
  name: string,
  id: ArtifactId,
  option: string,
): ChangeState {
  const state = loadStateOrThrow(root, name);
  if (id === 'explore') {
    const before = snapshotOf(state);
    state.decisions.explore = {
      chosenOption: option,
      chosenAt: new Date().toISOString(),
    };
    saveState(root, state);
    appendEvent(
      getChangeDir(root, name),
      makeEvent('decide', `Explore 拍板：${option}`, before, snapshotOf(state), {
        phase: id,
        option,
      }),
    );
  } else {
    throw new Error(`阶段 ${id} 不支持 decision 记录`);
  }
  return state;
}

export function setProgress(
  root: string,
  name: string,
  totalTasks: number,
  completedTasks: number,
): ChangeState {
  const state = loadStateOrThrow(root, name);
  const before = snapshotOf(state);
  state.progress.totalTasks = totalTasks;
  state.progress.completedTasks = completedTasks;
  saveState(root, state);
  appendEvent(
    getChangeDir(root, name),
    makeEvent('task', `任务进度 ${completedTasks}/${totalTasks}`, before, snapshotOf(state), {
      totalTasks,
      completedTasks,
    }),
  );
  return state;
}

/**
 * 回退到某个历史快照：把 status / decisions / progress 还原，并记一条 rollback 事件。
 *
 * 非破坏性——被回退掉的那些历史事件仍留在日志里，可以再回退到它们。
 */
export function restoreSnapshot(
  root: string,
  name: string,
  snapshot: StateSnapshot,
  label = '回退到历史快照',
): ChangeState {
  const state = loadStateOrThrow(root, name);
  const before = snapshotOf(state);
  state.status = { ...state.status, ...(snapshot.status as Record<ArtifactId, ArtifactStatus>) };
  state.decisions = snapshot.decisions ?? {};
  if (snapshot.progress) state.progress = snapshot.progress;
  saveState(root, state);
  appendEvent(
    getChangeDir(root, name),
    makeEvent('rollback', label, before, snapshotOf(state)),
  );
  return state;
}

/**
 * 定位需求的目录（先查 active，再查 archived 的月份子目录）。
 * 找不到返回 null——归档后的需求依然可以被可视化控制台读取。
 */
export function resolveChangeDir(root: string, name: string): string | null {
  const active = getChangeDir(root, name);
  if (fs.existsSync(active)) return active;
  return findArchivedChangeDir(root, name);
}

/** 列出 wpw/active/ 下所有需求名 */
export function listChanges(root: string): string[] {
  const dir = getActiveDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * 检查需求名是否全局存在（active 和 archived 都检查）
 *
 * 需求名是全局唯一标识，无论活跃还是归档，都不能重名。
 * 归档需求按月份分子目录存储，但名字在全局范围内仍需唯一。
 */
export function changeNameExists(root: string, name: string): boolean {
  // 检查 active
  if (fs.existsSync(path.join(getActiveDir(root), name))) {
    return true;
  }

  // 检查 archived 下所有月份目录
  const archivedDir = getArchivedDir(root);
  if (fs.existsSync(archivedDir)) {
    const monthDirs = fs
      .readdirSync(archivedDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const month of monthDirs) {
      if (fs.existsSync(path.join(archivedDir, month, name))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 列出所有归档需求名（遍历 archived 下所有月份子目录）
 *
 * 返回需求名列表（不含月份目录名，只取最终的需求目录名）。
 */
export function listArchivedChanges(root: string): string[] {
  const archivedDir = getArchivedDir(root);
  if (!fs.existsSync(archivedDir)) return [];

  const names: string[] = [];
  const monthDirs = fs
    .readdirSync(archivedDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const month of monthDirs) {
    const monthPath = path.join(archivedDir, month);
    const entries = fs.readdirSync(monthPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        names.push(entry.name);
      }
    }
  }

  return names.sort();
}

/**
 * 查找归档需求的目录路径
 *
 * 归档需求按月份分子目录存储，需要遍历查找。
 * 返回绝对路径，找不到返回 null。
 */
export function findArchivedChangeDir(root: string, name: string): string | null {
  const archivedDir = getArchivedDir(root);
  if (!fs.existsSync(archivedDir)) return null;

  const monthDirs = fs
    .readdirSync(archivedDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const month of monthDirs) {
    const candidate = path.join(archivedDir, month, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export interface ArchiveResult {
  /** 归档目标绝对路径 */
  dest: string;
  /** 相对工作区根的路径（展示用） */
  relative: string;
  /** 归档月份 YYYY-MM */
  month: string;
}

/**
 * 把 active 下的需求目录整体移入 wpw/archived/YYYY-MM/，并补一条 archive 事件。
 *
 * `wpw archive` 与 viz 控制台的归档按钮共用此实现，避免两处各写一遍搬运逻辑。
 * 调用方负责在搬运前校验需求是否存在。
 */
export function archiveChange(root: string, name: string): ArchiveResult {
  const src = getChangeDir(root, name);
  if (!fs.existsSync(src)) {
    throw new Error(`需求不存在: ${name}`);
  }

  const state = loadState(root, name);
  const month = new Date().toISOString().slice(0, 7);
  const destDir = path.join(getArchivedDir(root), month);
  const dest = path.join(destDir, name);

  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(src, dest);

  // 事件日志随目录一起搬走，这里往新位置补一条归档事件（保留归档前的状态快照）
  appendEvent(
    dest,
    makeEvent('archive', `归档到 ${month}`, state ? snapshotOf(state) : undefined, undefined, {
      month,
    }),
  );

  return { dest, relative: path.relative(root, dest), month };
}

/**
 * 读取归档需求的状态
 *
 * 从 archived 目录下的月份子目录中查找并读取 .wpw.yaml。
 */
export function loadArchivedState(root: string, name: string): ChangeState | null {
  const dir = findArchivedChangeDir(root, name);
  if (!dir) return null;

  const statePath = path.join(dir, '.wpw.yaml');
  if (!fs.existsSync(statePath)) return null;

  try {
    const content = fs.readFileSync(statePath, 'utf8');
    return yaml.load(content) as ChangeState;
  } catch {
    return null;
  }
}
