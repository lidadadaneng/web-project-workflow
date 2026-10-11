<template>
  <el-drawer
    :model-value="visible"
    :title="`${change.name} · ${def?.label ?? ''} ${def?.name ?? ''}`"
    size="600px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="def">
      <el-tabs v-model="tab" class="coop-tabs">
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
              <el-tag size="small" :type="stateTag">{{ state }}</el-tag>
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
            <el-button type="primary" :disabled="!decision.trim()" @click="onDecide">记录拍板</el-button>
          </div>
          <el-alert
            v-else-if="def.id === 'explore' && change.exploreDecision"
            :title="`已拍板：${change.exploreDecision}`"
            type="success"
            :closable="false"
            style="margin-bottom: 16px"
          />

          <template v-if="def.id === 'apply' && planTasks.length">
            <h4>实施任务（{{ doneCount }}/{{ planTasks.length }}）</h4>
            <div v-for="t in planTasks" :key="t.id" class="task-row" @click="store.toggleTask(t.id)">
              <el-checkbox :model-value="t.state === 'done'" @click.stop @change="store.toggleTask(t.id)" />
              <span :class="{ 'task-done': t.state === 'done' }">{{ t.title }}</span>
            </div>
          </template>

          <div class="actions">
            <el-button v-if="state === 'pending'" type="primary" :disabled="!check.canProceed" @click="mark('done')">
              标记完成（done）
            </el-button>
            <el-button v-if="state === 'pending' && def.skippable" :disabled="!check.canProceed" @click="mark('skipped')">
              跳过此阶段
            </el-button>
            <el-button v-if="state === 'done'" @click="mark('pending')">重置为 pending</el-button>
            <el-button v-if="state === 'skipped'" @click="mark('pending')">取消跳过</el-button>
          </div>
        </el-tab-pane>

        <!-- ================= AI 对话 ================= -->
        <el-tab-pane label="AI 对话" name="chat">
          <div class="chat-panel">
            <div ref="msgListRef" class="msg-list">
              <div v-for="(m, i) in messages" :key="i" class="msg" :class="m.role">
                <div class="bubble">
                  {{ m.content }}<span v-if="m.streaming" class="caret">▍</span>
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
          <div class="doc-bar">
            <el-select v-model="viewVersion" size="small" style="width: 200px">
              <el-option
                v-for="v in doc.versions"
                :key="v.v"
                :value="v.v"
                :label="`v${v.v} · ${v.note}${v.v === doc.versions[doc.current].v ? '（当前）' : ''}`"
              />
            </el-select>
            <el-button
              v-if="viewVersion !== doc.versions[doc.current].v"
              size="small"
              type="warning"
              plain
              @click="onRevertDoc"
            >回退到此版本</el-button>
            <span class="muted">共 {{ doc.versions.length }} 个版本</span>
          </div>
          <div class="doc-body">
            <MarkdownView :source="viewContent" />
          </div>
        </el-tab-pane>

        <!-- ================= 历史回溯 ================= -->
        <el-tab-pane label="历史回溯" name="history">
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
          <el-empty v-else description="暂无历史记录" :image-size="60" />
        </el-tab-pane>
      </el-tabs>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { PHASE_DEFS, useWorkflowStore, type PhaseCheck, type HistoryEvent } from '@/store/workflow'
import { useAssistantStore } from '@/store/assistant'
import MarkdownView from '@/components/MarkdownView.vue'
import type { ChangeItem, ChangeDetail, PhaseState } from '@/api'

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
watch(() => props.visible, (v) => { if (v) tab.value = props.initialTab ?? 'action' })

const decision = ref('')

const def = computed(() => PHASE_DEFS.find((p) => p.id === props.phaseId))
const state = computed<PhaseState>(() => props.change.phases[props.phaseId] ?? 'pending')
const check = computed<PhaseCheck>(() => store.checkPhase(props.change, props.phaseId))
const missingNames = computed(() => check.value.missing.map(labelOf).join('、'))
const labelOf = (id: string) => PHASE_DEFS.find((p) => p.id === id)?.label ?? id

const stateTag = computed(() => ({ done: 'success', pending: 'info', skipped: 'warning' })[state.value] as 'success' | 'info' | 'warning')

const isDetailChange = computed(() => props.detail?.name === props.change.name)
const planTasks = computed(() => (isDetailChange.value ? props.detail!.planTasks : []))
const doneCount = computed(() => planTasks.value.filter((t) => t.state === 'done').length)

/* ---------- AI 对话 ---------- */
const input = ref('')
const msgListRef = ref<HTMLElement>()
const messages = computed(() => assistant.chatOf(props.change.name, props.phaseId))
const quickChips = ['精简文档', '补充一个异常场景', '回退上一版']

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
const viewVersion = ref(1)
watch(() => [props.change.name, props.phaseId, doc.value.current], () => {
  viewVersion.value = doc.value.versions[doc.value.current]?.v ?? 1
}, { immediate: true })
const viewContent = computed(() => doc.value.versions.find((v) => v.v === viewVersion.value)?.content ?? '')

function onRevertDoc() {
  assistant.revertDoc(props.change.name, props.phaseId, viewVersion.value)
  ElMessage.success(`已回退到 v${viewVersion.value}`)
}

/* ---------- 历史回溯 ---------- */
const events = computed(() => store.historyOf(props.change.name))

const formatTs = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function evTagType(t: HistoryEvent['type']) {
  return ({ done: 'success', skip: 'info', reset: 'warning', decide: 'primary', task: 'primary', revise: 'warning', rollback: 'danger' })[t] as
    'success' | 'info' | 'warning' | 'primary' | 'danger'
}

async function onRollback(ev: HistoryEvent) {
  await ElMessageBox.confirm(
    `将「${props.change.name}」的阶段状态回退到「${ev.label}」时刻，之后的推进会被撤销（历史记录保留）。`,
    '确认回退',
    { type: 'warning', confirmButtonText: '回退', cancelButtonText: '取消' },
  )
  store.rollbackTo(ev.id)
  ElMessage.success('已回退')
}

/* ---------- 阶段操作 ---------- */
function mark(s: PhaseState) {
  store.setPhase(props.change.name, props.phaseId, s)
  ElMessage.success(`${def.value?.label} 已标记为 ${s}`)
}

function onDecide() {
  store.decide(props.change.name, decision.value.trim())
  ElMessage.success('已记录拍板')
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
.caret { animation: blink 0.9s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
.chips { display: flex; gap: 8px; margin: 10px 0; }
.chip { cursor: pointer; }
.input-row { display: flex; gap: 10px; align-items: flex-end; }

/* 阶段文档 */
.doc-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.doc-body { border: 1px solid #e5e6eb; border-radius: 8px; padding: 4px 16px; }

/* 历史回溯 */
.history-line { padding-left: 4px; margin-top: 8px; }
.ev-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.muted { color: #a8abb2; font-size: 12px; }
</style>
