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

const STORAGE_KEY = 'wpw-viz-workflow-state'

const changes = ref<ChangeItem[]>([])
const detail = ref<ChangeDetail | null>(null)
const loaded = ref(false)

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ changes: changes.value, detail: detail.value }))
}

function restore(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return false
  try {
    const saved = JSON.parse(raw)
    changes.value = saved.changes
    detail.value = saved.detail
    return true
  } catch {
    return false
  }
}

export function useWorkflowStore() {
  async function load(force = false) {
    if (loaded.value && !force) return
    if (!restore()) {
      ;[changes.value, detail.value] = await Promise.all([getChanges(), getChangeDetail()])
    }
    loaded.value = true
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

  function setPhase(changeName: string, phaseId: string, state: PhaseState) {
    const c = find(changeName)
    if (!c) return
    c.phases[phaseId] = state
    if (detail.value?.name === changeName) detail.value.phases[phaseId] = state
    persist()
  }

  function decide(changeName: string, option: string) {
    const c = find(changeName)
    if (!c) return
    c.exploreDecision = option
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
    persist()
  }

  return {
    changes,
    detail,
    loaded: computed(() => loaded.value),
    load,
    find,
    checkPhase,
    nextActionable,
    setPhase,
    decide,
    toggleTask,
  }
}
