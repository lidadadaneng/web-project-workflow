<template>
  <div ref="el" :style="{ height, width: '100%' }"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { GraphData, GraphNode } from '@/api'
import { LEVEL_COLORS, EDGE_STYLE } from './graph-theme'

const props = withDefaults(defineProps<{
  data: GraphData
  height?: string
  highlightIds?: string[]
  focusId?: string
}>(), { height: '560px', highlightIds: () => [] })

const emit = defineEmits<{ nodeClick: [node: GraphNode] }>()

const el = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

function render() {
  if (!chart) return
  const { nodes, edges } = props.data
  const levels = ['C', 'L1', 'L2', 'L3']
  const highlight = new Set(props.highlightIds)

  chart.setOption({
    tooltip: {
      formatter: (p: { dataType: string; data: { name?: string; level?: string; type?: string; edgeType?: string; weight?: number } }) => {
        if (p.dataType === 'edge') {
          return `${p.data.edgeType}${p.data.weight != null ? ` · 权重 ${p.data.weight}` : ''}`
        }
        return `${p.data.name}<br/><span style="color:#909399">${p.data.level} · ${p.data.type}</span>`
      },
    },
    legend: { data: levels.map((l) => ({ name: l })), bottom: 0 },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      draggable: true,
      categories: levels.map((l) => ({ name: l, itemStyle: { color: LEVEL_COLORS[l] } })),
      force: { repulsion: 120, edgeLength: [30, 90], gravity: 0.08 },
      label: { show: true, fontSize: 10, color: '#606266', formatter: (p: { data: { shortName: string } }) => p.data.shortName },
      emphasis: { focus: 'adjacency', label: { fontSize: 12, fontWeight: 600 } },
      nodes: nodes.map((n) => {
        const isFocus = highlight.has(n.id)
        return {
          id: n.id,
          name: n.name,
          shortName: n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name,
          level: n.level,
          type: n.type,
          category: levels.indexOf(n.level),
          symbolSize: n.level === 'C' ? 34 : n.level === 'L1' ? 30 : n.level === 'L2' ? 20 : 12,
          itemStyle: isFocus ? { borderColor: '#f56c6c', borderWidth: 3, shadowBlur: 12, shadowColor: 'rgba(245,108,108,.5)' } : undefined,
          raw: n,
        }
      }),
      edges: edges.map((e) => {
        const style = EDGE_STYLE[e.type] ?? EDGE_STYLE.contain
        return {
          source: e.source,
          target: e.target,
          edgeType: e.type,
          weight: e.weight,
          lineStyle: {
            color: style.color,
            width: style.width,
            type: style.type,
            curveness: e.type === 'business_map' ? 0.25 : 0.05,
            opacity: e.type === 'business_map' ? 0.95 : 0.55,
          },
        }
      }),
    }],
  }, { notMerge: true })

  chart.off('click')
  chart.on('click', (p) => {
    if (p.dataType === 'node') {
      emit('nodeClick', (p.data as { raw: GraphNode }).raw)
    }
  })

  if (props.focusId) {
    chart.dispatchAction({ type: 'highlight', seriesIndex: 0, dataIndex: nodes.findIndex((n) => n.id === props.focusId) })
  }
}

onMounted(() => {
  chart = echarts.init(el.value!)
  render()
  window.addEventListener('resize', resize)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
})
watch(() => [props.data, props.highlightIds, props.focusId], render, { deep: true })

function resize() { chart?.resize() }
</script>
