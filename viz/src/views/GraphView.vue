<template>
  <div class="graph-page">
    <el-card class="page-card control-card">
      <div class="controls">
        <div class="ctrl">
          <span class="ctrl-label">层级</span>
          <el-checkbox-group v-model="levels">
            <el-checkbox v-for="l in ['C', 'L1', 'L2', 'L3']" :key="l" :value="l">
              <span class="lv-tag" :style="{ background: levelColor(l) }"></span>{{ l }}
            </el-checkbox>
          </el-checkbox-group>
        </div>
        <div class="ctrl">
          <span class="ctrl-label">边类型</span>
          <el-checkbox-group v-model="edgeTypes">
            <el-checkbox v-for="t in ['contain', 'import', 'call', 'business_map']" :key="t" :value="t">{{ t }}</el-checkbox>
          </el-checkbox-group>
        </div>
        <div class="ctrl">
          <span class="ctrl-label">搜索</span>
          <el-input v-model="keyword" placeholder="节点名称，回车定位" clearable style="width: 220px" @keyup.enter="locate" />
        </div>
        <div class="ctrl">
          <el-switch v-model="onlyBusinessMap" active-text="仅看 business_map" />
        </div>
        <div class="ctrl">
          <span class="ctrl-label">节点上限</span>
          <el-slider v-model="nodeLimit" :min="40" :max="400" :step="20" style="width: 140px" />
        </div>
      </div>
    </el-card>

    <el-card>
      <template #header>
        <span>知识图谱（{{ filtered.nodes.length }} 节点 / {{ filtered.edges.length }} 边）</span>
      </template>
      <GraphCanvas :data="filtered" :focus-id="focusId" @node-click="showDetail" />
    </el-card>

    <el-drawer v-model="detailVisible" title="节点详情" size="420px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="id"><span class="mono">{{ current.id }}</span></el-descriptions-item>
          <el-descriptions-item label="level">
            <el-tag size="small" :style="{ background: levelColor(current.level), color: '#fff', border: 'none' }">{{ current.level }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="type">{{ current.type }}</el-descriptions-item>
          <el-descriptions-item label="name">{{ current.name }}</el-descriptions-item>
        </el-descriptions>
        <h4>attrs</h4>
        <pre class="mono attrs">{{ JSON.stringify(current.attrs ?? {}, null, 2) }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getGraph, getMeta, type GraphData, type GraphNode } from '@/api'
import GraphCanvas from '@/components/GraphCanvas.vue'
import { LEVEL_COLORS } from '@/components/graph-theme'

const raw = ref<GraphData>({ nodes: [], edges: [] })
const levels = ref(['C', 'L1', 'L2', 'L3'])
const edgeTypes = ref(['contain', 'import', 'call', 'business_map'])
const keyword = ref('')
const onlyBusinessMap = ref(false)
const nodeLimit = ref(200)
const focusId = ref('')
const detailVisible = ref(false)
const current = ref<GraphNode | null>(null)

const levelColor = (l: string) => LEVEL_COLORS[l] ?? '#909399'

const filtered = computed<GraphData>(() => {
  let nodes = raw.value.nodes.filter((n) => levels.value.includes(n.level))
  // 规模保护：超上限时优先裁剪 L3
  if (nodes.length > nodeLimit.value) {
    const keep = nodes.filter((n) => n.level !== 'L3')
    const budget = Math.max(0, nodeLimit.value - keep.length)
    nodes = [...keep, ...nodes.filter((n) => n.level === 'L3').slice(0, budget)]
  }
  const ids = new Set(nodes.map((n) => n.id))
  let edges = raw.value.edges.filter(
    (e) => edgeTypes.value.includes(e.type) && ids.has(e.source) && ids.has(e.target),
  )
  if (onlyBusinessMap.value) {
    edges = edges.filter((e) => e.type === 'business_map')
    const used = new Set(edges.flatMap((e) => [e.source, e.target]))
    nodes = nodes.filter((n) => used.has(n.id) || n.level === 'C')
  }
  return { nodes, edges }
})

function locate() {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return
  const hit = filtered.value.nodes.find((n) => n.name.toLowerCase().includes(kw))
  if (hit) {
    focusId.value = hit.id
    current.value = hit
    detailVisible.value = true
  } else {
    ElMessage.warning(`当前视图中未找到「${keyword.value}」`)
  }
}

function showDetail(n: GraphNode) {
  current.value = n
  detailVisible.value = true
}

onMounted(async () => {
  // 图谱名以工作区配置为准（多图谱工作区可能是非 default 的名字）
  try {
    const meta = await getMeta()
    raw.value = await getGraph(meta.graph)
  } catch {
    raw.value = await getGraph()
  }
})
</script>

<style scoped>
.controls { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; }
.ctrl { display: flex; align-items: center; gap: 8px; }
.ctrl-label { font-size: 13px; color: var(--el-text-color-secondary); white-space: nowrap; }
.lv-tag { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; }
.attrs { background: var(--el-fill-color); padding: 12px; border-radius: 6px; font-size: 12px; overflow-x: auto; }
</style>
