/**
 * 看板 AI 协同仓库（真实后端）。
 *
 * - docs：阶段制品的真实内容与版本链，落在工作区
 *   `wpw/active/<需求>/<制品>.md` 与 `.wpw-docs/<phase>/v<n>.md`。
 * - chats：按 `change:phase` 隔离的会话，仅存在于内存（一次会话的生命周期），
 *   对话本身不落盘——只有「修订制品」这个动作会真正改文件。
 *
 * 「精简文档 / 把……改成……」这类指令会真正调用大模型重写制品并生成新版本；
 * 其余提问走真实的多轮对话（可注入图谱上下文）。
 */
import { ref } from 'vue'
import {
  getDoc,
  getLlmConfig,
  hasLlmConfig,
  putDoc,
  revertDoc as apiRevertDoc,
  reviseDoc as apiReviseDoc,
  streamChat,
  type PhaseDoc,
} from '@/api'
import { PHASE_DEFS } from '@/store/workflow'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  /** 图谱增强时注入的上下文摘要 */
  contextSummary?: string
  error?: boolean
}

const EMPTY_DOC = (phase: string): PhaseDoc => ({
  phase,
  file: '',
  exists: false,
  content: '',
  index: { versions: [], current: 0 },
})

const REVISE_RE = /(修改|调整|改成|补充|精简|删除|增加|重写|优化|回退)/
const REVERT_RE = /回退/

const docs = ref<Record<string, PhaseDoc>>({})
const chats = ref<Record<string, ChatMsg[]>>({})
const loadingDocs = ref<Record<string, boolean>>({})

const keyOf = (change: string, phase: string) => `${change}:${phase}`

export function useAssistantStore() {
  /** 拉取（或刷新）某阶段的制品 */
  async function loadDoc(change: string, phase: string, force = false): Promise<PhaseDoc> {
    const key = keyOf(change, phase)
    if (docs.value[key] && !force) return docs.value[key]

    loadingDocs.value[key] = true
    try {
      docs.value[key] = await getDoc(change, phase)
      return docs.value[key]
    } finally {
      loadingDocs.value[key] = false
    }
  }

  function docOf(change: string, phase: string): PhaseDoc {
    return docs.value[keyOf(change, phase)] ?? EMPTY_DOC(phase)
  }

  function isLoadingDoc(change: string, phase: string) {
    return Boolean(loadingDocs.value[keyOf(change, phase)])
  }

  function currentContent(change: string, phase: string): string {
    return docOf(change, phase).content
  }

  /** 手动写入制品（页面上的编辑入口） */
  async function writeDoc(change: string, phase: string, content: string, note: string) {
    docs.value[keyOf(change, phase)] = await putDoc(change, phase, content, note)
  }

  /** 回退到指定版本（非破坏，版本链保留） */
  async function revertDoc(change: string, phase: string, v: number) {
    docs.value[keyOf(change, phase)] = await apiRevertDoc(change, phase, v)
  }

  function chatOf(change: string, phase: string): ChatMsg[] {
    const key = keyOf(change, phase)
    if (!chats.value[key]) chats.value[key] = []
    return chats.value[key]
  }

  function labelOf(phase: string) {
    return PHASE_DEFS.find((p) => p.id === phase)?.label ?? phase
  }

  /**
   * 发送一条消息。
   *
   * 判定分三路（都真实作用于文件与模型）：
   *   1. 「回退」→ 退回上一版本
   *   2. 其他修订类指令 → 让模型重写制品并生成新版本
   *   3. 普通提问 → 真实流式对话（注入图谱上下文）
   */
  async function send(change: string, phase: string, text: string, opts: { useContext?: boolean } = {}) {
    const msgs = chatOf(change, phase)
    msgs.push({ role: 'user', content: text })

    const reply: ChatMsg = { role: 'assistant', content: '', streaming: true }
    msgs.push(reply)
    // 通过响应式代理写回，直接改原始对象不会触发视图更新
    const live = () => msgs[msgs.length - 1]

    try {
      if (REVISE_RE.test(text)) {
        if (!hasLlmConfig()) {
          live().content = '修订制品需要先配置大模型：请到「API 配置」页填写 Base URL / API Key / 模型。'
          live().error = true
          return
        }
        const doc = await loadDoc(change, phase, true)

        if (REVERT_RE.test(text)) {
          const target = doc.index.versions
            .filter((v) => v.v < doc.index.current)
            .pop()
          if (!target) {
            live().content = `「${labelOf(phase)}」制品只有 v${doc.index.current} 一个版本，没有可回退的历史。`
            live().error = true
            return
          }
          await revertDoc(change, phase, target.v)
          live().content = `已将「${labelOf(phase)}」制品回退到 v${target.v}（共 ${doc.index.versions.length} 个版本）。不满意可以再切回更新的版本。`
          return
        }

        const updated = await apiReviseDoc(change, phase, text, getLlmConfig())
        docs.value[keyOf(change, phase)] = updated
        live().content = `已按你的要求重写「${labelOf(phase)}」制品，生成 v${updated.index.current}：${updated.note}。\n\n切到「阶段文档」页签可查看最新内容；不满意可以说「回退上一版」或在版本下拉中手动切换。`
        return
      }

      // 普通提问：真实流式对话
      if (!hasLlmConfig()) {
        live().content = '对话需要先配置大模型：请到「API 配置」页填写 Base URL / API Key / 模型。'
        live().error = true
        return
      }

      await streamChat(
        {
          prompt: text,
          mode: opts.useContext === false ? 'plain' : 'augmented',
          change,
          phase,
          budget: 1500,
        },
        {
          onContext: (info) => {
            live().contextSummary = info.summary
          },
          onDelta: (delta) => {
            live().content += delta
          },
          onError: (message) => {
            live().content = `对话失败：${message}`
            live().error = true
          },
        },
      )
      if (!live().content) live().content = '（模型没有返回内容）'
    } catch (e) {
      live().content = `操作失败：${(e as Error).message}`
      live().error = true
    } finally {
      live().streaming = false
    }
  }

  function clearChat(change: string, phase: string) {
    chats.value[keyOf(change, phase)] = []
  }

  return {
    docs,
    chats,
    loadDoc,
    isLoadingDoc,
    docOf,
    currentContent,
    writeDoc,
    revertDoc,
    chatOf,
    send,
    clearChat,
  }
}