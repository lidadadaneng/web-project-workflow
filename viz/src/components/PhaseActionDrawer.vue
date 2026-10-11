<template>
  <el-drawer
    :model-value="visible"
    :title="`${change.name} · ${def?.label ?? ''} ${def?.name ?? ''}`"
    size="440px"
    @update:model-value="$emit('update:visible', $event)"
  >
    <template v-if="def">
      <!-- 依赖检查（镜像 CLI check 规则） -->
      <el-result
        v-if="!check.canProceed"
        icon="error"
        title="前置依赖未满足"
        :sub-title="`缺少：${missingNames}`"
        style="padding: 16px 0"
      />
      <el-alert
        v-for="w in check.warnings"
        :key="w"
        :title="w"
        type="warning"
        :closable="false"
        style="margin-bottom: 12px"
      />
      <el-alert
        v-if="check.canProceed && state === 'pending'"
        title="依赖检查通过，可以开始此阶段"
        type="success"
        :closable="false"
        style="margin-bottom: 16px"
      />

      <!-- 当前状态 -->
      <el-descriptions :column="1" border size="small" style="margin-bottom: 16px">
        <el-descriptions-item label="当前状态">
          <el-tag size="small" :type="stateTag">{{ state }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="强依赖">
          {{ def.dependsOn.length ? def.dependsOn.map(labelOf).join('、') : '无' }}
        </el-descriptions-item>
        <el-descriptions-item v-if="def.optionalDeps.length" label="弱依赖">
          {{ def.optionalDeps.map(labelOf).join('、') }}
        </el-descriptions-item>
      </el-descriptions>

      <!-- AI 层命令引导 -->
      <div v-if="state === 'pending' && check.canProceed" class="cmd-guide">
        <div class="cmd-label">在 IDE 中执行（内容由 AI 层生成，状态由 CLI 写入）：</div>
        <div class="cmd-box mono">
          {{ def.command }} {{ change.name }}
          <el-button size="small" text icon="CopyDocument" @click="copyCmd" />
        </div>
      </div>

      <!-- Explore 拍板 -->
      <div v-if="def.id === 'explore' && state === 'done' && !change.exploreDecision" class="decide-box">
        <el-input v-model="decision" placeholder="输入选定方案，如 option-a-jwt" />
        <el-button type="primary" :disabled="!decision.trim()" @click="onDecide">记录拍板</el-button>
      </div>
      <el-alert
        v-else-if="def.id === 'explore' && change.exploreDecision"
        :title="`已拍板：${change.exploreDecision}`"
        type="success"
        :closable="false"
        style="margin-bottom: 16px"
      />

      <!-- Apply 任务清单 -->
      <template v-if="def.id === 'apply' && planTasks.length">
        <h4>实施任务（{{ doneCount }}/{{ planTasks.length }}）</h4>
        <div v-for="t in planTasks" :key="t.id" class="task-row" @click="store.toggleTask(t.id)">
          <el-checkbox :model-value="t.state === 'done'" @click.stop @change="store.toggleTask(t.id)" />
          <span :class="{ 'task-done': t.state === 'done' }">{{ t.title }}</span>
        </div>
      </template>

      <!-- 状态操作 -->
      <div class="actions">
        <el-button
          v-if="state === 'pending'"
          type="primary"
          :disabled="!check.canProceed"
          @click="mark('done')"
        >
          标记完成（done）
        </el-button>
        <el-button
          v-if="state === 'pending' && def.skippable"
          :disabled="!check.canProceed"
          @click="mark('skipped')"
        >
          跳过此阶段
        </el-button>
        <el-button v-if="state === 'done'" @click="mark('pending')">重置为 pending</el-button>
        <el-button v-if="state === 'skipped'" @click="mark('pending')">取消跳过</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { PHASE_DEFS, useWorkflowStore, type PhaseCheck } from '@/store/workflow'
import type { ChangeItem, ChangeDetail, PhaseState } from '@/api'

const props = defineProps<{
  visible: boolean
  change: ChangeItem
  phaseId: string
  detail: ChangeDetail | null
}>()
const emit = defineEmits<{ 'update:visible': [v: boolean] }>()

const store = useWorkflowStore()
const decision = ref('')

const def = computed(() => PHASE_DEFS.find((p) => p.id === props.phaseId))
const state = computed<PhaseState>(() => props.change.phases[props.phaseId] ?? 'pending')
const check = computed<PhaseCheck>(() => store.checkPhase(props.change, props.phaseId))
const missingNames = computed(() => check.value.missing.map(labelOf).join('、'))
const labelOf = (id: string) => PHASE_DEFS.find((p) => p.id === id)?.label ?? id

const stateTag = computed(() => ({ done: 'success', pending: 'info', skipped: 'warning' })[state.value] as 'success' | 'info' | 'warning')

const isDetailChange = computed(() => props.detail?.name === props.change.name)
const planTasks = computed(() => (isDetailChange.value ? props.detail!.planTasks : []))
const doneCount = computed(() => planTasks.value.filter((t) => t.state === 'done').length)

function mark(s: PhaseState) {
  store.setPhase(props.change.name, props.phaseId, s)
  ElMessage.success(`${def.value?.label} 已标记为 ${s}`)
}

function onDecide() {
  store.decide(props.change.name, decision.value.trim())
  ElMessage.success('已记录拍板')
}

async function copyCmd() {
  await navigator.clipboard.writeText(`${def.value?.command} ${props.change.name}`)
  ElMessage.success('命令已复制')
}
</script>

<style scoped>
.cmd-guide { margin-bottom: 16px; }
.cmd-label { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.cmd-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--el-fill-color);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 13px;
}
.decide-box { display: flex; gap: 8px; margin-bottom: 16px; }
.task-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; }
.task-done { text-decoration: line-through; color: var(--el-text-color-secondary); }
.actions { margin-top: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
</style>
