<template>
  <div>
    <el-card class="page-card">
      <template #header>
        <div class="board-header">
          <span>需求列表（{{ store.changes.value.length }}）</span>
          <div class="legend">
            <span class="lg"><i class="dot done"></i>done</span>
            <span class="lg"><i class="dot pending"></i>pending</span>
            <span class="lg"><i class="dot skipped"></i>skipped</span>
            <span class="lg"><i class="line solid"></i>强依赖</span>
            <span class="lg"><i class="line dashed"></i>弱依赖/可选</span>
            <span class="lg muted">点击阶段节点可执行操作</span>
          </div>
        </div>
      </template>

      <el-table :data="store.changes.value" highlight-current-row>
        <el-table-column prop="name" label="需求" width="200">
          <template #default="{ row }"><span class="mono">{{ row.name }}</span></template>
        </el-table-column>
        <el-table-column label="六阶段 DAG" min-width="500">
          <template #default="{ row }">
            <PhaseDag
              :phases="row.phases"
              :actionable-id="store.nextActionable(row) ?? ''"
              @phase-click="(pid) => openPhase(row, pid)"
            />
          </template>
        </el-table-column>
        <el-table-column label="任务" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.tasks.total" size="small">{{ row.tasks.done }}/{{ row.tasks.total }}</el-tag>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="store.nextActionable(row)"
              type="primary"
              size="small"
              @click="openPhase(row, store.nextActionable(row)!)"
            >
              继续：{{ labelOf(store.nextActionable(row)!) }}
            </el-button>
            <el-tag v-else type="success" size="small">已流转完</el-tag>
            <el-button size="small" text @click="openDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 阶段操作面板 -->
    <PhaseActionDrawer
      v-if="actionTarget"
      v-model:visible="actionVisible"
      :change="actionTarget"
      :phase-id="actionPhase"
      :detail="store.detail.value"
    />

    <!-- 需求详情（只读） -->
    <el-drawer v-model="detailVisible" :title="store.detail.value?.name" size="480px">
      <template v-if="store.detail.value">
        <el-alert
          v-for="w in store.detail.value.warnings"
          :key="w"
          :title="w"
          type="warning"
          :closable="false"
          style="margin-bottom: 16px"
        />
        <el-descriptions :column="2" border size="small" style="margin-bottom: 20px">
          <el-descriptions-item label="Schema">{{ store.detail.value.schema }}</el-descriptions-item>
          <el-descriptions-item label="项目类型">{{ store.detail.value.projectType }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ new Date(store.detail.value.createdAt).toLocaleString('zh-CN') }}</el-descriptions-item>
          <el-descriptions-item label="Explore 拍板">
            <el-tag v-if="store.detail.value.exploreDecision" size="small" type="success">{{ store.detail.value.exploreDecision }}</el-tag>
            <span v-else class="muted">未拍板 / 已跳过</span>
          </el-descriptions-item>
        </el-descriptions>

        <h4>Plan 任务进度（{{ store.detail.value.tasks.done }}/{{ store.detail.value.tasks.total }}）</h4>
        <el-progress
          :percentage="store.detail.value.tasks.total ? Math.round((store.detail.value.tasks.done / store.detail.value.tasks.total) * 100) : 0"
          :stroke-width="10"
          style="margin-bottom: 12px"
        />
        <div v-for="t in store.detail.value.planTasks" :key="t.id" class="task-row">
          <el-icon v-if="t.state === 'done'" color="#67c23a"><CircleCheckFilled /></el-icon>
          <el-icon v-else-if="t.state === 'in-progress'" color="#e6a23c"><Loading /></el-icon>
          <el-icon v-else color="#c0c4cc"><Clock /></el-icon>
          <span :class="{ 'task-done': t.state === 'done' }">{{ t.title }}</span>
        </div>

        <h4 style="margin-top: 20px">阶段制品</h4>
        <div v-for="d in store.detail.value.docs" :key="d.phase" class="doc-row">
          <el-tag size="small" :type="d.exists ? 'primary' : 'info'" effect="plain">{{ d.phase.toUpperCase() }}</el-tag>
          <span class="mono">{{ d.file }}</span>
          <el-icon v-if="d.exists" color="#67c23a"><Check /></el-icon>
          <span v-else class="muted">未生成</span>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { ChangeItem } from '@/api'
import { useWorkflowStore, PHASE_DEFS } from '@/store/workflow'
import PhaseDag from '@/components/PhaseDag.vue'
import PhaseActionDrawer from '@/components/PhaseActionDrawer.vue'

const store = useWorkflowStore()

const actionVisible = ref(false)
const actionTarget = ref<ChangeItem | null>(null)
const actionPhase = ref('')
const detailVisible = ref(false)

const labelOf = (id: string) => PHASE_DEFS.find((p) => p.id === id)?.label ?? id

function openPhase(change: ChangeItem, phaseId: string) {
  actionTarget.value = change
  actionPhase.value = phaseId
  actionVisible.value = true
}

async function openDetail() {
  await store.load()
  detailVisible.value = true
}

onMounted(() => store.load())
</script>

<style scoped>
.board-header { display: flex; justify-content: space-between; align-items: center; }
.legend { display: flex; gap: 14px; font-size: 12px; color: var(--el-text-color-secondary); align-items: center; }
.lg { display: inline-flex; align-items: center; gap: 4px; }
.dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.dot.done { background: #67c23a; }
.dot.pending { background: #c0c4cc; }
.dot.skipped { background: #fff; border: 2px dashed #c0c4cc; width: 6px; height: 6px; }
.line { width: 18px; display: inline-block; }
.line.solid { border-top: 2px solid #409eff; }
.line.dashed { border-top: 2px dashed #909399; }
.muted { color: var(--el-text-color-placeholder); }
.task-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 14px; }
.task-done { text-decoration: line-through; color: var(--el-text-color-secondary); }
.doc-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
</style>
