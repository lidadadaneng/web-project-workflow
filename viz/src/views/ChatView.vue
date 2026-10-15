<template>
  <div class="chat-page">
    <el-card class="page-card">
      <div class="chat-toolbar">
        <el-switch v-model="withContext" active-text="注入项目上下文" />
        <el-switch v-model="compareMode" active-text="双栏对比（纯模型 vs 图谱增强）" />
        <el-tag v-if="!llmReady" type="warning" effect="plain">
          未配置大模型，先到「API 配置」页填写
        </el-tag>
        <el-tag v-else type="success" effect="plain">{{ llm.model }}</el-tag>
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
              <span v-if="col.key === 'augmented' && col.contextTokens" class="ctx-info">
                注入上下文 ≈ {{ col.contextTokens }} tokens
              </span>
            </div>
          </template>

          <div class="messages" :ref="(el) => setMsgRef(col.key, el)">
            <div v-for="(m, i) in col.messages" :key="i" :class="['msg', m.role]">
              <div class="bubble" :class="{ 'bubble-error': m.error }">
                <MarkdownView v-if="m.role === 'assistant'" :source="m.content" />
                <template v-else>{{ m.content }}</template>
                <span v-if="m.streaming" class="cursor">▍</span>
                <div v-if="m.contextSummary" class="ctx-tag">
                  <el-icon><Connection /></el-icon> {{ m.contextSummary }}
                </div>
                <div v-if="m.degraded" class="ctx-degraded">上下文降级：{{ m.degraded }}</div>
              </div>
            </div>
            <el-empty v-if="!col.messages.length" description="向 wpw 提问，试试「购物车」「登录」「订单」" :image-size="60" />
          </div>
        </el-card>
      </div>
    </div>

    <div class="input-bar">
      <el-input
        v-model="input"
        type="textarea"
        :rows="2"
        placeholder="向 wpw 提问（基于真实知识图谱增强回答）"
        @keydown.enter.exact.prevent="send"
      />
      <el-button type="primary" icon="Promotion" :disabled="sending || !input.trim()" @click="send">发送</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getLlmConfig, hasLlmConfig, streamChat } from '@/api'
import MarkdownView from '@/components/MarkdownView.vue'

interface Msg {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  error?: boolean
  contextSummary?: string
  degraded?: string
}

const input = ref('')
const withContext = ref(true)
const compareMode = ref(false)
const sending = ref(false)
const llm = getLlmConfig()
const llmReady = ref(hasLlmConfig(llm))

const cols = reactive({
  plain: { key: 'plain' as const, messages: [] as Msg[], contextTokens: 0 },
  augmented: { key: 'augmented' as const, messages: [] as Msg[], contextTokens: 0 },
})
const columns = computed(() =>
  compareMode.value ? [cols.plain, cols.augmented] : [withContext.value ? cols.augmented : cols.plain],
)

const msgRefs = new Map<string, HTMLElement>()
function setMsgRef(key: string, el: unknown) {
  if (el) msgRefs.set(key, el as HTMLElement)
}
async function scrollBottom(key: string) {
  await nextTick()
  const el = msgRefs.get(key)
  if (el) el.scrollTop = el.scrollHeight
}

/**
 * 真实流式对话：向服务端发起 SSE 请求，增量文本增量写入气泡。
 * augmented 列会先拿到一次上下文摘要（锚点 + 子图规模 + token 估算）。
 */
async function streamInto(
  col: { key: 'plain' | 'augmented'; messages: Msg[]; contextTokens: number },
  prompt: string,
) {
  const msg = reactive<Msg>({ role: 'assistant', content: '', streaming: true })
  col.messages.push(msg)

  await streamChat(
    {
      prompt,
      mode: col.key === 'augmented' ? 'augmented' : 'plain',
      budget: 2000,
    },
    {
      onContext: (info) => {
        msg.contextSummary = info.summary
        msg.degraded = info.degraded
        col.contextTokens = info.tokens
      },
      onDelta: (delta) => {
        msg.content += delta
        scrollBottom(col.key)
      },
      onError: (message) => {
        msg.content = `请求失败：${message}`
        msg.error = true
      },
    },
  )

  if (!msg.content) msg.content = '（模型没有返回内容）'
  msg.streaming = false
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value) return
  if (!llmReady.value) {
    ElMessage.warning('请先到「API 配置」页填写 Base URL / API Key / 模型')
    return
  }

  sending.value = true
  input.value = ''

  const targets = compareMode.value
    ? [cols.plain, cols.augmented]
    : [withContext.value ? cols.augmented : cols.plain]

  for (const col of targets) {
    col.messages.push({ role: 'user', content: text })
    scrollBottom(col.key)
  }

  try {
    await Promise.all(targets.map((col) => streamInto(col, text)))
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.chat-page { display: flex; flex-direction: column; height: calc(100vh - 56px - 40px); }
.chat-toolbar { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
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
.bubble-error { background: #fef0f0; color: #f56c6c; }
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
.ctx-degraded { margin-top: 4px; font-size: 12px; color: var(--el-color-warning); }
.cursor { animation: blink 0.8s infinite; }
@keyframes blink { 50% { opacity: 0; } }
.input-bar { display: flex; gap: 12px; margin-top: 12px; align-items: flex-end; }
</style>