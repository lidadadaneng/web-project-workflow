<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="dag">
    <defs>
      <marker id="arr-green" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0,0.5 L7,3.5 L0,6.5 z" fill="#95d475" />
      </marker>
      <marker id="arr-blue" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0,0.5 L7,3.5 L0,6.5 z" fill="#79bbff" />
      </marker>
      <marker id="arr-grey" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
        <path d="M0,0.5 L7,3.5 L0,6.5 z" fill="#dcdfe6" />
      </marker>
    </defs>

    <!-- 边：颜色跟随两端节点状态；分支为圆角贝塞尔曲线 -->
    <path v-for="(e, i) in edgePaths" :key="i"
      :d="e.d"
      :class="['edge', e.cls]"
      :marker-end="`url(#arr-${e.color})`"
      fill="none"
    />

    <!-- 节点 -->
    <g v-for="n in layout" :key="n.id"
       :transform="`translate(${n.x - n.w / 2}, ${n.y - n.h / 2})`"
       class="node-g" @click="$emit('phaseClick', n.id)">
      <rect :width="n.w" :height="n.h" rx="6" :class="['node', stateOf(n.id), { active: n.id === actionableId, draft: isDraft(n.id) }]" />

      <!-- 状态图标：统一 12px，左对齐，与文字间距 8px -->
      <g :transform="`translate(11, ${n.h / 2})`" class="state-icon">
        <!-- done：绿底白勾 -->
        <g v-if="stateOf(n.id) === 'done'">
          <circle r="5.2" class="icon-done-bg" />
          <path d="M -2.6 0.4 L -0.8 2.2 L 2.8 -1.8" class="icon-check" />
        </g>
        <!-- drafting：琥珀半环，表示已产出草稿/待确认（CLI 的 outlining / confirmed） -->
        <g v-else-if="isDraft(n.id)">
          <circle r="4.6" class="icon-draft" />
          <path d="M 0 -4.6 A 4.6 4.6 0 0 1 0 4.6" class="icon-draft-fill" />
        </g>
        <!-- active：靶心圆点 -->
        <g v-else-if="n.id === actionableId">
          <circle r="4.6" class="icon-target-ring" />
          <circle r="1.8" class="icon-target-dot" />
        </g>
        <!-- skipped：斜杠圆 -->
        <g v-else-if="stateOf(n.id) === 'skipped'">
          <circle r="4.2" class="icon-skipped" />
          <line x1="-2.9" y1="2.9" x2="2.9" y2="-2.9" class="icon-skipped" />
        </g>
        <!-- pending：空心圆 -->
        <circle v-else r="4.2" class="icon-pending" />
      </g>

      <text :x="n.w / 2 + 5" :y="n.h / 2 + 1" class="node-label" :class="[stateOf(n.id), { active: n.id === actionableId }]">{{ n.label }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PhaseState } from '@/api'

const props = defineProps<{ phases: Record<string, PhaseState>; actionableId?: string }>()
defineEmits<{ phaseClick: [phaseId: string] }>()

/* 画布与几何：所有节点统一 80×32（rx6），主干水平间距 110 */
const W = 600
const H = 118
const TRUNK_Y = 78
const BRANCH_Y = 26

interface NodeBox { id: string; label: string; x: number; y: number; w: number; h: number }

const layout: NodeBox[] = [
  { id: 'brd', label: 'BRD', x: 62, y: TRUNK_Y, w: 80, h: 32 },
  { id: 'prd', label: 'PRD', x: 172, y: TRUNK_Y, w: 80, h: 32 },
  { id: 'explore', label: 'Explore', x: 282, y: BRANCH_Y, w: 80, h: 32 },
  { id: 'design', label: 'Design', x: 282, y: TRUNK_Y, w: 80, h: 32 },
  { id: 'plan', label: 'Plan', x: 392, y: TRUNK_Y, w: 80, h: 32 },
  { id: 'testplan', label: 'Test', x: 502, y: BRANCH_Y, w: 80, h: 32 },
  { id: 'apply', label: 'Apply', x: 502, y: TRUNK_Y, w: 80, h: 32 },
]

const pos = Object.fromEntries(layout.map((n) => [n.id, n]))

interface EdgeDef { from: string; to: string; weak: boolean }
const edges: EdgeDef[] = [
  { from: 'brd', to: 'prd', weak: false },
  { from: 'prd', to: 'explore', weak: true },
  { from: 'prd', to: 'design', weak: false },
  { from: 'explore', to: 'design', weak: true },
  { from: 'design', to: 'plan', weak: false },
  { from: 'design', to: 'testplan', weak: true },
  { from: 'plan', to: 'apply', weak: false },
  { from: 'testplan', to: 'apply', weak: true },
]

const stateOf = (id: string): PhaseState => props.phases[id] ?? 'pending'

/** CLI 真实状态里的中途态（outlining / confirmed）：已有产物但未落盘完成 */
const isDraft = (id: string) => {
  const s = stateOf(id)
  return s === 'outlining' || s === 'confirmed'
}

/** 连线颜色跟随状态：双 done→浅绿，源 done 且目标可推进→浅蓝，其余→灰；弱依赖恒为灰虚线 */
function edgeColor(e: EdgeDef): 'green' | 'blue' | 'grey' {
  if (e.weak) return 'grey'
  const s = stateOf(e.from)
  const t = stateOf(e.to)
  if (s === 'done' && t === 'done') return 'green'
  if (s === 'done' && e.to === props.actionableId) return 'blue'
  return 'grey'
}
const edgePaths = computed(() =>
  edges.map((e) => {
    const a = pos[e.from]
    const b = pos[e.to]
    const x1 = a.x + a.w / 2
    const y1 = a.y
    const x2 = b.x - b.w / 2 - 6 // 留出箭头位
    const y2 = b.y
    let d: string
    if (y1 === y2) {
      d = `M ${x1} ${y1} L ${x2} ${y2}`
    } else {
      // 圆角过渡的三次贝塞尔
      const mx = (x1 + x2) / 2
      d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
    }
    const color = edgeColor(e)
    return { d, color, cls: [e.weak ? 'weak' : 'strong', color] }
  }),
)
</script>

<style scoped>
.dag { width: 100%; height: 108px; display: block; }

/* 连线：主干 1.5px，分支 1px 灰虚线 */
.edge.strong { stroke-width: 1.5; }
.edge.weak { stroke-width: 1; stroke-dasharray: 4 4; }
.edge.green { stroke: #95d475; }
.edge.blue { stroke: #79bbff; }
.edge.grey { stroke: #dcdfe6; }

.node-g { cursor: pointer; }
.node-g:hover .node { filter: brightness(0.98); }
.node { stroke-width: 1.2; transition: all 0.2s; }

/* done：浅绿填充 + 绿描边 + 绿字 */
.node.done { fill: #f0f9eb; stroke: #95d475; }
/* active：白底 + 蓝描边 */
.node.pending.active { fill: #ffffff; stroke: #165dff; stroke-width: 1.5; }
/* pending：白底浅灰描边 */
.node.pending:not(.active) { fill: #ffffff; stroke: #dcdfe6; }
/* skipped：白底灰虚线，存在感弱化 */
.node.skipped { fill: #ffffff; stroke: #c9cdd4; stroke-dasharray: 4 3; }
/* draft：琥珀描边，表示已产出草稿但未完成 */
.node.draft { fill: #fffaf0; stroke: #e6a23c; }

.node-label { text-anchor: middle; dominant-baseline: middle; font-size: 11.5px; font-weight: 500; }
.node-label.done { fill: #529b2e; font-weight: 600; }
.node-label.pending { fill: #86909c; }
.node-label.pending.active { fill: #165dff; font-weight: 600; }
.node-label.skipped { fill: #a8abb2; opacity: 0.8; text-decoration: line-through; }
.node-label.outlining, .node-label.confirmed { fill: #b88230; font-weight: 600; }

.state-icon .icon-draft { stroke: #e6a23c; stroke-width: 1.4; fill: none; }
.state-icon .icon-draft-fill { fill: #f3d19e; stroke: none; }

.state-icon .icon-done-bg { fill: #67c23a; }
.state-icon .icon-check { stroke: #fff; stroke-width: 1.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
.state-icon .icon-target-ring { stroke: #165dff; stroke-width: 1.5; fill: none; }
.state-icon .icon-target-dot { fill: #165dff; animation: pulse 1.6s ease-in-out infinite; }
.state-icon .icon-pending { stroke: #c9cdd4; stroke-width: 1.4; fill: none; }
.state-icon .icon-skipped { stroke: #c9cdd4; stroke-width: 1.4; fill: none; opacity: 0.8; }
@keyframes pulse { 50% { opacity: 0.3; } }
</style>
