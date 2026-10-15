<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="7">
        <el-card class="page-card">
          <template #header>能力 Spec（{{ data?.specs.length ?? 0 }}）</template>
          <div
            v-for="s in data?.specs ?? []"
            :key="s.name"
            :class="['spec-row', { active: current?.name === s.name }]"
            @click="current = s"
          >
            <div class="spec-title">{{ s.title }}</div>
            <div class="mono spec-name">{{ s.name }}</div>
            <div class="spec-time">更新于 {{ new Date(s.updatedAt).toLocaleDateString('zh-CN') }}</div>
          </div>
        </el-card>

        <el-card>
          <template #header>构建产物</template>
          <div v-for="a in data?.artifacts ?? []" :key="a.name" class="artifact">
            <div class="spec-title">{{ a.name }}</div>
            <div class="muted">
              {{ a.nodes }} 节点 · {{ a.edges }} 边 · {{ a.vectors }} 向量
            </div>
            <div class="muted">构建于 {{ new Date(a.builtAt).toLocaleString('zh-CN') }}</div>
          </div>
        </el-card>
      </el-col>

      <el-col :span="17">
        <el-card class="page-card">
          <template v-if="current">
            <MarkdownView :source="current.markdown" />
          </template>
          <el-empty v-else description="选择左侧的能力 Spec 开始阅读" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getSpecs, type CapabilitySpec, type KnowledgeData } from '@/api'
import MarkdownView from '@/components/MarkdownView.vue'

const data = ref<KnowledgeData | null>(null)
const current = ref<CapabilitySpec | null>(null)

onMounted(async () => {
  // 工作区未建知识库时 specs 为空，属于正常空态
  data.value = await getSpecs().catch(() => null)
  current.value = data.value?.specs[0] ?? null
})
</script>

<style scoped>
.spec-row {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  margin-bottom: 8px;
}
.spec-row:hover { background: var(--el-fill-color-light); }
.spec-row.active { border-color: var(--el-color-primary); background: var(--el-color-primary-light-9); }
.spec-title { font-weight: 600; }
.spec-name { font-size: 12px; color: var(--el-text-color-secondary); margin: 2px 0; }
.spec-time { font-size: 12px; color: var(--el-text-color-placeholder); }
.artifact { padding: 8px 0; }
.muted { color: var(--el-text-color-placeholder); font-size: 12px; }
</style>
