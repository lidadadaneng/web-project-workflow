/**
 * 工作流前端状态仓库（一期 mock）。
 *
 * 门禁判定规则与 CLI 内置 Schema（src/schema/six-phase.ts）保持一致：
 *   - dependsOn：强前置必须 done
 *   - optionalDeps：弱依赖不阻塞，但产生警告（如 explore 完成未拍板）
 *   - skippable：explore / testplan 可跳过
 *   - apply：强依赖 plan；testplan 未完成时给质量风险提示
 *
 * 状态变更持久化到 localStorage（二期切换为 POST /api/... 由 CLI 写回 .wpw.yaml）。
 */
import { computed, reactive, ref } from 'vue'
import { getChanges, getChangeDetail, type ChangeItem, type ChangeDetail, type PhaseState } from '@/api'

export interface PhaseDef {
  id: string
  name: string
  label: string
  dependsOn: string[]
  optionalDeps: string[]
  skippable?: boolean
  command: string
}

export const PHASE_DEFS: PhaseDef[] = [
  { id: 'brd', name: '业务需求文档', label: 'BRD', dependsOn: [], optionalDeps: [], command: '/wpw:brd' },
  { id: 'prd', name: '产品需求文档', label: 'PRD', dependsOn: ['brd'], optionalDeps: [], command: '/wpw:prd' },
  { id: 'explore', name: '技术方案探索', label: 'Explore', dependsOn: ['prd'], optionalDeps: [], skippable: true, command: '/wpw:explore' },
  { id: 'design', name: '技术方案设计', label: 'Design', dependsOn: ['prd'], optionalDeps: ['explore'], command: '/wpw:design' },
  { id: 'plan', name: '开发计划', label: 'Plan', dependsOn: ['design'], optionalDeps: [], command: '/wpw:plan' },
  { id: 'testplan', name: '测试方案', label: 'Test', dependsOn: ['design', 'plan'], optionalDeps: [], skippable: true, command: '/wpw:test' },
  { id: 'apply', name: '编码实施', label: 'Apply', dependsOn: ['plan'], optionalDeps: ['testplan'], command: '/wpw:apply' },
]

export interface PhaseCheck {
  canProceed: boolean
  missing: string[]
  warnings: string[]
}

/** 历史事件：每次状态变更都带快照，支持回退到任意节点（二期由 CLI 事件日志提供） */
export interface HistoryEvent {
  id: string
  ts: number
  change: string
  type: 'done' | 'skip' | 'reset' | 'decide' | 'task' | 'revise' | 'rollback'
  label: string
  snapshot: { phases: Record<string, PhaseState>; exploreDecision?: string }
}

const STORAGE_KEY = 'wpw-viz-workflow-state'

const changes = ref<ChangeItem[]>([])
const detail = ref<ChangeDetail | null>(null)
const loaded = ref(false)
const history = ref<HistoryEvent[]>([])

function snapshotOf(c: ChangeItem): HistoryEvent['snapshot'] {
  return JSON.parse(JSON.stringify({ phases: c.phases, exploreDecision: c.exploreDecision }))
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ changes: changes.value, detail: detail.value, history: history.value }))
}

function restore(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return false
  try {
    const saved = JSON.parse(raw)
    changes.value = saved.changes
    detail.value = saved.detail
    history.value = saved.history ?? []
    return true
  } catch {
    return false
  }
}

export function useWorkflowStore() {
  async function load(force = false) {
    if (loaded.value && !force) return
    const [mockChanges, mockDetail] = await Promise.all([getChanges(), getChangeDetail()])
    if (!restore()) {
      changes.value = mockChanges
      detail.value = mockDetail
    } else {
      // 状态以本地持久化为准，mock 新增的展示字段（description/tag 等）按名合并补齐
      changes.value = changes.value.map((c) => ({ ...mockChanges.find((m) => m.name === c.name), ...c }))
    }
    if (!history.value.length) seedHistory()
    loaded.value = true
  }

  /** 首次进入时按当前阶段状态反推一条可信的演进历史（mock 演示用） */
  function seedHistory() {
    const seq: HistoryEvent[] = []
    for (const c of changes.value) {
      const phases: Record<string, PhaseState> = Object.fromEntries(PHASE_DEFS.map((p) => [p.id, 'pending']))
      let decided: string | undefined
      let i = 0
      for (const def of PHASE_DEFS) {
        const st = c.phases[def.id]
        if (st !== 'done' && st !== 'skipped') continue
        phases[def.id] = st
        const ts = c.createdAt + ++i * 26 * 3600 * 1000 // 每个阶段约间隔一天
        seq.push({
          id: `${c.name}-${def.id}-${ts}`,
          ts,
          change: c.name,
          type: st === 'done' ? 'done' : 'skip',
          label: st === 'done' ? `完成 ${def.label}` : `跳过 ${def.label}`,
          snapshot: JSON.parse(JSON.stringify({ phases, exploreDecision: decided })),
        })
        if (def.id === 'explore' && st === 'done' && c.exploreDecision) {
          decided = c.exploreDecision
          seq.push({
            id: `${c.name}-decide-${ts + 1}`,
            ts: ts + 3600 * 1000,
            change: c.name,
            type: 'decide',
            label: `Explore 拍板：${decided}`,
            snapshot: JSON.parse(JSON.stringify({ phases, exploreDecision: decided })),
          })
        }
      }
    }
    history.value = seq.sort((a, b) => a.ts - b.ts)
    persist()
  }

  function find(name: string) {
    return changes.value.find((c) => c.name === name)
  }

  /** 依赖检查：镜像 CLI check 命令的判定规则 */
  function checkPhase(change: ChangeItem, phaseId: string): PhaseCheck {
    const def = PHASE_DEFS.find((p) => p.id === phaseId)!
    const missing = def.dependsOn.filter((d) => change.phases[d] !== 'done')
    const warnings: string[] = []
    if (phaseId === 'design' && change.phases.explore === 'done' && !change.exploreDecision) {
      warnings.push('Explore 已完成但未记录选定方案，请先拍板或明确跳过')
    }
    if (phaseId === 'apply' && change.phases.testplan !== 'done') {
      warnings.push('Test 未完成：Apply 将缺少测试用例驱动，存在质量风险')
    }
    return { canProceed: missing.length === 0, missing, warnings }
  }

  /** 下一个可推进阶段：主链顺序中首个 pending 且强前置已满足的阶段 */
  function nextActionable(change: ChangeItem): string | null {
    for (const def of PHASE_DEFS) {
      if (change.phases[def.id] === 'pending' && checkPhase(change, def.id).canProceed) {
        return def.id
      }
    }
    return null
  }

  /** 记录一条历史事件（快照取变更后的状态） */
  function recordEvent(changeName: string, type: HistoryEvent['type'], label: string) {
    const c = find(changeName)
    if (!c) return
    history.value.push({
      id: `${changeName}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      change: changeName,
      type,
      label,
      snapshot: snapshotOf(c),
    })
    persist()
  }

  /** 回退到某条历史事件的快照，并记录回溯动作本身 */
  function rollbackTo(eventId: string) {
    const ev = history.value.find((e) => e.id === eventId)
    if (!ev) return
    const c = find(ev.change)
    if (!c) return
    c.phases = JSON.parse(JSON.stringify(ev.snapshot.phases))
    if (ev.snapshot.exploreDecision) c.exploreDecision = ev.snapshot.exploreDecision
    else delete c.exploreDecision
    if (detail.value?.name === ev.change) {
      detail.value.phases = JSON.parse(JSON.stringify(ev.snapshot.phases))
    }
    recordEvent(ev.change, 'rollback', `回退到「${ev.label}」`)
    persist()
  }

  function historyOf(changeName: string) {
    return history.value.filter((e) => e.change === changeName).sort((a, b) => a.ts - b.ts)
  }

  function setPhase(changeName: string, phaseId: string, state: PhaseState) {
    const c = find(changeName)
    if (!c) return
    c.phases[phaseId] = state
    if (detail.value?.name === changeName) detail.value.phases[phaseId] = state
    const def = PHASE_DEFS.find((p) => p.id === phaseId)
    const type = state === 'done' ? 'done' : state === 'skipped' ? 'skip' : 'reset'
    const verb = state === 'done' ? '完成' : state === 'skipped' ? '跳过' : '重置'
    recordEvent(changeName, type, `${verb} ${def?.label ?? phaseId}`)
    persist()
  }

  function decide(changeName: string, option: string) {
    const c = find(changeName)
    if (!c) return
    c.exploreDecision = option
    recordEvent(changeName, 'decide', `Explore 拍板：${option}`)
    persist()
  }

  function toggleTask(taskId: string) {
    if (!detail.value) return
    const t = detail.value.planTasks.find((x) => x.id === taskId)
    if (!t) return
    t.state = t.state === 'done' ? 'pending' : 'done'
    const done = detail.value.planTasks.filter((x) => x.state === 'done').length
    detail.value.tasks.done = done
    const c = find(detail.value.name)
    if (c) c.tasks.done = done
    recordEvent(detail.value.name, 'task', `${t.state === 'done' ? '勾选' : '取消勾选'}任务「${t.title}」`)
    persist()
  }

  return {
    changes,
    detail,
    history,
    loaded: computed(() => loaded.value),
    load,
    find,
    checkPhase,
    nextActionable,
    setPhase,
    decide,
    toggleTask,
    recordEvent,
    rollbackTo,
    historyOf,
  }
}
