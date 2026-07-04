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
