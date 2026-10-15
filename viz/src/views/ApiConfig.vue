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
          <el-tag v-else-if="testResult === 'fail'" type="danger" style="margin-left: 12px">连接失败</el-tag>
        </el-form-item>
        <el-form-item v-if="testMessage">
          <span class="muted">{{ testMessage }}</span>
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
          <span class="mono">localStorage（每次请求由服务端转发，不落盘）</span>
        </el-descriptions-item>
      </el-descriptions>
      <el-alert
        type="info"
        :closable="false"
        style="margin-top: 16px"
        title="API Key 仅保存在浏览器本地，不会写入 workflow.config.yaml 等会提交至版本库的文件；发起对话时随请求传给本地服务转发，服务端不留存。"
      />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { saveLlmConfig, getLlmConfig, testLlm, type LlmConfig } from '@/api'

const form = reactive<LlmConfig>({ baseUrl: '', apiKey: '', model: '' })
const models = ['deepseek-chat', 'deepseek-reasoner', 'qwen-max', 'kimi-k3', 'gpt-4o', 'claude-sonnet-5']
const testing = ref(false)
const testResult = ref<'' | 'ok' | 'fail'>('')
const testMessage = ref('')

const maskedKey = computed(() => {
  const k = form.apiKey
  if (!k) return '未配置'
  return k.length <= 8 ? '****' : `${k.slice(0, 3)}****${k.slice(-4)}`
})

function save() {
  saveLlmConfig({ ...form })
  ElMessage.success('配置已保存到本地')
}

/** 真实连通性探测：由本地服务转发到 /models，失败再退化为一次最小 chat 调用 */
async function test() {
  if (!form.baseUrl || !form.apiKey || !form.model) {
    ElMessage.warning('请先填写 Base URL、API Key 和模型')
    return
  }
  testing.value = true
  testResult.value = ''
  testMessage.value = ''
  try {
    const result = await testLlm({ ...form })
    testResult.value = result.ok ? 'ok' : 'fail'
    testMessage.value = result.message
    if (result.ok) save()
  } catch (e) {
    testResult.value = 'fail'
    testMessage.value = (e as Error).message
  } finally {
    testing.value = false
  }
}

onMounted(() => Object.assign(form, getLlmConfig()))
</script>

<style scoped>
.config-wrap { display: flex; justify-content: center; }
.muted { font-size: 12px; color: var(--el-text-color-secondary); }
</style>
