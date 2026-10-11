<template>
  <el-container class="app-shell">
    <el-aside :width="collapsed ? '64px' : '216px'" class="app-aside">
      <div class="logo" :class="{ collapsed }">
        <img src="/logo.png" alt="wpw" class="logo-img" :class="{ collapsed }" />
        <span v-show="!collapsed" class="logo-text">console</span>
      </div>
      <el-menu
        :default-active="$route.path"
        router
        class="side-menu"
        :collapse="collapsed"
        :collapse-transition="false"
      >
        <el-menu-item index="/dashboard">
          <el-icon><Setting /></el-icon><span>总览</span>
        </el-menu-item>
        <div v-show="!collapsed" class="menu-group">过程</div>
        <el-menu-item index="/workflow">
          <el-icon><Share /></el-icon><span>工作流看板</span>
        </el-menu-item>
        <el-menu-item index="/archive">
          <el-icon><Calendar /></el-icon><span>归档中心</span>
        </el-menu-item>
        <div v-show="!collapsed" class="menu-group">知识</div>
        <el-menu-item index="/graph">
          <el-icon><Connection /></el-icon><span>图谱可视化</span>
        </el-menu-item>
        <el-menu-item index="/graph-stats">
          <el-icon><PieChart /></el-icon><span>图谱统计</span>
        </el-menu-item>
        <el-menu-item index="/context">
          <el-icon><MagicStick /></el-icon><span>上下文演示</span>
        </el-menu-item>
        <el-menu-item index="/knowledge">
          <el-icon><Reading /></el-icon><span>知识库</span>
        </el-menu-item>
        <div v-show="!collapsed" class="menu-group">洞察</div>
        <el-menu-item index="/token-stats">
          <el-icon><Histogram /></el-icon><span>Token 统计</span>
        </el-menu-item>
      </el-menu>
      <div class="collapse-bar" :class="{ collapsed }" @click="collapsed = !collapsed">
        <el-icon><component :is="collapsed ? Expand : Fold" /></el-icon>
        <span v-show="!collapsed">收起</span>
      </div>
    </el-aside>

    <el-container>
      <el-header class="app-header" height="64px">
        <div class="header-title">{{ $route.meta.title }}</div>
        <div class="header-actions">
          <el-button class="chat-btn" icon="ChatDotRound" @click="$router.push('/chat')">对话</el-button>
          <el-button class="cfg-btn" icon="Key" @click="$router.push('/api-config')">API 配置</el-button>
        </div>
      </el-header>
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Fold, Expand } from '@element-plus/icons-vue'

const collapsed = ref(false)
</script>

<style scoped>
.app-shell { height: 100%; }

/* 侧边栏：白底 + 细分隔线，宽度动画 */
.app-aside {
  border-right: 1px solid #e5e6eb;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  transition: width 0.2s;
  overflow: hidden;
}

.logo {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  border-bottom: 1px solid #f2f3f5;
  flex: none;
}
.logo-img {
  height: 30px;
  width: auto;
  object-fit: contain;
  transition: height 0.2s;
}
.logo-img.collapsed { height: 20px; }
.logo.collapsed { justify-content: center; padding: 0; }
.logo-text { color: #86909c; font-size: 15px; }

/* 菜单项：44px 高、8px 圆角、两侧留白；选中浅蓝底 + 蓝字 */
.side-menu { border-right: none; flex: 1; padding: 8px 0; }
.side-menu :deep(.el-menu-item) {
  height: 44px;
  line-height: 44px;
  margin: 3px 12px;
  border-radius: 8px;
  color: #4e5969;
  font-size: 15px;
}
.side-menu :deep(.el-menu-item:hover) { background: #f2f3f5; }
.side-menu :deep(.el-menu-item.is-active) {
  background: #e8f3ff;
  color: #165dff;
  font-weight: 500;
}
.side-menu :deep(.el-menu-item .el-icon) { font-size: 18px; }

/* 收起态：菜单项与图标全部居中 */
.side-menu.el-menu--collapse :deep(.el-menu-item) {
  margin: 3px 8px;
  padding: 0 !important;
  justify-content: center;
}

.menu-group {
  padding: 18px 24px 8px;
  font-size: 13px;
  color: #a8abb2;
}

/* 底部收起 */
.collapse-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 12px;
  padding: 0 12px;
  height: 44px;
  border-radius: 8px;
  color: #86909c;
  font-size: 14px;
  cursor: pointer;
}
.collapse-bar:hover { background: #f2f3f5; color: #4e5969; }
.collapse-bar .el-icon { font-size: 18px; }
.collapse-bar.collapsed { justify-content: center; padding: 0; margin: 8px; }

/* 顶栏：64px 高、标题 18px，右侧按钮圆角 8px */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e5e6eb;
  background: #ffffff;
  padding: 0 24px;
}
.header-title { font-size: 18px; font-weight: 600; color: #1d2129; }
.header-actions { display: flex; gap: 12px; }
.header-actions .el-button { border-radius: 8px; height: 36px; }
.chat-btn {
  background: #e8f3ff;
  border-color: transparent;
  color: #165dff;
}
.chat-btn:hover { background: #d8e9ff; border-color: transparent; color: #165dff; }
.cfg-btn { background: #ffffff; border-color: #dcdfe6; color: #4e5969; }
.cfg-btn:hover { border-color: #165dff; color: #165dff; }

.app-main { background: #f5f6f8; overflow-y: auto; }
</style>
