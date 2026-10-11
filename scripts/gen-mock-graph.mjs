/**
 * 从真实图谱 JSONL 抽样生成 viz/public/mock/graph.json：
 * - 全量 L1/L2，抽样 L3（每个文件取前 3 个元素）
 * - 保留两端都在样本内的边
 * - 追加手工 C 层能力节点与 business_map 边（本仓库图谱无 C 层，为演示论文核心特性补充）
 * 用法：node scripts/gen-mock-graph.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const jsonl = readFileSync(join(root, 'wpw/knowledge/graph/default/graph.jsonl'), 'utf-8')

const nodes = []
const edges = []
for (const line of jsonl.split('\n')) {
  if (!line.trim()) continue
  const rec = JSON.parse(line)
  if (rec._kind === 'node') nodes.push(rec)
  else if (rec._kind === 'edge') edges.push(rec)
}

// 抽样：L1 全量、L2 取前 24 个文件、L3 每个入选文件取前 3 个元素
const l1 = nodes.filter((n) => n.level === 'L1')
const l2 = nodes.filter((n) => n.level === 'L2').slice(0, 24)
const l2Ids = new Set(l2.map((n) => n.id))
const l3ByFile = new Map()
for (const e of edges) {
  if (e.type !== 'contain' || !l2Ids.has(e.from)) continue
  const target = nodes.find((n) => n.id === e.to)
  if (target?.level === 'L3') {
    if (!l3ByFile.has(e.from)) l3ByFile.set(e.from, [])
    l3ByFile.get(e.from).push(target)
  }
}
const l3 = [...l3ByFile.values()].flatMap((list) => list.slice(0, 3))

// 手工 C 层：映射到真实模块，演示 business_map
const modCommands = l1.find((n) => n.name === 'commands')
const modGraph = l1.find((n) => n.name === 'graph') ?? l1[1]
const now = Date.now()
const cNodes = [
  {
    _kind: 'node', id: 'cap:workflow6stage', level: 'C', type: 'capability', name: 'six-stage-workflow',
    attrs: { description: '六阶段需求开发流程：BRD→PRD→Explore→Design→Plan→Test→Apply', features: [{ id: 'REQ-1', name: '阶段状态管理', priority: 'P0' }, { id: 'REQ-2', name: '依赖门禁', priority: 'P0' }] },
    createdAt: now, updatedAt: now,
  },
  {
    _kind: 'node', id: 'cap:graphcontext', level: 'C', type: 'capability', name: 'graph-context',
    attrs: { description: '图谱驱动的任务级上下文生成：锚点检索、子图裁剪、三档压缩', features: [{ id: 'REQ-1', name: '语义锚点检索', priority: 'P0' }, { id: 'REQ-2', name: 'Token 预算控制', priority: 'P1' }] },
    createdAt: now, updatedAt: now,
  },
]
const cEdges = [
  { _kind: 'edge', id: 'cap:workflow6stage->business_map->' + modCommands.id, from: 'cap:workflow6stage', to: modCommands.id, type: 'business_map', weight: 0.87, source: 'doc-extract' },
  { _kind: 'edge', id: 'cap:graphcontext->business_map->' + modGraph.id, from: 'cap:graphcontext', to: modGraph.id, type: 'business_map', weight: 0.92, source: 'semantic' },
]

const sampled = [...cNodes, ...l1, ...l2, ...l3]
const ids = new Set(sampled.map((n) => n.id))
const sampledEdges = [...cEdges, ...edges.filter((e) => ids.has(e.from) && ids.has(e.to))]

const out = {
  nodes: sampled.map(({ _kind, ...n }) => n),
  edges: sampledEdges.map(({ _kind, id, from, to, type, weight, source }) => ({ id, source: from, target: to, type, weight, evidence: source })),
}

const outDir = join(root, 'viz/public/mock')
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'graph.json'), JSON.stringify(out, null, 2))
console.log(`graph.json: ${out.nodes.length} nodes, ${out.edges.length} edges`)
