<template>
  <div>
    <!-- 页头：标题 + 副标题 + 搜索 -->
    <div class="page-head">
      <div>
        <div class="page-title">工作流看板</div>
        <div class="page-sub">查看和管理所有工作流的执行状态与节点信息</div>
      </div>
      <el-input
        v-model="keyword"
        class="search-input"
        placeholder="搜索工作流名称…"
        clearable
        :prefix-icon="Search"
      />
    </div>

    <!-- 状态页签 -->
    <div class="tabs">
      <span
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ on: activeTab === t.key }"
        @click="activeTab = t.key"
      >
        {{ t.label }}（{{ t.count }}）
      </span>
    </div>

    <!-- 需求卡片行 -->
    <div v-for="row in filtered" :key="row.name" class="change-card">
      <!-- 左：状态点 + 名称 + 描述 + 时间/标签 -->
      <div class="col-info">
        <div class="name-row">
          <i class="status-dot" :class="statusOf(row)"></i>
          <span class="name mono">{{ row.name }}</span>
        </div>
        <div class="desc">{{ row.description ?? row.projectType }}</div>
        <div class="meta">
          <el-icon :size="13"><Clock /></el-icon>
          <span>{{ formatTime(row.createdAt) }}</span>
          <span v-if="row.tag" class="tag"># {{ row.tag }}</span>
        </div>
      </div>

      <!-- 中：阶段 DAG -->
      <div class="col-dag">
        <PhaseDag
          :phases="row.phases"
          :actionable-id="store.nextActionable(row) ?? ''"
          @phase-click="(pid) => openPhase(row, pid)"
        />
      </div>

      <!-- 右：进度 + 状态标签 + 详情 -->
      <div class="col-side">
        <div class="side-top">
          <div class="progress-box">
            <div class="mini-bar">
              <div
                class="mini-fill"
                :class="statusOf(row)"
                :style="{ width: row.tasks.total ? `${(row.tasks.done / row.tasks.total) * 100}%` : '0%' }"
              ></div>
            </div>
            <div class="mini-num">
              {{ row.tasks.total ? `${row.tasks.done}/${row.tasks.total} 任务` : '未进入 Apply' }}
            </div>
          </div>
          <span class="status-tag" :class="statusOf(row)">
            <i class="status-dot" :class="statusOf(row)"></i>{{ statusText(row) }}
          </span>
          <el-dropdown trigger="click" @command="(cmd: string) => onCommand(cmd, row)">
            <el-button text class="more-btn"><el-icon><MoreFilled /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="continue" :disabled="!store.nextActionable(row)">
                  继续：{{ store.nextActionable(row) ? labelOf(store.nextActionable(row)!) : '无' }}
                </el-dropdown-item>
                <el-dropdown-item command="detail">查看详情</el-dropdown-item>
                <el-dropdown-item command="reset" divided>重置演示数据</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div class="side-bottom">
          <el-button text type="primary" class="detail-link" @click="openDetail">详情 &gt;</el-button>
        </div>
      </div>
    </div>

    <el-empty v-if="!filtered.length" description="没有匹配的工作流" :image-size="80" />

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
          <el-descriptions-item label="创建时间">{{ formatTime(store.detail.value.createdAt) }}</el-descriptions-item>
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
import { computed, onMounted, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import type { ChangeItem } from '@/api'
import { useWorkflowStore, PHASE_DEFS } from '@/store/workflow'
import PhaseDag from '@/components/PhaseDag.vue'
import PhaseActionDrawer from '@/components/PhaseActionDrawer.vue'

const store = useWorkflowStore()

const keyword = ref('')
const activeTab = ref<'all' | 'running' | 'finished' | 'failed'>('all')
const actionVisible = ref(false)
const actionTarget = ref<ChangeItem | null>(null)
const actionPhase = ref('')
const detailVisible = ref(false)

const labelOf = (id: string) => PHASE_DEFS.find((p) => p.id === id)?.label ?? id

/** 需求整体状态：全部流转完 → finished；已有阶段推进 → running；未启动 → pending（失败态暂无来源，恒 0） */
function statusOf(c: ChangeItem): 'finished' | 'running' | 'pending' {
  const states = Object.values(c.phases)
  const started = states.some((s) => s === 'done' || s === 'skipped')
  if (!store.nextActionable(c) && c.phases.apply === 'done') return 'finished'
  return started ? 'running' : 'pending'
}

const statusText = (c: ChangeItem) => ({ finished: '已流转完', running: '进行中', pending: '未开始' })[statusOf(c)]

const tabs = computed(() => {
  const list = store.changes.value
  return [
    { key: 'all' as const, label: '全部', count: list.length },
    { key: 'running' as const, label: '运行中', count: list.filter((c) => statusOf(c) !== 'finished').length },
    { key: 'finished' as const, label: '已完成', count: list.filter((c) => statusOf(c) === 'finished').length },
    { key: 'failed' as const, label: '失败', count: 0 },
  ]
})

const filtered = computed(() => {
  let list = store.changes.value
  if (activeTab.value === 'running') list = list.filter((c) => statusOf(c) !== 'finished')
  else if (activeTab.value === 'finished') list = list.filter((c) => statusOf(c) === 'finished')
  else if (activeTab.value === 'failed') list = []
  const kw = keyword.value.trim().toLowerCase()
  if (kw) list = list.filter((c) => c.name.toLowerCase().includes(kw) || (c.description ?? '').toLowerCase().includes(kw))
  return list
})

const formatTime = (t: number) =>
  new Date(t).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function openPhase(change: ChangeItem, phaseId: string) {
  actionTarget.value = change
  actionPhase.value = phaseId
  actionVisible.value = true
}

async function openDetail() {
  await store.load()
  detailVisible.value = true
}

function onCommand(cmd: string, row: ChangeItem) {
  if (cmd === 'continue') {
    const next = store.nextActionable(row)
    if (next) openPhase(row, next)
  } else if (cmd === 'detail') {
    openDetail()
  } else if (cmd === 'reset') {
    localStorage.removeItem('wpw-viz-workflow-state')
    location.reload()
  }
}

onMounted(() => store.load())
</script>

<style scoped>
/* 页头 */
.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 16px;
}
.page-title { font-size: 20px; font-weight: 600; color: #1d2129; }
.page-sub { font-size: 13px; color: #86909c; margin-top: 4px; }
.search-input { width: 260px; }

/* 状态页签 */
.tabs {
  display: flex;
  gap: 28px;
  border-bottom: 1px solid #e5e6eb;
  margin-bottom: 16px;
}
.tab {
  padding: 8px 2px;
  font-size: 14px;
  color: #4e5969;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab.on { color: #165dff; font-weight: 500; border-bottom-color: #165dff; }

/* 需求卡片行 */
.change-card {
  display: grid;
  grid-template-columns: 230px 1fr 260px;
  align-items: center;
  gap: 32px;
  background: #ffffff;
  border: 1px solid #e5e6eb;
  border-radius: 8px;
  padding: 18px 24px;
  margin-bottom: 14px;
  transition: box-shadow 0.2s;
}
.change-card:hover { box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04); }

/* 左列：状态点 + 名称 + 描述 + 元信息 */
.col-info .name-row { display: flex; align-items: center; gap: 8px; }
.col-info .name { font-size: 15px; font-weight: 600; color: #1d2129; }
.col-info .desc { font-size: 13px; color: #4e5969; margin-top: 4px; }
.col-info .meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #86909c;
  margin-top: 10px;
}
.col-info .tag {
  background: #f2f3f5;
  color: #86909c;
  border-radius: 4px;
  padding: 1px 8px;
  margin-left: 4px;
}

.status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.status-dot.finished { background: #67c23a; }
.status-dot.running { background: #165dff; }
.status-dot.pending { background: #c9cdd4; }

/* 右列：进度 + 状态标签 + 更多 + 详情 */
.col-side { display: flex; flex-direction: column; gap: 12px; }
.side-top { display: flex; align-items: center; gap: 14px; }
.progress-box { flex: 1; display: flex; flex-direction: column; gap: 6px; }
.mini-bar { height: 6px; background: #f2f3f5; border-radius: 3px; overflow: hidden; }
.mini-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
.mini-fill.finished { background: #67c23a; }
.mini-fill.running { background: #165dff; }
.mini-fill.pending { background: #c9cdd4; }
.mini-num { font-size: 12px; color: #86909c; }

.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  border-radius: 12px;
  padding: 3px 10px;
  white-space: nowrap;
}
.status-tag.finished { background: #f0f9eb; color: #529b2e; }
.status-tag.running { background: #e8f3ff; color: #165dff; }
.status-tag.pending { background: #f2f3f5; color: #86909c; }

.more-btn { padding: 4px; color: #86909c; }
.side-bottom { display: flex; justify-content: flex-end; }
.detail-link { font-size: 13px; }

.muted { color: #a8abb2; font-size: 12px; }
.task-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 14px; }
.task-done { text-decoration: line-through; color: #909399; }
.doc-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
</style>
