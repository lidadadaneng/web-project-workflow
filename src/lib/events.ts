/**
 * 工作流事件日志（append-only JSONL）。
 *
 * 每个需求一个 `.wpw-events.jsonl`，位于该需求的目录下（active 或 archived 均可）。
 * 每次状态变更（推进阶段 / 拍板 / 任务勾选 / 制品写入 / 归档 / 回退）追加一行，
 * 并带上变更前后的状态快照——这是「历史回溯 / 回退到任意节点」的数据来源。
 *
 * 只追加、不重写：即使回退也只是再记一条 rollback 事件，历史本身永不丢失。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ChangeState } from './state';

export type WorkflowEventType =
  | 'create' // 需求创建
  | 'phase' // 阶段状态变更（done / skipped / pending）
  | 'decide' // explore 拍板
  | 'task' // Plan 任务勾选
  | 'doc' // 阶段制品写入 / 版本回退
  | 'archive' // 归档
  | 'rollback'; // 回退到某条历史

/** 快照：可完整还原变更前的状态 */
export interface StateSnapshot {
  status: Record<string, string>;
  decisions: ChangeState['decisions'];
  progress: ChangeState['progress'];
}

export interface WorkflowEvent {
  id: string;
  ts: number;
  type: WorkflowEventType;
  label: string;
  /** 变更前快照（create 事件没有） */
  before?: StateSnapshot;
  /** 变更后快照 */
  after?: StateSnapshot;
  /** 附加信息（如任务 id、文档版本号） */
  meta?: Record<string, unknown>;
}

export const EVENTS_FILE = '.wpw-events.jsonl';

export function getEventsPath(changeDir: string): string {
  return path.join(changeDir, EVENTS_FILE);
}

/** 从 ChangeState 提取快照（深拷贝，避免后续写入污染快照） */
export function snapshotOf(state: Pick<ChangeState, 'status' | 'decisions' | 'progress'>): StateSnapshot {
  return JSON.parse(
    JSON.stringify({
      status: state.status,
      decisions: state.decisions ?? {},
      progress: state.progress,
    }),
  ) as StateSnapshot;
}

/** 构造事件（自动补 id / ts） */
export function makeEvent(
  type: WorkflowEventType,
  label: string,
  before?: StateSnapshot,
  after?: StateSnapshot,
  meta?: Record<string, unknown>,
): WorkflowEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    type,
    label,
    before,
    after,
    meta,
  };
}

/**
 * 追加一条事件。
 *
 * 写失败不抛错：事件日志是辅助能力，不应阻断主流程（状态已落盘）。
 */
export function appendEvent(changeDir: string, event: WorkflowEvent): void {
  try {
    fs.mkdirSync(changeDir, { recursive: true });
    fs.appendFileSync(getEventsPath(changeDir), JSON.stringify(event) + '\n', 'utf8');
  } catch (e) {
    console.warn(`[events] 写入事件日志失败: ${(e as Error).message}`);
  }
}

/**
 * 读取事件日志，按时间升序返回。
 *
 * 解析失败的行直接跳过（与 JsonlGraphStore.load 同策略），
 * 保证日志被手工编辑坏掉时仍能读取其余记录。
 */
export function readEvents(changeDir: string): WorkflowEvent[] {
  const p = getEventsPath(changeDir);
  if (!fs.existsSync(p)) return [];

  const events: WorkflowEvent[] = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as WorkflowEvent;
      if (obj && typeof obj.id === 'string' && typeof obj.ts === 'number') {
        events.push(obj);
      }
    } catch {
      // 跳过损坏行
    }
  }
  return events.sort((a, b) => a.ts - b.ts);
}