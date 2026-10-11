<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="6">
        <el-card class="page-card">
          <div class="stat-num">{{ changes.length }}</div>
          <div class="stat-label">活跃需求</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="page-card">
          <div class="stat-num">{{ phaseCompletion }}%</div>
          <div class="stat-label">阶段完成度</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="page-card">
          <div class="stat-num">{{ graphStat?.totalNodes ?? '-' }}</div>
          <div class="stat-label">图谱节点 / 边 {{ graphStat?.totalEdges ?? '-' }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card class="page-card">
          <div class="stat-num">{{ totalTokens }}</div>
          <div class="stat-label">累计 Token（输入+输出）</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="12">
        <el-card class="page-card">
          <template #header>各需求阶段完成情况</template>
          <div ref="phaseChartRef" style="height: 300px"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="page-card">
          <template #header>近 7 日 Token 消耗</template>
          <div ref="tokenChartRef" style="height: 300px"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="page-card">
      <template #header>活跃需求速览</template>
      <el-table :data="changes" @row-click="(r: ChangeItem) => $router.push('/workflow')" style="cursor: pointer">
        <el-table-column prop="name" label="需求" width="220">
          <template #default="{ row }"><span class="mono">{{ row.name }}</span></template>
        </el-table-column>
        <el-table-column label="阶段进度">
          <template #default="{ row }">
            <el-progress :percentage="changeProgress(row)" :stroke-width="10" />
          </template>
        </el-table-column>
        <el-table-column label="任务" width="140">
          <template #default="{ row }">{{ row.tasks.done }}/{{ row.tasks.total }}</template>
        </el-table-column>
        <el-table-column label="创建时间" width="160">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import * as echarts from 'echarts'
import { getGraphStat, getTokenStats, type ChangeItem, type GraphStat, type TokenStats } from '@/api'
import { useWorkflowStore } from '@/store/workflow'

const store = useWorkflowStore()
const changes = store.changes
const graphStat = ref<GraphStat | null>(null)
const tokenStats = ref<TokenStats | null>(null)
const phaseChartRef = ref<HTMLElement>()
const tokenChartRef = ref<HTMLElement>()
const charts = shallowRef<echarts.ECharts[]>([])

const PHASES = ['brd', 'prd', 'explore', 'design', 'plan', 'testplan', 'apply']

const changeProgress = (c: ChangeItem) =>
  Math.round((PHASES.filter((p) => c.phases[p] === 'done').length / PHASES.length) * 100)

const phaseCompletion = computed(() => {
  if (!changes.value.length) return 0
  return Math.round(changes.value.reduce((s, c) => s + changeProgress(c), 0) / changes.value.length)
})

const totalTokens = computed(() => {
  if (!tokenStats.value) return '-'
  const sum = tokenStats.value.byTime.reduce((s, d) => s + d.input + d.output, 0)
  return sum >= 10000 ? `${(sum / 10000).toFixed(1)}w` : String(sum)
})

const formatTime = (t: number) => new Date(t).toLocaleDateString('zh-CN')

onMounted(async () => {
  await store.load()
  ;[graphStat.value, tokenStats.value] = await Promise.all([getGraphStat(), getTokenStats()])

  const phaseChart = echarts.init(phaseChartRef.value!)
  phaseChart.setOption({
    tooltip: {},
    grid: { left: 40, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: changes.value.map((c) => c.name), axisLabel: { rotate: 20 } },
    yAxis: { type: 'value', max: 7 },
    series: [{
      type: 'bar',
      data: changes.value.map((c) => PHASES.filter((p) => c.phases[p] === 'done').length),
      itemStyle: { color: '#409eff', borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top' },
    }],
  })

  const tokenChart = echarts.init(tokenChartRef.value!)
  tokenChart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['输入', '输出'] },
    grid: { left: 50, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: tokenStats.value.byTime.map((d) => d.date) },
    yAxis: { type: 'value' },
    series: [
      { name: '输入', type: 'line', smooth: true, areaStyle: { opacity: 0.15 }, data: tokenStats.value.byTime.map((d) => d.input) },
      { name: '输出', type: 'line', smooth: true, areaStyle: { opacity: 0.15 }, data: tokenStats.value.byTime.map((d) => d.output) },
    ],
  })
  charts.value = [phaseChart, tokenChart]
})
</script>

<style scoped>
.stat-num { font-size: 30px; font-weight: 700; color: var(--el-color-primary); }
.stat-label { color: var(--el-text-color-secondary); font-size: 13px; margin-top: 4px; }
</style>
