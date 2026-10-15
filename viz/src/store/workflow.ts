/**
 * 工作流前端状态仓库（真实后端）。
 *
 * 所有读写都落到 `wpw viz` 服务的 /api，也就是真实的 wpw/active/<name>/.wpw.yaml
 * 与阶段制品文件——不再有 localStorage 影子状态。
 *
 * 门禁判定规则与 CLI 内置 Schema（src/schema/six-phase.ts）保持一致：
 *   - dependsOn：强前置必须 done
 *   - optionalDeps：弱依赖不阻塞，但 explore 完成未拍板会产生警告
 *   - skippable：explore / testplan 可跳过
 *   - apply：强依赖 plan；testplan 未完成时给质量风险提示
 *   - apply 没有独立落盘状态，由 Plan 任务完成度派生（见服务端 deriveApply）
 */
import { computed, reactive, ref } from 'vue'
import {
  archiveChange,
  getChangeDetail,
  getChanges,
  getEvents,
  rollback,
  setDecision,
  setPhase,
  setTaskState,
  type ChangeDetail,
  type ChangeItem,
  type HistoryEvent,
  type PhaseState,
} from '@/api'

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

const changes = ref<ChangeItem[]>([])
const detail = ref<ChangeDetail | null>(null)
const loaded = ref(false)
const loading = ref(false)
const error = ref('')
/** 历史事件按需求缓存，按需从 /events 拉取 */
const eventsByChange = reactive<Record<string, HistoryEvent[]>>({})

export function useWorkflowStore() {
  async function load(force = false) {
    if (loading.value) return
    if (loaded.value && !force) return

    loading.value = true
    error.value = ''
    try {
      changes.value = await getChanges()
      loaded.value = true
    } catch (e) {
      error.value = (e as Error).message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function loadDetail(name: string): Promise<ChangeDetail | null> {
    try {
      detail.value = await getChangeDetail(name)
      return detail.value
    } catch (e) {
      error.value = (e as Error).message
      return null
    }
  }

  async function loadEvents(name: string, force = false): Promise<HistoryEvent[]> {
    if (eventsByChange[name] && !force) return eventsByChange[name]
    eventsByChange[name] = await getEvents(name)
    return eventsByChange[name]
  }

  function historyOf(changeName: string) {
    return eventsByChange[changeName] ?? []
  }

  function find(name: string) {
    return changes.value.find((c) => c.name === name)
  }

  /** 用后端返回的最新状态覆盖本地缓存（写操作后调用，避免整表刷新） */
  function applyUpdated(updated: ChangeItem) {
    const idx = changes.value.findIndex((c) => c.name === updated.name)
    if (idx >= 0) changes.value[idx] = updated
    else changes.value.push(updated)

    if (detail.value?.name === updated.name) {
      detail.value = { ...detail.value, ...updated }
    }
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

  async function updatePhase(changeName: string, phaseId: string, state: PhaseState) {
    applyUpdated(await setPhase(changeName, phaseId, state))
    await loadEvents(changeName, true)
  }

  async function decide(changeName: string, option: string) {
    applyUpdated(await setDecision(changeName, option))
    await loadEvents(changeName, true)
  }

  async function toggleTask(changeName: string, taskId: string, currentState: string) {
    const next = currentState === 'done' ? 'pending' : 'done'
    applyUpdated(await setTaskState(changeName, taskId, next))
    await loadDetail(changeName)
    await loadEvents(changeName, true)
  }

  /** 回退到某条历史事件（服务端按事件快照还原并追加一条 rollback 记录） */
  async function rollbackTo(changeName: string, eventId: string) {
    applyUpdated(await rollback(changeName, eventId))
    await loadDetail(changeName)
    await loadEvents(changeName, true)
  }

  async function archive(changeName: string) {
    const result = await archiveChange(changeName)
    changes.value = changes.value.filter((c) => c.name !== changeName)
    if (detail.value?.name === changeName) detail.value = null
    return result
  }

  return {
    changes,
    detail,
    error,
    loaded: computed(() => loaded.value),
    loading: computed(() => loading.value),
    load,
    loadDetail,
    loadEvents,
    historyOf,
    find,
    checkPhase,
    nextActionable,
    updatePhase,
    decide,
    toggleTask,
    rollbackTo,
    archive,
  }
}