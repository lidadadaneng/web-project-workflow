import { createRouter, createWebHashHistory } from 'vue-router'

// 一期使用 hash 路由：纯静态文件可直接打开，二期由 wpw viz serve 时无需 history fallback
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/layout/AppLayout.vue'),
      children: [
        { path: '', redirect: '/dashboard' },
        { path: 'dashboard', name: 'dashboard', component: () => import('@/views/Dashboard.vue'), meta: { title: '总览' } },
        { path: 'workflow', name: 'workflow', component: () => import('@/views/WorkflowBoard.vue'), meta: { title: '工作流看板' } },
        { path: 'archive', name: 'archive', component: () => import('@/views/ArchiveCenter.vue'), meta: { title: '归档中心' } },
        { path: 'graph', name: 'graph', component: () => import('@/views/GraphView.vue'), meta: { title: '图谱可视化' } },
        { path: 'graph-stats', name: 'graph-stats', component: () => import('@/views/GraphStats.vue'), meta: { title: '图谱统计' } },
        { path: 'context', name: 'context', component: () => import('@/views/ContextDemo.vue'), meta: { title: '上下文演示' } },
        { path: 'knowledge', name: 'knowledge', component: () => import('@/views/KnowledgeBase.vue'), meta: { title: '知识库' } },
        { path: 'token-stats', name: 'token-stats', component: () => import('@/views/TokenStats.vue'), meta: { title: 'Token 统计' } },
        { path: 'chat', name: 'chat', component: () => import('@/views/ChatView.vue'), meta: { title: '对话' } },
        { path: 'api-config', name: 'api-config', component: () => import('@/views/ApiConfig.vue'), meta: { title: 'API 配置' } },
      ],
    },
  ],
})
