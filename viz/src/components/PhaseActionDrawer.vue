<template>
  <el-drawer
    :model-value="visible"
    :title="`${change.name} · ${def?.label ?? ''} ${def?.name ?? ''}`"
    size="600px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="def">
      <el-tabs v-model="tab" class="coop-tabs" @tab-change="onTabChange">
        <!-- ================= 阶段操作 ================= -->
        <el-tab-pane label="阶段操作" name="action">
          <el-result
            v-if="!check.canProceed"
            icon="error"
            title="前置依赖未满足"
            :sub-title="`缺少：${missingNames}`"
            style="padding: 16px 0"
          />
          <el-alert
            v-for="w in check.warnings"
            :key="w"
            :title="w"
            type="warning"
            :closable="false"
            style="margin-bottom: 12px"
          />
          <el-alert
            v-if="check.canProceed && state === 'pending'"
            title="依赖检查通过，可以开始此阶段"
            type="success"
            :closable="false"
            style="margin-bottom: 16px"
          />

          <el-descriptions :column="1" border size="small" style="margin-bottom: 16px">
            <el-descriptions-item label="当前状态">
              <el-tag size="small" :type="stateTag">{{ stateLabel }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="强依赖">
              {{ def.dependsOn.length ? def.dependsOn.map(labelOf).join('、') : '无' }}
            </el-descriptions-item>
            <el-descriptions-item v-if="def.optionalDeps.length" label="弱依赖">
              {{ def.optionalDeps.map(labelOf).join('、') }}
            </el-descriptions-item>
          </el-descriptions>

          <div v-if="state === 'pending' && check.canProceed" class="cmd-guide">
            <div class="cmd-label">在 IDE 中执行（内容由 AI 层生成，状态由 CLI 写入）：</div>
            <div class="cmd-box mono">
              {{ def.command }} {{ change.name }}
              <el-button size="small" text icon="CopyDocument" @click="copyCmd" />
            </div>
          </div>

          <div v-if="def.id === 'explore' && state === 'done' && !change.exploreDecision" class="decide-box">
            <el-input v-model="decision" placeholder="输入选定方案，如 option-a-jwt" />
            <el-button type="primary" :disabled="!decision.trim() || busy" @click="onDecide">记录拍板</el-button>
          </div>
          <el-alert
            v-else-if="def.id === 'explore' && change.exploreDecision"
            :title="`已拍板：${change.exploreDecision}`"
            type="success"
            :closable="false"
            style="margin-bottom: 16px"
          />

          <!-- apply 没有独立落盘状态：由 Plan 任务完成度派生 -->
          <template v-if="def.id === 'apply'">
            <el-alert
              v-if="!planTasks.length"
              title="尚未生成 Plan 制品，Apply 无从派生进度"
              type="info"
              :closable="false"
              style="margin-bottom: 16px"
            />
            <template v-else>
              <h4>实施任务（{{ doneCount }}/{{ planTasks.length }}）</h4>
              <div
                v-for="t in planTasks"
                :key="t.id"
                class="task-row"
                @click="onToggleTask(t.id, t.state)"
              >
                <el-checkbox :model-value="t.state === 'done'" @click.stop @change="onToggleTask(t.id, t.state)" />
                <span :class="{ 'task-done': t.state === 'done' }">{{ t.title }}</span>
              </div>
              <el-alert
                :title="state === 'done'
                  ? 'Plan 任务已全部完成，Apply 阶段判定为完成'
                  : '勾完全部 Plan 任务后，Apply 自动判定为完成（状态由任务进度派生，无需手动标记）'"
                :type="state === 'done' ? 'success' : 'info'"
                :closable="false"
                style="margin-top: 16px"
              />
            </template>
          </template>

          <div v-else class="actions">
            <el-button v-if="state === 'pending'" type="primary" :disabled="!check.canProceed || busy" @click="mark('done')">
              标记完成（done）
            </el-button>
            <el-button v-if="state === 'pending' && def.skippable" :disabled="!check.canProceed || busy" @click="mark('skipped')">
              跳过此阶段
            </el-button>
            <el-button v-if="state === 'done'" :disabled="busy" @click="mark('pending')">重置为 pending</el-button>
            <el-button v-if="state === 'skipped'" :disabled="busy" @click="mark('pending')">取消跳过</el-button>
          </div>
        </el-tab-pane>

        <!-- ================= AI 对话 ================= -->
        <el-tab-pane label="AI 对话" name="chat">
          <div class="chat-panel">
            <div ref="msgListRef" class="msg-list">
              <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
                <div class="bubble" :class="{ 'bubble-error': m.error }">
                  {{ m.content }}<span v-if="m.streaming" class="caret">▍</span>
                  <div v-if="m.contextSummary" class="ctx-tag">上下文：{{ m.contextSummary }}</div>
                </div>
              </div>
              <el-empty v-if="!messages.length" description="开始与本阶段的 AI 助手对话" :image-size="60" />
            </div>
            <div class="chips">
              <el-tag
                v-for="c in quickChips"
                :key="c"
                class="chip"
                effect="plain"
                @click="sendChat(c)"
              >{{ c }}</el-tag>
            </div>
            <div class="input-row">
              <el-input
                v-model="input"
                type="textarea"
                :rows="2"
                placeholder="输入指令，Enter 发送（Shift+Enter 换行）"
                @keydown.enter.exact.prevent="sendChat(input)"
              />
              <el-button type="primary" :disabled="!input.trim()" @click="sendChat(input)">发送</el-button>
            </div>
          </div>
        </el-tab-pane>

        <!-- ================= 阶段文档 ================= -->
        <el-tab-pane label="阶段文档" name="doc">
          <div v-loading="docLoading">
            <el-empty
              v-if="!docExists"
              :description="`${doc.file || '制品'} 尚未生成——可由 AI 层（${def.command}）产出，或用下方编辑框直接写入`"
              :image-size="70"
            />
            <template v-else>
              <div class="doc-bar">
                <el-select v-model="viewVersion" size="small" style="width: 240px">
                  <el-option
                    v-for="v in docVersions"
                    :key="v.v"
                    :value="v.v"
                    :label="`v${v.v} · ${v.note}${v.v === docCurrent ? '（当前）' : ''}`"
                  />
                </el-select>
                <el-button
                  v-if="viewVersion !== docCurrent"
                  size="small"
                  type="warning"
                  plain
                  @click="onRevertDoc"
                >回退到此版本</el-button>
                <span class="muted">共 {{ docVersions.length }} 个版本</span>
              </div>
              <div class="doc-body">
                <MarkdownView :source="viewContent" />
              </div>
            </template>

            <!-- 直接编辑：写入即产生新版本（不依赖 AI 层） -->
            <el-divider />
            <div class="doc-edit">
              <div class="doc-edit-label">
                直接编辑（保存后写入 <span class="mono">{{ doc.file || docFileName }}</span> 并生成新版本）
              </div>
              <el-input v-model="draft" type="textarea" :rows="8" placeholder="在此写 Markdown，保存后即为新版本" />
              <div class="doc-edit-bar">
                <el-input v-model="note" size="small" placeholder="版本说明（如：初稿 / 补充异常场景）" style="width: 260px" />
                <el-button size="small" type="primary" :disabled="!draft.trim() || busy" @click="onSaveDoc">
                  保存为新版本
                </el-button>
                <span class="muted">当前内容会先存为历史版本，随时可回退</span>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- ================= 历史回溯 ================= -->
        <el-tab-pane label="历史回溯" name="history">
          <div v-loading="historyLoading">
            <el-timeline v-if="events.length" class="history-line">
              <el-timeline-item
                v-for="(ev, i) in events"
                :key="ev.id"
                :timestamp="formatTs(ev.ts)"
                :type="evTagType(ev.type)"
                :hollow="ev.type === 'rollback'"
              >
                <div class="ev-row">
                  <span>{{ ev.label }}</span>
                  <el-button
                    v-if="i < events.length - 1"
                    size="small"
                    text
                    type="primary"
                    @click="onRollback(ev)"
                  >回退到此</el-button>
                </div>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="暂无历史记录（事件日志 .wpw-events.jsonl）" :image-size="60" />
          </div>
        </el-tab-pane>
      </el-tabs>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { PHASE_DEFS, useWorkflowStore, type PhaseCheck } from '@/store/workflow'
import { useAssistantStore } from '@/store/assistant'
import MarkdownView from '@/components/MarkdownView.vue'
import type { ChangeItem, ChangeDetail, HistoryEvent, PhaseState } from '@/api'

const props = defineProps<{
  visible: boolean
  change: ChangeItem
  phaseId: string
  detail: ChangeDetail | null
  initialTab?: string
}>()
const emit = defineEmits<{ 'update:visible': [v: boolean] }>()

const store = useWorkflowStore()
const assistant = useAssistantStore()

const tab = ref(props.initialTab ?? 'action')
const busy = ref(false)
const decision = ref('')
const historyLoading = ref(false)

const def = computed(() => PHASE_DEFS.find((p) => p.id === props.phaseId))
const state = computed<PhaseState>(() => props.change.phases[props.phaseId] ?? 'pending')
const check = computed<PhaseCheck>(() => store.checkPhase(props.change, props.phaseId))
const missingNames = computed(() => check.value.missing.map(labelOf).join('、'))
const labelOf = (id: string) => PHASE_DEFS.find((p) => p.id === id)?.label ?? id

const STATE_LABELS: Record<string, string> = {
  pending: 'pending（未开始）',
  outlining: 'outlining（大纲生成中）',
  confirmed: 'confirmed（大纲已确认）',
  done: 'done（已落盘）',
  skipped: 'skipped（已跳过）',
}
const stateLabel = computed(() => STATE_LABELS[state.value] ?? state.value)
const stateTag = computed(() => {
  const map: Record<string, 'success' | 'info' | 'warning' | 'primary'> = {
    done: 'success',
    pending: 'info',
    skipped: 'warning',
    outlining: 'primary',
    confirmed: 'primary',
  }
  return map[state.value] ?? 'info'
})

const isDetailChange = computed(() => props.detail?.name === props.change.name)
const planTasks = computed(() => (isDetailChange.value ? props.detail!.planTasks : []))
const doneCount = computed(() => planTasks.value.filter((t) => t.state === 'done').length)

/* ---------- 打开抽屉时装载真实数据 ---------- */
watch(
  () => [props.visible, props.change.name, props.phaseId] as const,
  async ([visible]) => {
    if (!visible) return
    tab.value = props.initialTab ?? 'action'
    decision.value = props.change.exploreDecision ?? ''
    assistant.clearChat(props.change.name, props.phaseId)
    await Promise.all([
      assistant.loadDoc(props.change.name, props.phaseId, true).catch(() => undefined),
      loadHistory(),
      store.loadDetail(props.change.name).catch(() => undefined),
    ])
  },
  { immediate: true },
)

function onTabChange(name: string) {
  if (name === 'doc') assistant.loadDoc(props.change.name, props.phaseId).catch(() => undefined)
  if (name === 'history') loadHistory()
}

/* ---------- AI 对话 ---------- */
const input = ref('')
const msgListRef = ref<HTMLElement>()
const messages = computed(() => assistant.chatOf(props.change.name, props.phaseId))
const quickChips = ['精简文档', '补充一个异常场景', '回退上一版', '这个阶段还缺什么？']

function sendChat(text: string) {
  const t = text.trim()
  if (!t) return
  assistant.send(props.change.name, props.phaseId, t)
  input.value = ''
  nextTick(scrollBottom)
}

watch(() => messages.value.length, () => nextTick(scrollBottom))
watch(() => messages.value[messages.value.length - 1]?.content, () => scrollBottom())

function scrollBottom() {
  const el = msgListRef.value
  if (el) el.scrollTop = el.scrollHeight
}

/* ---------- 阶段文档 ---------- */
const doc = computed(() => assistant.docOf(props.change.name, props.phaseId))
const docLoading = computed(() => assistant.isLoadingDoc(props.change.name, props.phaseId))
const docExists = computed(() => doc.value.exists || Boolean(doc.value.content))
const docVersions = computed(() => doc.value.index.versions)
const docCurrent = computed(() => doc.value.index.current)

/** 保存失败时兜底展示的文件名（doc.file 为空说明制品还没生成过） */
const docFileName = computed(() => `${def.value?.label ?? props.phaseId}-${props.change.name}.md`)

const viewVersion = ref(1)
watch(
  () => [props.change.name, props.phaseId, docCurrent.value] as const,
  () => {
    viewVersion.value = docCurrent.value || 1
  },
  { immediate: true },
)

/* ---------- 直接编辑制品 ---------- */
const draft = ref('')
const note = ref('')
watch(
  () => [props.change.name, props.phaseId, doc.value.content] as const,
  () => {
    draft.value = doc.value.content
    note.value = ''
  },
  { immediate: true },
)

async function onSaveDoc() {
  busy.value = true
  try {
    await assistant.writeDoc(props.change.name, props.phaseId, draft.value, note.value.trim() || '手工编辑')
    ElMessage.success(`已保存为 v${assistant.docOf(props.change.name, props.phaseId).index.current}`)
    await loadHistory()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    busy.value = false
  }
}
/** 查看历史版本时读的是本地已拉取的当前内容；只有「当前」版本才是文件真实内容 */
const viewContent = computed(() => {
  if (viewVersion.value === docCurrent.value) return doc.value.content
  const note = docVersions.value.find((v) => v.v === viewVersion.value)?.note
  return `${doc.value.content}\n\n<!-- 历史版本仅保留版本条目（v${viewVersion.value}：${note ?? ''}）；回退后主文件将被该版本内容覆盖。 -->`
})

async function onRevertDoc() {
  busy.value = true
  try {
    await assistant.revertDoc(props.change.name, props.phaseId, viewVersion.value)
    ElMessage.success(`已回退到 v${viewVersion.value}`)
    await loadHistory()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    busy.value = false
  }
}

/* ---------- 历史回溯 ---------- */
const events = computed(() => store.historyOf(props.change.name))

async function loadHistory() {
  historyLoading.value = true
  try {
    await store.loadEvents(props.change.name, true)
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    historyLoading.value = false
  }
}

const formatTs = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function evTagType(t: HistoryEvent['type']) {
  const map: Record<HistoryEvent['type'], 'success' | 'info' | 'warning' | 'primary' | 'danger'> = {
    create: 'info',
    phase: 'success',
    decide: 'primary',
    task: 'primary',
    doc: 'warning',
    archive: 'info',
    rollback: 'danger',
  }
  return map[t] ?? 'info'
}

async function onRollback(ev: HistoryEvent) {
  await ElMessageBox.confirm(
    `将「${props.change.name}」的阶段状态回退到「${ev.label}」时刻，之后的推进会被撤销（历史记录保留，可再回退）。`,
    '确认回退',
    { type: 'warning', confirmButtonText: '回退', cancelButtonText: '取消' },
  )
  try {
    await store.rollbackTo(props.change.name, ev.id)
    ElMessage.success('已回退')
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

/* ---------- 阶段操作 ---------- */
async function mark(s: PhaseState) {
  busy.value = true
  try {
    await store.updatePhase(props.change.name, props.phaseId, s)
    ElMessage.success(`${def.value?.label} 已标记为 ${s}`)
    await loadHistory()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    busy.value = false
  }
}

async function onDecide() {
  busy.value = true
  try {
    await store.decide(props.change.name, decision.value.trim())
    ElMessage.success('已记录拍板')
    await loadHistory()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    busy.value = false
  }
}

async function onToggleTask(taskId: string, current: string) {
  try {
    await store.toggleTask(props.change.name, taskId, current)
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

async function copyCmd() {
  await navigator.clipboard.writeText(`${def.value?.command} ${props.change.name}`)
  ElMessage.success('命令已复制')
}
</script>

<style scoped>
.coop-tabs :deep(.el-tabs__item) { font-size: 14px; }

.cmd-guide { margin-bottom: 16px; }
.cmd-label { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.cmd-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-fill-color);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
}
.decide-box { display: flex; gap: 8px; margin-bottom: 16px; }
.task-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; }
.task-done { text-decoration: line-through; color: var(--el-text-color-secondary); }
.actions { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }

/* AI 对话 */
.chat-panel { display: flex; flex-direction: column; height: calc(100vh - 190px); }
.msg-list { flex: 1; overflow-y: auto; padding-right: 4px; }
.msg { display: flex; margin-bottom: 12px; }
.msg.user { justify-content: flex-end; }
.bubble {
  max-width: 85%;
  padding: 9px 13px;
  border-radius: 10px;
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg.assistant .bubble { background: #f2f3f5; color: #1d2129; border-top-left-radius: 2px; }
.msg.user .bubble { background: #165dff; color: #fff; border-top-right-radius: 2px; }
.bubble-error { background: #fef0f0 !important; color: #f56c6c !important; }
.ctx-tag { margin-top: 6px; font-size: 11px; color: #529b2e; }
.caret { animation: blink 0.9s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
.chips { display: flex; gap: 8px; margin: 10px 0; flex-wrap: wrap; }
.chip { cursor: pointer; }
.input-row { display: flex; gap: 10px; align-items: flex-end; }

/* 阶段文档 */
.doc-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.doc-body { border: 1px solid #e5e6eb; border-radius: 8px; padding: 4px 16px; }
.doc-edit-label { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 8px; }
.doc-edit-bar { display: flex; align-items: center; gap: 10px; margin-top: 8px; }

/* 历史回溯 */
.history-line { padding-left: 4px; margin-top: 8px; }
.ev-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.muted { color: #a8abb2; font-size: 12px; }
</style>