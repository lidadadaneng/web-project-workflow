<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="dag">
    <defs>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="#909399" />
      </marker>
      <marker id="arr-strong" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 z" fill="#409eff" />
      </marker>
    </defs>

    <!-- 边：实线=强依赖，虚线=可选/弱依赖 -->
    <line v-for="(e, i) in edges" :key="i"
      :x1="nodePos[e.from].x + NW / 2" :y1="nodePos[e.from].y"
      :x2="nodePos[e.to].x - NW / 2" :y2="nodePos[e.to].y"
      :class="['edge', e.weak ? 'weak' : 'strong']"
      :marker-end="e.weak ? 'url(#arr)' : 'url(#arr-strong)'"
    />

    <!-- 节点（可点击打开阶段操作面板） -->
    <g v-for="n in nodes" :key="n.id" :transform="`translate(${nodePos[n.id].x - NW / 2}, ${nodePos[n.id].y - NH / 2})`"
       class="node-g" @click="$emit('phaseClick', n.id)">
      <rect :width="NW" :height="NH" rx="8" :class="['node', stateOf(n.id), { actionable: n.id === actionableId }]" />
      <text :x="NW / 2" :y="NH / 2 + 1" class="node-label" :class="stateOf(n.id)">{{ n.label }}</text>
      <text v-if="n.optional" :x="NW / 2" :y="-6" class="optional-tag">可选</text>
      <circle v-if="n.id === actionableId" :cx="NW - 6" cy="6" r="4" class="pulse" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import type { PhaseState } from '@/api'

const props = defineProps<{ phases: Record<string, PhaseState>; actionableId?: string }>()
defineEmits<{ phaseClick: [phaseId: string] }>()

const W = 560
const H = 96
const NW = 74
const NH = 30

const nodes = [
  { id: 'brd', label: 'BRD' },
  { id: 'prd', label: 'PRD' },
  { id: 'explore', label: 'Explore', optional: true },
  { id: 'design', label: 'Design' },
  { id: 'plan', label: 'Plan' },
  { id: 'testplan', label: 'Test', optional: true },
  { id: 'apply', label: 'Apply' },
]

const nodePos: Record<string, { x: number; y: number }> = {
  brd: { x: 48, y: 58 },
  prd: { x: 138, y: 58 },
  explore: { x: 233, y: 24 },
  design: { x: 233, y: 58 },
  plan: { x: 330, y: 58 },
  testplan: { x: 428, y: 24 },
  apply: { x: 512, y: 58 },
}

const edges = [
  { from: 'brd', to: 'prd', weak: false },
  { from: 'prd', to: 'explore', weak: true },
  { from: 'prd', to: 'design', weak: false },
  { from: 'explore', to: 'design', weak: true },
  { from: 'design', to: 'plan', weak: false },
  { from: 'plan', to: 'testplan', weak: true },
  { from: 'plan', to: 'apply', weak: false },
  { from: 'testplan', to: 'apply', weak: true },
]

const stateOf = (id: string): PhaseState => props.phases[id] ?? 'pending'
</script>

<style scoped>
.dag { width: 100%; height: 96px; display: block; }
.edge.strong { stroke: #409eff; stroke-width: 1.8; }
.edge.weak { stroke: #909399; stroke-width: 1.4; stroke-dasharray: 5 4; }
.node-g { cursor: pointer; }
.node-g:hover .node { filter: brightness(0.96); stroke-width: 2.2; }
.node { stroke-width: 1.6; }
.node.done { fill: #f0f9eb; stroke: #67c23a; }
.node.pending { fill: #f4f4f5; stroke: #c0c4cc; }
.node.skipped { fill: #fff; stroke: #c0c4cc; stroke-dasharray: 4 3; }
.node.actionable { stroke: #409eff; stroke-width: 2.2; }
.pulse { fill: #409eff; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.25; } }
.node-label { text-anchor: middle; dominant-baseline: middle; font-size: 11.5px; font-weight: 600; }
.node-label.done { fill: #529b2e; }
.node-label.pending { fill: #909399; }
.node-label.skipped { fill: #a8abb2; }
.optional-tag { text-anchor: middle; font-size: 9px; fill: #b1b3b8; }
</style>
