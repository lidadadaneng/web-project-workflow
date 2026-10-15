<template>
  <div>
    <!-- 输入区 -->
    <el-card class="page-card">
      <template #header>任务输入</template>
      <div class="input-row">
        <el-input
          v-model="query"
          placeholder="自然语言任务，如：购物车 / 订单 / 用户登录"
          style="max-width: 360px"
          @keyup.enter="generate"
        />
        <div class="budget">
          <span class="budget-label">Token 预算：{{ budget }}</span>
          <el-slider v-model="budget" :min="500" :max="4000" :step="100" style="width: 180px" />
        </div>
        <el-switch v-model="semantic" active-text="语义检索" />
        <el-button type="primary" icon="MagicStick" :loading="loading" :disabled="!query.trim()" @click="generate">
          生成上下文
        </el-button>
      </div>
      <div class="examples">
        <span class="muted">试试：</span>
        <el-tag v-for="q in examples" :key="q" size="small" effect="plain" class="example" @click="useExample(q)">{{ q }}</el-tag>
      </div>
    </el-card>

    <el-alert
      v-if="demo?.degraded"
      :title="demo.degraded"
      type="warning"
      :closable="false"
      style="margin-top: 12px"
    />
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      :closable="false"
      style="margin-top: 12px"
    />

    <template v-if="demo">
      <!-- 过程区 -->
      <el-row :gutter="16">
        <el-col :span="8">
          <el-card class="page-card">
            <template #header>① 锚点命中</template>
            <div v-for="a in demo.anchors" :key="a.id" class="anchor-row">
              <el-tag size="small" :style="{ background: levelColor(a.level), color: '#fff', border: 'none' }">{{ a.level }}</el-tag>
              <div class="anchor-info">
                <div class="anchor-name">{{ a.name }}</div>
                <div class="mono anchor-id">{{ a.id }}</div>
              </div>
              <el-progress type="circle" :width="40" :percentage="Math.round(a.score * 100)" :stroke-width="4" />
            </div>
          </el-card>
        </el-col>
        <el-col :span="16">
          <el-card class="page-card">
            <template #header>② 加权双向 BFS 子图扩展（{{ demo.subgraph.nodes.length }} 节点）</template>
            <GraphCanvas :data="demo.subgraph" height="340px" :highlight-ids="anchorIds" />
          </el-card>
        </el-col>
      </el-row>

      <!-- 结果区：三档压缩对比 -->
      <el-card class="page-card">
        <template #header>③ 三档压缩对比</template>
        <el-row :gutter="16">
          <el-col v-for="r in demo.results" :key="r.level" :span="8">
            <el-card shadow="never" :class="['result-card', r.level]">
              <div class="result-head">
                <el-tag :type="tagType(r.level)" effect="dark">{{ r.level }}</el-tag>
                <div class="result-nums">
                  <span>{{ r.nodeCount }} 节点</span>
                  <span class="mono token-num" :class="{ over: r.tokenEstimate > budget }">{{ r.tokenEstimate }} tokens</span>
                </div>
              </div>
              <pre class="mono serialized">{{ r.serialized }}</pre>
              <el-button size="small" icon="CopyDocument" @click="copy(r.serialized)">复制</el-button>
            </el-card>
          </el-col>
        </el-row>
      </el-card>
    </template>
    <el-empty v-else description="输入任务并点击「生成上下文」" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getContext, type ContextDemo } from '@/api'
import GraphCanvas from '@/components/GraphCanvas.vue'
import { LEVEL_COLORS } from '@/components/graph-theme'

const query = ref('购物车')
const budget = ref(1000)
const semantic = ref(true)
const loading = ref(false)
const demo = ref<ContextDemo | null>(null)
const error = ref('')
const examples = ['购物车', '订单', '用户登录', '收货地址', '评论']

const anchorIds = computed(() => demo.value?.anchors.map((a) => a.id) ?? [])
const levelColor = (l: string) => LEVEL_COLORS[l] ?? '#909399'
const tagType = (l: string) => (l === 'loose' ? 'success' : l === 'standard' ? 'primary' : 'warning') as 'success' | 'primary' | 'warning'

function useExample(q: string) {
  query.value = q
  generate()
}

/** 真实跑一遍图谱管线：语义检索找锚点 → 加权双向 BFS 子图 → 三档压缩 */
async function generate() {
  const q = query.value.trim()
  if (!q || loading.value) return

  loading.value = true
  error.value = ''
  try {
    demo.value = await getContext({ query: q, budget: budget.value, semantic: semantic.value })
  } catch (e) {
    error.value = (e as Error).message
    ElMessage.error(error.value)
  } finally {
    loading.value = false
  }
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  ElMessage.success('已复制到剪贴板')
}
</script>

<style scoped>
.input-row { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; }
.examples { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.example { cursor: pointer; }
.muted { color: var(--el-text-color-secondary); font-size: 13px; }
.budget { display: flex; align-items: center; gap: 12px; }
.budget-label { font-size: 13px; color: var(--el-text-color-secondary); white-space: nowrap; }
.anchor-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px dashed var(--el-border-color-lighter); }
.anchor-row:last-child { border-bottom: none; }
.anchor-info { flex: 1; min-width: 0; }
.anchor-name { font-weight: 600; font-size: 14px; }
.anchor-id { font-size: 11px; color: var(--el-text-color-placeholder); }
.result-card { height: 420px; display: flex; flex-direction: column; }
.result-card :deep(.el-card__body) { display: flex; flex-direction: column; height: 100%; }
.result-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.result-nums { display: flex; flex-direction: column; align-items: flex-end; font-size: 12px; color: var(--el-text-color-secondary); }
.token-num { font-weight: 700; color: var(--el-color-primary); }
.token-num.over { color: var(--el-color-danger); }
.serialized {
  flex: 1;
  background: var(--el-fill-color);
  padding: 10px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.5;
  overflow: auto;
  white-space: pre-wrap;
  margin: 0 0 10px;
}
</style>
