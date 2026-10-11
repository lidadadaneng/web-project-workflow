<template>
  <div class="md-view mono-reset" v-html="html"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps<{ source: string }>()
const html = computed(() => marked.parse(props.source ?? '') as string)
</script>

<style scoped>
.md-view :deep(h1) { font-size: 20px; border-bottom: 1px solid var(--el-border-color-light); padding-bottom: 8px; }
.md-view :deep(h2) { font-size: 17px; margin-top: 20px; }
.md-view :deep(h3) { font-size: 15px; }
.md-view :deep(code) { background: var(--el-fill-color); padding: 2px 6px; border-radius: 4px; font-family: Consolas, monospace; }
.md-view :deep(pre) { background: var(--el-fill-color); padding: 12px; border-radius: 6px; overflow-x: auto; }
.md-view :deep(pre code) { background: none; padding: 0; }
.md-view :deep(li) { line-height: 1.8; }
</style>
