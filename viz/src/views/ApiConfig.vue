<template>
  <div class="config-wrap">
    <el-card style="max-width: 640px">
      <template #header>大模型 API 接入配置</template>
      <el-form label-width="110px" :model="form">
        <el-form-item label="Base URL">
          <el-input v-model="form.baseUrl" placeholder="https://api.deepseek.com/v1（OpenAI 兼容）" />
        </el-form-item>
        <el-form-item label="API Key">
          <el-input v-model="form.apiKey" type="password" show-password placeholder="sk-..." />
        </el-form-item>
        <el-form-item label="模型">
          <el-select v-model="form.model" placeholder="选择或输入模型" filterable allow-create style="width: 100%">
            <el-option v-for="m in models" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="save">保存配置</el-button>
          <el-button :loading="testing" @click="test">连接测试</el-button>
          <el-tag v-if="testResult === 'ok'" type="success" style="margin-left: 12px">连接成功</el-tag>
          <el-tag v-else-if="testResult === 'fail'" type="danger" style="margin-left: 12px">连接失败，请检查配置</el-tag>
        </el-form-item>
      </el-form>

      <el-divider />
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="当前配置">
          {{ form.baseUrl || '未配置' }} · {{ form.model || '-' }}
        </el-descriptions-item>
        <el-descriptions-item label="API Key">
          <span class="mono">{{ maskedKey }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="存储位置">
          <span class="mono">localStorage</span>
        </el-descriptions-item>
      </el-descriptions>
      <el-alert
        type="info"
        :closable="false"
        style="margin-top: 16px"
        title="API Key 仅保存在本地，不会写入 workflow.config.yaml 等会提交至版本库的文件。"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'

const STORAGE_KEY = 'wpw-viz-api-config'

const form = reactive({ baseUrl: '', apiKey: '', model: '' })
const models = ['deepseek-chat', 'deepseek-reasoner', 'qwen-max', 'kimi-k3', 'gpt-4o', 'claude-sonnet-5']
const testing = ref(false)
const testResult = ref<'' | 'ok' | 'fail'>('')

const maskedKey = computed(() => {
  const k = form.apiKey
  if (!k) return '未配置'
  return k.length <= 8 ? '****' : `${k.slice(0, 3)}****${k.slice(-4)}`
})

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
  ElMessage.success('配置已保存到本地')
}

function test() {
  if (!form.baseUrl || !form.apiKey) {
    ElMessage.warning('请先填写 Base URL 和 API Key')
    return
  }
  testing.value = true
  testResult.value = ''
  // 一期 mock：格式合法即视为成功；二期由后端代理真实探测
  setTimeout(() => {
    testing.value = false
    testResult.value = form.baseUrl.startsWith('http') && form.apiKey.length >= 8 ? 'ok' : 'fail'
  }, 800)
}

onMounted(() => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) Object.assign(form, JSON.parse(saved))
})
</script>

<style scoped>
.config-wrap { display: flex; justify-content: center; }
</style>
