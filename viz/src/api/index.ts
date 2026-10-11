/**
 * 统一 API fetcher 层。
 * 一期：BASE = '/mock'，从 public/mock/*.json 读取契约化 mock 数据；
 * 二期：BASE 切换为 '/api'，由 `wpw viz` 本地服务提供同名路由，
 *       页面组件无需任何修改。
 */
const BASE = '/mock'

async function get<T>(name: string): Promise<T> {
  const res = await fetch(`${BASE}/${name}.json`)
  if (!res.ok) throw new Error(`加载 ${name} 失败: ${res.status}`)
  return res.json() as Promise<T>
}

// ---------- 类型定义（与 CLI --json 输出保持一致） ----------

export type PhaseState = 'pending' | 'done' | 'skipped'

export interface ChangeItem {
  name: string
  schema: string
  projectType: string
  createdAt: number
  description?: string
  tag?: string
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
  level: 'C' | 'L1' | 'L2' | 'L3'
  type: string
  name: string
  attrs?: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  type: 'contain' | 'import' | 'call' | 'inherit' | 'business_map'
  weight?: number
  evidence?: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphStat {
  graphName: string
  totalNodes: number
  totalEdges: number
  totalVectors: number
  nodesByLevel: Record<string, number>
  edgesByType: Record<string, number>
  builtAt: number
  schemaVersion: string
  evidenceSources?: { source: string; count: number; avgWeight: number }[]
  coverage?: { mappedCapabilities: number; totalCapabilities: number; mappedModules: number; totalModules: number }
}

export interface ContextCompressionResult {
  level: 'loose' | 'standard' | 'extreme'
  nodeCount: number
  tokenEstimate: number
  serialized: string
}

export interface ContextDemo {
  query: string
  anchors: { id: string; name: string; level: string; score: number }[]
  subgraph: GraphData
  results: ContextCompressionResult[]
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

export interface ChatReply {
  plain: string
  augmented: string
  contextSummary?: string
  contextTokens?: number
}

// ---------- API ----------

export const getChanges = () => get<ChangeItem[]>('changes')
export const getChangeDetail = () => get<ChangeDetail>('change-detail')
export const getGraph = () => get<GraphData>('graph')
export const getGraphStat = () => get<GraphStat>('graph-stat')
export const getContextDemo = () => get<ContextDemo>('context-demo')
export const getSpecs = () => get<KnowledgeData>('specs')
export const getArchived = () => get<ArchivedChange[]>('archived')
export const getTokenStats = () => get<TokenStats>('token-stats')

/** 一期 mock：按键匹配语料，未命中时返回默认应答。二期替换为 SSE 流式接口 */
export async function getChatReply(prompt: string, withContext: boolean): Promise<ChatReply> {
  const corpus = await get<Record<string, ChatReply> & { __default__: ChatReply }>('chat')
  const hit = Object.keys(corpus).find((k) => k !== '__default__' && prompt.includes(k))
  const reply = (hit ? corpus[hit] : corpus.__default__) ?? { plain: '', augmented: '' }
  return withContext ? reply : { plain: reply.plain, augmented: reply.plain }
}
