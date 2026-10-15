<template>
  <div v-if="stat">
    <el-row :gutter="16">
      <el-col :span="8">
        <el-card class="page-card">
          <template #header>节点层级分布（共 {{ stat.totalNodes }}）</template>
          <div ref="levelRef" style="height: 260px"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="page-card">
          <template #header>边类型分布（共 {{ stat.totalEdges }}）</template>
          <div ref="edgeRef" style="height: 260px"></div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="page-card">
          <template #header>business_map 多源证据</template>
          <div ref="evidenceRef" style="height: 260px"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="12">
        <el-card class="page-card">
          <template #header>映射覆盖率</template>
          <div class="coverage">
            <div class="cov-item">
              <el-progress type="dashboard" :percentage="capPercent" :color="'#b37feb'">
                <template #default>
                  <div class="cov-num">{{ capPercent }}%</div>
                </template>
              </el-progress>
              <div class="cov-label">能力 → 代码映射<br />{{ stat.coverage?.mappedCapabilities }}/{{ stat.coverage?.totalCapabilities }} 个能力</div>
            </div>
            <div class="cov-item">
              <el-progress type="dashboard" :percentage="modPercent" :color="'#409eff'">
                <template #default>
                  <div class="cov-num">{{ modPercent }}%</div>
                </template>
              </el-progress>
              <div class="cov-label">模块被能力覆盖<br />{{ stat.coverage?.mappedModules }}/{{ stat.coverage?.totalModules }} 个模块</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="page-card">
          <template #header>图谱元信息</template>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="图谱名">{{ stat.graphName }}</el-descriptions-item>
            <el-descriptions-item label="Schema 版本">{{ stat.schemaVersion }}</el-descriptions-item>
            <el-descriptions-item label="构建时间">{{ new Date(stat.builtAt).toLocaleString('zh-CN') }}</el-descriptions-item>
            <el-descriptions-item label="向量索引">{{ stat.totalVectors }} 条</el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import * as echarts from 'echarts'
import { getGraphStat, getMeta, type GraphStat } from '@/api'
import { LEVEL_COLORS } from '@/components/graph-theme'

const stat = ref<GraphStat | null>(null)
const levelRef = ref<HTMLElement>()
const edgeRef = ref<HTMLElement>()
const evidenceRef = ref<HTMLElement>()

const capPercent = computed(() => {
  const c = stat.value?.coverage
  return c?.totalCapabilities ? Math.round((c.mappedCapabilities / c.totalCapabilities) * 100) : 0
})
const modPercent = computed(() => {
  const c = stat.value?.coverage
  return c?.totalModules ? Math.round((c.mappedModules / c.totalModules) * 100) : 0
})

onMounted(async () => {
  // 图谱名以工作区配置为准（多图谱工作区可能是非 default 的名字）
  try {
    const meta = await getMeta()
    stat.value = await getGraphStat(meta.graph)
  } catch {
    stat.value = await getGraphStat()
  }
  await nextTick() // v-if="stat" 渲染后再取图表容器 ref

  echarts.init(levelRef.value!).setOption({
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: ['45%', '70%'],
      label: { formatter: '{b}: {c}' },
      data: Object.entries(stat.value.nodesByLevel).map(([k, v]) => ({
        name: k, value: v, itemStyle: { color: LEVEL_COLORS[k] },
      })),
    }],
  })

  echarts.init(edgeRef.value!).setOption({
    tooltip: {},
    grid: { left: 60, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: Object.keys(stat.value.edgesByType) },
    yAxis: { type: 'value' },
    series: [{
      type: 'bar',
      data: Object.values(stat.value.edgesByType),
      itemStyle: { color: '#79bbff', borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top' },
    }],
  })

  const ev = stat.value.evidenceSources ?? []
  echarts.init(evidenceRef.value!).setOption({
    tooltip: { trigger: 'axis' },
    legend: { data: ['边数量', '平均权重'], bottom: 0 },
    grid: { left: 50, right: 50, top: 30, bottom: 60 },
    xAxis: { type: 'category', data: ev.map((e) => e.source), axisLabel: { rotate: 15 } },
    yAxis: [{ type: 'value', name: '数量' }, { type: 'value', name: '权重', max: 1 }],
    series: [
      { name: '边数量', type: 'bar', data: ev.map((e) => e.count), itemStyle: { color: '#9c36b5', borderRadius: [4, 4, 0, 0] } },
      { name: '平均权重', type: 'line', yAxisIndex: 1, data: ev.map((e) => e.avgWeight), itemStyle: { color: '#e6a23c' } },
    ],
  })
})
</script>

<style scoped>
.coverage { display: flex; justify-content: space-around; align-items: center; padding: 20px 0; }
.cov-item { text-align: center; }
.cov-num { font-size: 22px; font-weight: 700; }
.cov-label { margin-top: 12px; color: var(--el-text-color-secondary); font-size: 13px; line-height: 1.6; }
</style>
