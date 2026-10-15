/**
 * 统一 API 层：所有数据来自 `wpw viz` 本地服务的 /api。
 *
 * 服务端直接读写真实工作区（wpw/active、wpw/knowledge、wpw/specs、wpw/archived），
 * 这里只做「请求 + 类型声明」。开发态由 Vite 代理转发到 CLI 服务（见 vite.config.ts）。
 */
const BASE = '/api'

/** 拼接接口地址；path 写不带前导斜杠的相对路径，如 'changes'、'graph/default/stat' */
function apiUrl(path: string): string {
  return `${BASE}/${path.replace(/^\/+/, '')}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })

  const text = await res.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error(`响应不是 JSON: ${text.slice(0, 120)}`)
    }
  }

  if (!res.ok) {
    const message = (payload as { error?: string } | null)?.error ?? `请求失败 ${res.status}`
    throw new Error(message)
  }
  // 服务端用 4xx/5xx 表达错误，但个别业务校验也返回 200 + {error}
  if (payload && typeof payload === 'object' && 'error' in payload && !Array.isArray(payload)) {
    throw new Error(String((payload as { error: unknown }).error))
  }
  return payload as T
}

const get = <T>(path: string) => request<T>(path)
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
const put = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) })

// ==================== 类型（与 CLI 真实数据对齐） ====================

/** CLI 真实状态含 outlining/confirmed（草稿/待确认），比 mock 只多不少 */
export type PhaseState = 'pending' | 'outlining' | 'confirmed' | 'done' | 'skipped'

export interface ChangeItem {
  name: string
  schema: string
  projectType: string
  createdAt: number
  /** 含 6 个真实阶段 + 派生阶段 apply */
  phases: Record<string, PhaseState>
  tasks: { total: number; done: number; inProgress: number }
  exploreDecision?: string
}

export interface ChangeDetail extends ChangeItem {
  docs: { phase: string; file: string; exists: boolean }[]
  warnings: string[]
  planTasks: { id: string; title: string; state: 'pending' | 'in-progress' | 'done' }[]
}

export interface GraphNode {
  id: string
  level: string
  type: string
  name: string
  attrs?: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  type: string
  weight?: number
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphSummary {
  name: string
  totalNodes: number
  totalEdges: number
  totalVectors: number
  builtAt: number
  scanRoot?: string
  projectType?: string
  schemaVersion: string
}

export interface GraphStat {
  graphName: string
  scanRoot?: string
  projectType?: string
  totalNodes: number
  totalEdges: number
  totalVectors: number
  nodesByLevel: Record<string, number>
  edgesByType: Record<string, number>
  builtAt: number
  schemaVersion: string
  configVersion?: string
  /** 按边来源（structure / semantic / git）统计，服务端现算 */
  evidenceSources: { source: string; count: number; avgWeight: number }[]
  coverage: {
    mappedCapabilities: number
    totalCapabilities: number
    mappedModules: number
    totalModules: number
  }
}

export interface WorkspaceMeta {
  root: string
  graph: string
  graphs: GraphSummary[]
  hasActive: boolean
  hasArchived: boolean
  hasSpecs: boolean
}

export interface ContextAnchor {
  id: string
  name: string
  level: string
  score: number
}

export interface ContextCompressionResult {
  level: 'loose' | 'standard' | 'extreme'
  nodeCount: number
  tokenEstimate: number
  serialized: string
}

export interface ContextDemo {
  query: string
  anchors: ContextAnchor[]
  subgraph: GraphData
  results: ContextCompressionResult[]
  /** 非空表示发生了降级（如无向量索引 / 语义检索失败） */
  degraded?: string
}

export interface CapabilitySpec {
  name: string
  title: string
  updatedAt: number
  markdown: string
}

export interface KnowledgeData {
  specs: CapabilitySpec[]
  artifacts: { name: string; builtAt: number; nodes: number; edges: number; vectors: number }[]
}

export interface ArchivedChange {
  month: string
  name: string
  archivedAt: number
  docs: { title: string; markdown: string }[]
}

export interface TokenStats {
  byChange: { name: string; input: number; output: number }[]
  byPhase: { phase: string; input: number; output: number }[]
  byTime: { date: string; input: number; output: number }[]
}

/** 历史事件（来自 .wpw-events.jsonl） */
export interface HistoryEvent {
  id: string
  ts: number
  change: string
  type: 'create' | 'phase' | 'decide' | 'task' | 'doc' | 'archive' | 'rollback'
  label: string
  snapshot?: { phases: Record<string, PhaseState>; exploreDecision?: string }
}

export interface DocVersion {
  v: number
  ts: number
  note: string
}

export interface DocVersionIndex {
  versions: DocVersion[]
  current: number
}

/** 阶段制品（真实文件 + 版本链） */
export interface PhaseDoc {
  phase: string
  file: string
  exists: boolean
  content: string
  index: DocVersionIndex
}

export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
}

// ==================== 大模型配置（只存本地） ====================

const LLM_STORAGE_KEY = 'wpw-viz-api-config'

export function getLlmConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(LLM_STORAGE_KEY)
    if (!raw) return { baseUrl: '', apiKey: '', model: '' }
    const parsed = JSON.parse(raw)
    return {
      baseUrl: String(parsed.baseUrl ?? ''),
      apiKey: String(parsed.apiKey ?? ''),
      model: String(parsed.model ?? ''),
    }
  } catch {
    return { baseUrl: '', apiKey: '', model: '' }
  }
}

export function saveLlmConfig(cfg: LlmConfig): void {
  localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(cfg))
}

export function hasLlmConfig(cfg = getLlmConfig()): boolean {
  return Boolean(cfg.baseUrl && cfg.apiKey && cfg.model)
}

// ==================== 工作区 ====================

export const getMeta = () => get<WorkspaceMeta>('meta')

// ==================== 需求与工作流状态 ====================

export const getChanges = () => get<ChangeItem[]>('changes')
export const createChange = (name: string) => post<ChangeItem>('changes', { name })
export const getChangeDetail = (name: string) => get<ChangeDetail>(`changes/${encodeURIComponent(name)}`)
export const setPhase = (name: string, phase: string, state: PhaseState) =>
  post<ChangeItem>(`changes/${encodeURIComponent(name)}/phases/${phase}`, { state })
export const setDecision = (name: string, option: string) =>
  post<ChangeItem>(`changes/${encodeURIComponent(name)}/decision`, { option })
export const setTaskState = (name: string, taskId: string, state: string) =>
  post<ChangeItem>(`changes/${encodeURIComponent(name)}/tasks/${taskId}`, { state })
export const getEvents = (name: string) => get<HistoryEvent[]>(`changes/${encodeURIComponent(name)}/events`)
export const rollback = (name: string, eventId: string) =>
  post<ChangeItem>(`changes/${encodeURIComponent(name)}/rollback`, { eventId })
export const archiveChange = (name: string) =>
  post<{ archived: boolean; month: string; dest: string; note: string }>(
    `changes/${encodeURIComponent(name)}/archive`,
  )

// ==================== 阶段制品 ====================

export const getDoc = (name: string, phase: string) =>
  get<PhaseDoc>(`changes/${encodeURIComponent(name)}/docs/${phase}`)
export const putDoc = (name: string, phase: string, content: string, note: string) =>
  put<PhaseDoc>(`changes/${encodeURIComponent(name)}/docs/${phase}`, { content, note })
export const revertDoc = (name: string, phase: string, v: number) =>
  post<PhaseDoc>(`changes/${encodeURIComponent(name)}/docs/${phase}/revert`, { v })
/** 让模型按指令重写制品，产出新版本 */
export const reviseDoc = (name: string, phase: string, instruction: string, llm = getLlmConfig()) =>
  post<PhaseDoc & { note: string }>(`changes/${encodeURIComponent(name)}/docs/${phase}/revise`, {
    instruction,
    llm,
  })

// ==================== 知识图谱 / 规格 / 归档 ====================

export const getGraphs = () => get<GraphSummary[]>('graphs')
export const getGraph = (name = 'default', params: { levels?: string; limit?: number } = {}) => {
  const qs = new URLSearchParams()
  if (params.levels) qs.set('levels', params.levels)
  if (params.limit) qs.set('limit', String(params.limit))
  const suffix = qs.toString() ? `?${qs}` : ''
  return get<GraphData>(`graph/${encodeURIComponent(name)}${suffix}`)
}
export const getGraphStat = (name = 'default') => get<GraphStat>(`graph/${encodeURIComponent(name)}/stat`)
export const getSpecs = () => get<KnowledgeData>('specs')
export const getArchived = () => get<ArchivedChange[]>('archived')
export const getTokenStats = () => get<TokenStats>('token-stats')

// ==================== 上下文管线 ====================

export interface ContextRequest {
  query: string
  budget?: number
  depth?: number
  maxNodes?: number
  graph?: string
  semantic?: boolean
}

export const getContext = (payload: ContextRequest) => post<ContextDemo>('context', payload)

// ==================== 大模型 ====================

export const testLlm = (llm = getLlmConfig()) =>
  post<{ ok: boolean; message: string }>('llm/test', { llm })

export interface ChatStreamHandlers {
  onContext?: (info: { summary: string; tokens: number; degraded?: string }) => void
  onDelta: (text: string) => void
  onDone?: (usage: { input: number; output: number }) => void
  onError?: (message: string) => void
}

export interface ChatRequest {
  prompt: string
  /** augmented：先注入图谱上下文再提问；plain：纯模型 */
  mode: 'plain' | 'augmented'
  change?: string
  phase?: string
  graph?: string
  budget?: number
  llm?: LlmConfig
}

/**
 * 对话（SSE 流式）。
 *
 * 用 fetch + ReadableStream 手动解析 SSE，而不是 EventSource——
 * 后者只能发 GET，装不下 prompt 与 llm 配置。
 */
export async function streamChat(req: ChatRequest, handlers: ChatStreamHandlers): Promise<void> {
  const res = await fetch(apiUrl('chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, llm: req.llm ?? getLlmConfig() }),
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    handlers.onError?.(detail || `对话接口返回 ${res.status}`)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const dispatch = (event: string, data: string) => {
    let parsed: any = null
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    if (event === 'context') handlers.onContext?.(parsed)
    else if (event === 'delta') handlers.onDelta(parsed.text ?? '')
    else if (event === 'done') handlers.onDone?.(parsed.usage ?? { input: 0, output: 0 })
    else if (event === 'error') handlers.onError?.(parsed.message ?? '未知错误')
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE 事件之间以空行分隔
    let sep: number
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)

      let event = 'message'
      const dataLines: string[] = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length) dispatch(event, dataLines.join('\n'))
    }
  }
}