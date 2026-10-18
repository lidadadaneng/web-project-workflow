<template>
  <div>
    <el-card class="page-card">
      <template #header>归档时间轴（wpw/archived/YYYY-MM）</template>
      <el-timeline style="padding-left: 8px">
        <el-timeline-item
          v-for="group in grouped"
          :key="group.month"
          :timestamp="group.month"
          placement="top"
          type="primary"
          :hollow="false"
        >
          <el-card shadow="never">
            <div
              v-for="c in group.items"
              :key="c.name"
              class="arch-row"
              @click="open(c)"
            >
              <span class="mono arch-name">{{ c.name }}</span>
              <span class="muted">归档于 {{ new Date(c.archivedAt).toLocaleDateString('zh-CN') }}</span>
              <el-tag v-for="d in c.docs" :key="d.title" size="small" effect="plain">{{ d.title }}</el-tag>
            </div>
          </el-card>
        </el-timeline-item>
      </el-timeline>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="current?.name" width="720px" top="6vh">
      <el-tabs v-if="current">
        <el-tab-pane v-for="d in current.docs" :key="d.title" :label="d.title">
          <MarkdownView :source="d.markdown" />
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getArchived, type ArchivedChange } from '@/api'
import MarkdownView from '@/components/MarkdownView.vue'

const archived = ref<ArchivedChange[]>([])
const current = ref<ArchivedChange | null>(null)
const dialogVisible = ref(false)

const grouped = computed(() => {
  const map = new Map<string, ArchivedChange[]>()
  for (const c of archived.value) {
    if (!map.has(c.month)) map.set(c.month, [])
    map.get(c.month)!.push(c)
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, items]) => ({ month, items }))
})

function open(c: ArchivedChange) {
  current.value = c
  dialogVisible.value = true
}

onMounted(async () => {
  // 尚无归档属于正常空态（wpw/archived 可能不存在）
  archived.value = (await getArchived().catch(() => [])) ?? []
})
</script>

<style scoped>
.arch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.arch-row:hover { background: var(--el-fill-color-light); }
.arch-name { font-weight: 600; }
.muted { color: var(--el-text-color-placeholder); font-size: 13px; }
</style>
