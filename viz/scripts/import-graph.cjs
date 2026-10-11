/**
 * 一次性转换脚本：将 wpw-map 工作区的真实知识图谱（graph.jsonl）
 * 转换为 viz 前端 mock 契约格式（viz/public/mock/graph.json + graph-stat.json）。
 */
const fs = require('fs')
const path = require('path')

const SRC_DIR = 'E:\\project\\web-project-workflow\\论文\\关键词召回实验数据\\workspaces\\wpw-map\\wpw\\knowledge\\graph\\default'
const OUT_DIR = 'E:\\project\\web-project-workflow\\viz\\public\\mock'

const lines = fs.readFileSync(path.join(SRC_DIR, 'graph.jsonl'), 'utf-8').split(/\r?\n/).filter(Boolean)
const meta = JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'meta.json'), 'utf-8'))

const nodes = []
const edges = []
for (const line of lines) {
  const o = JSON.parse(line)
  if (o._kind === 'node') {
    nodes.push({ id: o.id, level: o.level, type: o.type, name: o.name, attrs: o.attrs ?? {} })
  } else if (o._kind === 'edge') {
    edges.push({ source: o.from, target: o.to, type: o.type, weight: o.weight })
  }
}

const nodesByLevel = {}
for (const n of nodes) nodesByLevel[n.level] = (nodesByLevel[n.level] ?? 0) + 1
const edgesByType = {}
for (const e of edges) edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1

fs.writeFileSync(path.join(OUT_DIR, 'graph.json'), JSON.stringify({ nodes, edges }, null, 2))

const stat = {
  graphName: meta.graphName,
  scanRoot: meta.scanRoot,
  projectType: meta.projectType,
  totalNodes: nodes.length,
  totalEdges: edges.length,
  totalVectors: meta.totalVectors ?? 0,
  nodesByLevel,
  edgesByType,
  builtAt: meta.builtAt,
  schemaVersion: meta.schemaVersion,
  configVersion: meta.configVersion,
}
fs.writeFileSync(path.join(OUT_DIR, 'graph-stat.json'), JSON.stringify(stat, null, 2))

console.log(`nodes=${nodes.length} edges=${edges.length}`)
console.log('nodesByLevel=', nodesByLevel)
console.log('edgesByType=', edgesByType)
