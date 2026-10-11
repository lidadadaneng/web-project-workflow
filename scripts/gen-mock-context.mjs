/**
 * 生成 context-demo.json 与 graph-stat.json mock：
 * - context-demo：真实 `wpw graph context --anchors ... --compression <level> --json` × 3 档
 * - graph-stat：真实 `wpw graph stat --json` + 补充证据源与覆盖率统计（本仓库无 C 层，覆盖率按手工 mock 能力推算）
 * 用法：node scripts/gen-mock-context.mjs
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'dist/index.js')
const outDir = join(root, 'viz/public/mock')
mkdirSync(outDir, { recursive: true })

const run = (args) => JSON.parse(execFileSync('node', [cli, ...args, '--json'], { cwd: root, maxBuffer: 64 * 1024 * 1024 }).toString())

// ---------- context-demo ----------
const levels = ['loose', 'standard', 'extreme']
const results = levels.map((level) => {
  const r = run(['graph', 'context', '--anchors', 'mod:41291f2f4d9d', '--compression', level])
  return {
    level,
    nodeCount: r.stats.nodeCount,
    tokenEstimate: r.stats.estimatedTokens,
    serialized: r.compressedText ?? '',
  }
})
const standard = run(['graph', 'context', '--anchors', 'mod:41291f2f4d9d', '--compression', 'standard'])

const contextDemo = {
  query: 'CLI 命令注册与阶段状态管理',
  anchors: standard.anchors.map((a, i) => ({ id: a.id, name: a.name, level: a.level, score: 0.95 - i * 0.07 })),
  subgraph: {
    nodes: standard.subgraph.nodes,
    edges: (standard.subgraph.edges ?? []).map((e) => ({ source: e.from, target: e.to, type: e.type, weight: e.weight })),
  },
  results,
}
writeFileSync(join(outDir, 'context-demo.json'), JSON.stringify(contextDemo, null, 2))
console.log('context-demo.json:', results.map((r) => `${r.level}:${r.nodeCount}n/${r.tokenEstimate}t`).join(' '))

// ---------- graph-stat ----------
const stat = run(['graph', 'stat'])
stat.evidenceSources = [
  { source: 'doc-extract', count: 12, avgWeight: 0.85 },
  { source: 'semantic', count: 18, avgWeight: 0.78 },
  { source: 'git-history', count: 6, avgWeight: 0.64 },
  { source: 'naming', count: 9, avgWeight: 0.52 },
]
stat.coverage = { mappedCapabilities: 2, totalCapabilities: 3, mappedModules: 2, totalModules: stat.nodesByLevel.L1 ?? 2 }
writeFileSync(join(outDir, 'graph-stat.json'), JSON.stringify(stat, null, 2))
console.log('graph-stat.json:', stat.totalNodes, 'nodes,', stat.totalEdges, 'edges')
