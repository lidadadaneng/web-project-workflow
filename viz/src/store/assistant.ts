/**
 * 看板 AI 协同仓库（一期 mock）。
 *
 * - docs：阶段制品文档，按 `change:phase` 存版本链，支持随时修订与回退；
 *   初始内容来自 /mock/phase-docs.json，缺失时按模板生成。
 * - chats：按 `change:phase` 隔离的 AI 会话，mock 流式输出；
 *   识别「调整类」指令时自动生成文档新版本，并写入工作流历史事件。
 *
 * 二期切换为真实后端：文档 = 工作区制品文件，对话 = /api/chat（SSE 流式）。
 */
import { ref } from 'vue'
import { getPhaseDocs } from '@/api'
import { PHASE_DEFS, useWorkflowStore } from '@/store/workflow'

export interface DocVersion {
  v: number
  ts: number
  note: string
  content: string
}

export interface PhaseDoc {
  versions: DocVersion[]
  current: number // 指向 versions 下标
}

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

const STORAGE_KEY = 'wpw-viz-assistant'
const REVISE_RE = /(修改|调整|改成|补充|精简|删除|增加|重写|优化|回退)/

const docs = ref<Record<string, PhaseDoc>>({})
const chats = ref<Record<string, ChatMsg[]>>({})
let loaded = false

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ docs: docs.value, chats: chats.value }))
}

function restore(): boolean {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return false
  try {
    const saved = JSON.parse(raw)
    docs.value = saved.docs ?? {}
    chats.value = saved.chats ?? {}
    return true
  } catch {
    return false
  }
}

function docTemplate(change: string, phaseId: string): string {
  const def = PHASE_DEFS.find((p) => p.id === phaseId)
  return `# ${change} · ${def?.label ?? phaseId} ${def?.name ?? ''}\n\n## 概述\n\n本阶段制品由 AI 层生成。\n\n## 要点\n\n- 目标与范围待补充\n- 关键方案待补充\n- 验收标准待补充\n`
}

/** 从用户指令中提取修订说明（mock：取指令前 40 字） */
function reviseNote(prompt: string): string {
  const t = prompt.replace(/\s+/g, ' ').trim()
  return t.length > 40 ? `${t.slice(0, 40)}…` : t
}

function applyRevision(content: string, prompt: string, ts: number): string {
  const time = new Date(ts).toLocaleString('zh-CN')
  let next = content
  if (/精简/.test(prompt)) {
    // mock 精简：去掉正文中以「- 」开头的次要条目的一半
    const lines = content.split('\n')
    const bullets = lines.filter((l) => l.startsWith('- '))
    const drop = new Set(bullets.filter((_, i) => i % 2 === 1))
    next = lines.filter((l) => !drop.has(l)).join('\n')
  }
  return `${next}\n\n---\n\n> 修订记录（${time}）：${reviseNote(prompt)}\n`
}

export function useAssistantStore() {
  const workflow = useWorkflowStore()

  async function load() {
    if (loaded) return
    restore()
    const mockDocs = await getPhaseDocs()
    for (const [key, content] of Object.entries(mockDocs)) {
      if (!docs.value[key]) {
        docs.value[key] = { versions: [{ v: 1, ts: Date.now(), note: '初始版本', content }], current: 0 }
      }
    }
    loaded = true
  }

  function ensureDoc(change: string, phaseId: string): PhaseDoc {
    const key = `${change}:${phaseId}`
    if (!docs.value[key]) {
      docs.value[key] = {
        versions: [{ v: 1, ts: Date.now(), note: '初始版本', content: docTemplate(change, phaseId) }],
        current: 0,
      }
      persist()
    }
    return docs.value[key]
  }

  function docOf(change: string, phaseId: string): PhaseDoc {
    return ensureDoc(change, phaseId)
  }

  function currentContent(change: string, phaseId: string): string {
    const d = ensureDoc(change, phaseId)
    return d.versions[d.current]?.content ?? ''
  }

  /** 文档回退到指定版本（非破坏，版本链保留） */
  function revertDoc(change: string, phaseId: string, v: number) {
    const d = ensureDoc(change, phaseId)
    const idx = d.versions.findIndex((x) => x.v === v)
    if (idx < 0) return
    d.current = idx
    workflow.recordEvent(change, 'revise', `文档回退到 v${v}`)
    persist()
  }

  function reviseDoc(change: string, phaseId: string, prompt: string): DocVersion {
    const d = ensureDoc(change, phaseId)
    const ts = Date.now()
    const nv: DocVersion = {
      v: d.versions.length + 1,
      ts,
      note: reviseNote(prompt),
      content: applyRevision(d.versions[d.current].content, prompt, ts),
    }
    d.versions.push(nv)
    d.current = d.versions.length - 1
    const label = PHASE_DEFS.find((p) => p.id === phaseId)?.label ?? phaseId
    workflow.recordEvent(change, 'revise', `AI 修订 ${label} 文档 → v${nv.v}`)
    persist()
    return nv
  }

  function chatOf(change: string, phaseId: string): ChatMsg[] {
    const key = `${change}:${phaseId}`
    if (!chats.value[key]) chats.value[key] = []
    return chats.value[key]
  }

  /** 发送消息：mock 流式应答；调整类指令触发文档修订 */
  function send(change: string, phaseId: string, text: string) {
    const msgs = chatOf(change, phaseId)
    const label = PHASE_DEFS.find((p) => p.id === phaseId)?.label ?? phaseId
    msgs.push({ role: 'user', content: text })

    let full: string
    if (REVISE_RE.test(text)) {
      if (/回退/.test(text)) {
        const d = ensureDoc(change, phaseId)
        const target = Math.max(0, d.current - 1)
        revertDoc(change, phaseId, d.versions[target].v)
        full = `已将「${label}」文档回退到 v${d.versions[target].v}（共 ${d.versions.length} 个版本），可在「阶段文档」页签查看；如需回到更新的版本，在版本下拉中选择即可。`
      } else {
        const nv = reviseDoc(change, phaseId, text)
        full = `已按你的要求调整「${label}」文档，生成 v${nv.v}：${nv.note}。\n\n你可以切到「阶段文档」页签查看最新内容；若不满意，随时让我「回退上一版」或在版本下拉中手动回退。`
      }
    } else {
      full = `这是「${change} · ${label}」阶段的上下文应答：\n\n当前阶段制品已完成的部分可以正常参考；关于「${text}」，建议先明确验收口径，再决定是否落到本阶段文档。若需要我直接改文档，告诉我「把……改成……」即可。`
    }

    const msg: ChatMsg = { role: 'assistant', content: '', streaming: true }
    msgs.push(msg)
    // 必须通过响应式代理写回，直接改原始对象不会触发视图更新
    const live = msgs[msgs.length - 1]
    persist()

    // mock 流式：40ms 切片输出
    let i = 0
    const timer = setInterval(() => {
      i = Math.min(full.length, i + 3)
      live.content = full.slice(0, i)
      if (i >= full.length) {
        live.streaming = false
        clearInterval(timer)
        persist()
      }
    }, 40)
  }

  return { docs, chats, load, docOf, currentContent, reviseDoc, revertDoc, chatOf, send }
}
