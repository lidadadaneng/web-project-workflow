/**
 * .wpw.yaml 状态管理。
 *
 * 每个需求一个 .wpw.yaml，记录各阶段 status、拍板决策、任务进度。
 * 依赖检查引擎（dependency.ts）消费此状态。
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
  state.status[id] = status;
  saveState(root, state);
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
    state.decisions.explore = {
      chosenOption: option,
      chosenAt: new Date().toISOString(),
    };
  } else {
    throw new Error(`阶段 ${id} 不支持 decision 记录`);
  }
  saveState(root, state);
  return state;
}

export function setProgress(
  root: string,
  name: string,
  totalTasks: number,
  completedTasks: number,
): ChangeState {
  const state = loadStateOrThrow(root, name);
  state.progress.totalTasks = totalTasks;
  state.progress.completedTasks = completedTasks;
  saveState(root, state);
  return state;
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
