import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 控制台的全部数据来自 `wpw viz` 本地服务（/api/*）。
// 开发模式：Vite 把 /api 代理到本地服务；生产模式：前端静态资源由该服务一并托管。
const API_TARGET = process.env.WPW_VIZ_API ?? 'http://127.0.0.1:7788'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        // SSE（/api/chat）需要关闭缓冲，保持长连接
        ws: false,
      },
    },
  },
})
