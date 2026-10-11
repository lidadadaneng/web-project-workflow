<template>
  <div>
    <el-card class="page-card">
      <template #header>
        <div class="head">
          <span>Token 消耗统计</span>
          <el-radio-group v-model="dim" size="small">
            <el-radio-button value="byChange">按需求</el-radio-button>
            <el-radio-button value="byPhase">按阶段</el-radio-button>
            <el-radio-button value="byTime">按时间</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <div ref="chartRef" style="height: 380px"></div>
    </el-card>

    <el-row :gutter="16">
      <el-col :span="8">
        <el-card><div class="num">{{ total.input.toLocaleString() }}</div><div class="lbl">输入 Token</div></el-card>
      </el-col>
      <el-col :span="8">
        <el-card><div class="num">{{ total.output.toLocaleString() }}</div><div class="lbl">输出 Token</div></el-card>
      </el-col>
      <el-col :span="8">
        <el-card><div class="num">{{ ratio }}</div><div class="lbl">输入/输出比</div></el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { getTokenStats, type TokenStats } from '@/api'

const stats = ref<TokenStats | null>(null)
const dim = ref<'byChange' | 'byPhase' | 'byTime'>('byChange')
const chartRef = ref<HTMLElement>()
let chart: echarts.ECharts | null = null

const total = computed(() => {
  const list = stats.value?.byTime ?? []
  return {
    input: list.reduce((s, d) => s + d.input, 0),
    output: list.reduce((s, d) => s + d.output, 0),
  }
})
const ratio = computed(() => (total.value.output ? (total.value.input / total.value.output).toFixed(1) + ' : 1' : '-'))

function render() {
  if (!chart || !stats.value) return
  const rows = stats.value[dim.value] as { name?: string; phase?: string; date?: string; input: number; output: number }[]
  const labels = rows.map((r) => r.name ?? r.phase ?? r.date ?? '')
  const isTime = dim.value === 'byTime'
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['输入', '输出'] },
    grid: { left: 60, right: 24, top: 40, bottom: 60 },
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: isTime ? 0 : 18 } },
    yAxis: { type: 'value' },
    series: [
      { name: '输入', type: isTime ? 'line' : 'bar', stack: 't', smooth: true, areaStyle: isTime ? { opacity: 0.2 } : undefined, data: rows.map((r) => r.input), itemStyle: { color: '#409eff' } },
      { name: '输出', type: isTime ? 'line' : 'bar', stack: 't', smooth: true, areaStyle: isTime ? { opacity: 0.2 } : undefined, data: rows.map((r) => r.output), itemStyle: { color: '#67c23a' } },
    ],
  }, { notMerge: true })
}

onMounted(async () => {
  stats.value = await getTokenStats()
  chart = echarts.init(chartRef.value!)
  render()
})
watch(dim, render)
</script>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: center; }
.num { font-size: 26px; font-weight: 700; color: var(--el-color-primary); }
.lbl { color: var(--el-text-color-secondary); font-size: 13px; margin-top: 4px; }
</style>
