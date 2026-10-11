<template>
  <div class="chat-page">
    <el-card class="page-card">
      <div class="chat-toolbar">
        <el-switch v-model="withContext" active-text="注入项目上下文" />
        <el-switch v-model="compareMode" active-text="双栏对比（纯模型 vs 图谱增强）" />
      </div>
    </el-card>

    <div :class="['chat-cols', { compare: compareMode }]">
      <div v-for="col in columns" :key="col.key" class="chat-col">
        <el-card class="chat-card">
          <template #header>
            <div class="col-head">
              <el-tag :type="col.key === 'augmented' ? 'success' : 'info'" effect="dark" size="small">
                {{ col.key === 'augmented' ? '图谱增强' : '纯模型' }}
              </el-tag>
              <span v-if="col.key === 'augmented' && lastContext" class="ctx-info">
                注入上下文 ≈ {{ lastContext.contextTokens }} tokens
              </span>
            </div>
          </template>

          <div class="messages" :ref="(el) => setMsgRef(col.key, el)">
            <div v-for="(m, i) in col.messages" :key="i" :class="['msg', m.role]">
              <div class="bubble">
                <MarkdownView :source="m.content" />
                <div v-if="m.contextSummary" class="ctx-tag">
                  <el-icon><Connection /></el-icon> {{ m.contextSummary }}
                </div>
              </div>
            </div>
            <div v-if="col.streaming" class="msg assistant">
              <div class="bubble"><span class="cursor">▍</span></div>
            </div>
          </div>
        </el-card>
      </div>
    </div>

    <div class="input-bar">
      <el-input
        v-model="input"
        type="textarea"
        :rows="2"
        placeholder="向 wpw 提问，试试「图谱」「登录」……"
        @keydown.enter.exact.prevent="send"
      />
      <el-button type="primary" icon="Promotion" :disabled="sending || !input.trim()" @click="send">发送</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { getChatReply, type ChatReply } from '@/api'
import MarkdownView from '@/components/MarkdownView.vue'

interface Msg { role: 'user' | 'assistant'; content: string; contextSummary?: string }

const input = ref('')
const withContext = ref(true)
const compareMode = ref(false)
const sending = ref(false)
const lastContext = ref<ChatReply | null>(null)

const cols = reactive({
  plain: { key: 'plain', messages: [] as Msg[], streaming: false },
  augmented: { key: 'augmented', messages: [] as Msg[], streaming: false },
})
const columns = computed(() => (compareMode.value ? [cols.plain, cols.augmented] : [withContext.value ? cols.augmented : cols.plain]))

const msgRefs = new Map<string, HTMLElement>()
function setMsgRef(key: string, el: unknown) {
  if (el) msgRefs.set(key, el as HTMLElement)
}
async function scrollBottom(key: string) {
  await nextTick()
  const el = msgRefs.get(key)
  if (el) el.scrollTop = el.scrollHeight
}

/** mock 流式：按 30-50ms/段 切片吐出 */
async function streamInto(col: { messages: Msg[]; streaming: boolean }, full: string, contextSummary?: string) {
  col.streaming = true
  const msg: Msg = reactive({ role: 'assistant', content: '', contextSummary })
  col.messages.push(msg)
  const chunks = full.match(/.{1,6}/gs) ?? []
  for (const c of chunks) {
    msg.content += c
    scrollBottom(col === cols.plain ? 'plain' : 'augmented')
    await new Promise((r) => setTimeout(r, 40))
  }
  col.streaming = false
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  sending.value = true
  input.value = ''

  const reply = await getChatReply(text, withContext.value)
  lastContext.value = withContext.value ? reply : null

  const targets = compareMode.value
    ? [cols.plain, cols.augmented]
    : [withContext.value ? cols.augmented : cols.plain]

  for (const col of targets) {
    col.messages.push({ role: 'user', content: text })
    scrollBottom(col.key)
  }

  await Promise.all(
    targets.map((col) =>
      streamInto(
        col,
        col.key === 'augmented' ? reply.augmented : reply.plain,
        col.key === 'augmented' && withContext.value ? reply.contextSummary : undefined,
      ),
    ),
  )
  sending.value = false
}
</script>

<style scoped>
.chat-page { display: flex; flex-direction: column; height: calc(100vh - 56px - 40px); }
.chat-toolbar { display: flex; gap: 24px; }
.chat-cols { display: grid; grid-template-columns: 1fr; gap: 16px; flex: 1; min-height: 0; }
.chat-cols.compare { grid-template-columns: 1fr 1fr; }
.chat-col { min-height: 0; display: flex; }
.chat-card { flex: 1; display: flex; flex-direction: column; }
.chat-card :deep(.el-card__body) { flex: 1; min-height: 0; padding: 0; }
.col-head { display: flex; align-items: center; gap: 12px; }
.ctx-info { font-size: 12px; color: var(--el-color-success); }
.messages { height: 100%; overflow-y: auto; padding: 16px; }
.msg { display: flex; margin-bottom: 14px; }
.msg.user { justify-content: flex-end; }
.msg.user .bubble { background: var(--el-color-primary); color: #fff; }
.msg.assistant .bubble { background: var(--el-fill-color); }
.bubble { max-width: 82%; padding: 10px 14px; border-radius: 10px; line-height: 1.7; font-size: 14px; }
.bubble :deep(p) { margin: 0 0 8px; }
.bubble :deep(ol), .bubble :deep(ul) { margin: 4px 0; padding-left: 20px; }
.ctx-tag {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--el-border-color);
  font-size: 12px;
  color: var(--el-color-success);
  display: flex;
  align-items: center;
  gap: 4px;
}
.cursor { animation: blink 0.8s infinite; }
@keyframes blink { 50% { opacity: 0; } }
.input-bar { display: flex; gap: 12px; margin-top: 12px; align-items: flex-end; }
</style>
