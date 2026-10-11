<template>
  <el-container class="app-shell">
    <el-aside width="216px" class="app-aside">
      <div class="logo">
        <span class="logo-mark">wpw</span>
        <span class="logo-text">console</span>
      </div>
      <el-menu :default-active="$route.path" router class="side-menu">
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon><span>总览</span>
        </el-menu-item>
        <div class="menu-group">过程</div>
        <el-menu-item index="/workflow">
          <el-icon><SetUp /></el-icon><span>工作流看板</span>
        </el-menu-item>
        <el-menu-item index="/archive">
          <el-icon><Box /></el-icon><span>归档中心</span>
        </el-menu-item>
        <div class="menu-group">知识</div>
        <el-menu-item index="/graph">
          <el-icon><Share /></el-icon><span>图谱可视化</span>
        </el-menu-item>
        <el-menu-item index="/graph-stats">
          <el-icon><PieChart /></el-icon><span>图谱统计</span>
        </el-menu-item>
        <el-menu-item index="/context">
          <el-icon><MagicStick /></el-icon><span>上下文演示</span>
        </el-menu-item>
        <el-menu-item index="/knowledge">
          <el-icon><Collection /></el-icon><span>知识库</span>
        </el-menu-item>
        <div class="menu-group">洞察</div>
        <el-menu-item index="/token-stats">
          <el-icon><DataAnalysis /></el-icon><span>Token 统计</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="app-header" height="56px">
        <div class="header-title">{{ $route.meta.title }}</div>
        <div class="header-actions">
          <el-button type="primary" plain icon="ChatDotRound" @click="$router.push('/chat')">对话</el-button>
          <el-button plain icon="Key" @click="$router.push('/api-config')">API 配置</el-button>
        </div>
      </el-header>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
</script>

<style scoped>
.app-shell { height: 100%; }
.app-aside {
  border-right: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
}
.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  border-bottom: 1px solid var(--el-border-color-light);
}
.logo-mark {
  font-weight: 800;
  font-size: 20px;
  color: var(--el-color-primary);
  font-family: 'JetBrains Mono', Consolas, monospace;
}
.logo-text { color: var(--el-text-color-secondary); font-size: 14px; }
.side-menu { border-right: none; flex: 1; }
.menu-group {
  padding: 12px 20px 4px;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
}
.header-title { font-size: 16px; font-weight: 600; }
.app-main { background: var(--el-fill-color-lighter); overflow-y: auto; }
</style>
