<template>
<div class="home-container">
  <!-- 顶部欢迎区 -->
  <div class="welcome-section">
    <div class="welcome-text">
      <h2>欢迎回来，{{ username }} 🍊</h2>
      <p>{{ today }} · 食光集数据中心</p>
    </div>
    <el-button type="primary" icon="el-icon-refresh" size="small" plain @click="refreshData">刷新数据</el-button>
  </div>

  <!-- 数据统计卡片 -->
  <div class="stat-row">
    <div v-for="(card, index) in statCards" :key="index" class="stat-item">
      <div class="stat-icon" :style="{ color: card.color, background: card.bgLight }">
        <i :class="card.icon"></i>
      </div>
      <div class="stat-main">
        <div class="stat-value">{{ card.value }}</div>
        <div class="stat-label">{{ card.label }}</div>
      </div>
    </div>
  </div>

  <!-- 图表 + 右侧面板 -->
  <div class="content-row">
    <!-- 左侧：数据趋势图 -->
    <div class="panel chart-panel">
      <div class="panel-header">
        <span class="panel-title">数据趋势</span>
        <el-radio-group v-model="chartPeriod" size="mini">
          <el-radio-button label="week">本周</el-radio-button>
          <el-radio-button label="month">本月</el-radio-button>
          <el-radio-button label="year">全年</el-radio-button>
        </el-radio-group>
      </div>
      <div id="home-chart" class="chart-area"></div>
    </div>

    <!-- 右侧：快捷操作 + 动态 -->
    <div class="side-col">
      <!-- 快捷入口 -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">快捷入口</span>
        </div>
        <div class="shortcut-grid">
          <div v-for="(item, index) in shortcuts" :key="index" class="shortcut-item" @click="$router.push(item.route)">
            <div class="shortcut-icon" :style="{ color: item.color, background: item.bgLight }">
              <i :class="item.icon"></i>
            </div>
            <span class="shortcut-label">{{ item.label }}</span>
          </div>
        </div>
      </div>

      <!-- 最近动态 -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">最近动态</span>
          <span class="panel-more">查看全部</span>
        </div>
        <div class="timeline">
          <div v-for="(item, index) in recentActivities" :key="index" class="timeline-item">
            <div class="timeline-dot" :style="{ background: item.color }"></div>
            <div class="timeline-content">
              <div class="timeline-text">{{ item.text }}</div>
              <div class="timeline-time">{{ item.time }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</template>

<script>
import router from '@/router/router-static'
import * as echarts from 'echarts'

export default {
  data() {
    return {
      username: '管理员',
      today: '',
      chartPeriod: 'month',
      statCards: [
        { label: '用户总数', value: '1,286', icon: 'el-icon-user', color: '#FF6B35', bgLight: 'rgba(255,107,53,0.1)' },
        { label: '今日访问', value: '3,862', icon: 'el-icon-view', color: '#FFA552', bgLight: 'rgba(255,165,82,0.1)' },
        { label: '订单数量', value: '892', icon: 'el-icon-s-order', color: '#E6A23C', bgLight: 'rgba(230,162,60,0.1)' },
        { label: '总收入(元)', value: '28,650', icon: 'el-icon-money', color: '#F56C6C', bgLight: 'rgba(245,108,108,0.1)' }
      ],
      shortcuts: [
        { label: '用户管理', icon: 'el-icon-user-solid', color: '#FF6B35', bgLight: 'rgba(255,107,53,0.1)', route: '/yonghu' },
        { label: '美食信息', icon: 'el-icon-dish', color: '#FFA552', bgLight: 'rgba(255,165,82,0.1)', route: '/meishixinxi' },
        { label: '美食分类', icon: 'el-icon-menu', color: '#E6A23C', bgLight: 'rgba(230,162,60,0.1)', route: '/meishifenlei' },
        { label: '订单管理', icon: 'el-icon-s-order', color: '#F56C6C', bgLight: 'rgba(245,108,108,0.1)', route: '/orders/0' },
        { label: '美食资讯', icon: 'el-icon-document', color: '#909399', bgLight: 'rgba(144,147,153,0.1)', route: '/news' },
        { label: '轮播图', icon: 'el-icon-picture-outline', color: '#FF6B35', bgLight: 'rgba(255,107,53,0.1)', route: '/config' }
      ],
      recentActivities: [
        { text: '新用户 张三 完成注册', time: '5分钟前', color: '#FF6B35' },
        { text: '订单 #20231215001 已支付', time: '12分钟前', color: '#FFA552' },
        { text: '美食信息「炸串」已更新', time: '30分钟前', color: '#E6A23C' },
        { text: '用户 李四 提交了新订单', time: '1小时前', color: '#F56C6C' },
        { text: '系统完成自动备份', time: '2小时前', color: '#909399' }
      ]
    }
  },
  mounted() {
    this.init()
    this.setToday()
    this.$nextTick(() => {
      this.initChart()
    })
  },
  methods: {
    init() {
      if (this.$storage.get('Token')) {
        this.$http({
          url: `${this.$storage.get('sessionTable')}/session`,
          method: 'get'
        }).then(({ data }) => {
          if (data && data.code === 0) {
            if (data.data && data.data.username) {
              this.username = data.data.username
            }
          } else {
            router.push({ name: 'login' })
          }
        })
      } else {
        router.push({ name: 'login' })
      }
    },
    setToday() {
      const now = new Date()
      const weekDays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
      this.today = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekDays[now.getDay()]}`
    },
    refreshData() {
      this.$message.success('数据已刷新')
    },
    initChart() {
      var myChart = echarts.init(document.getElementById('home-chart'))
      var option = {
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#fff',
          borderColor: '#f0e6de',
          borderWidth: 1,
          textStyle: { color: '#303133', fontSize: 13 },
          axisPointer: { type: 'line', lineStyle: { color: '#f0e6de', type: 'dashed' } }
        },
        legend: {
          data: ['访问量', '用户量', '订单量'],
          top: 0,
          right: 0,
          textStyle: { color: '#8A7A6A', fontSize: 12 },
          itemWidth: 16,
          itemHeight: 3,
          itemGap: 20
        },
        grid: {
          left: 0,
          right: 0,
          bottom: 0,
          top: 40,
          containLabel: true
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
          axisLine: { lineStyle: { color: '#f0e6de' } },
          axisLabel: { color: '#B0A09A', fontSize: 12 },
          axisTick: { show: false }
        },
        yAxis: {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: '#B0A09A', fontSize: 12 },
          splitLine: { lineStyle: { color: '#f5ece4', type: 'dashed' } }
        },
        series: [
          {
            name: '访问量',
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            showSymbol: false,
            lineStyle: { width: 2, color: '#FF6B35' },
            itemStyle: { color: '#FF6B35' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(255,107,53,0.15)' },
                { offset: 1, color: 'rgba(255,107,53,0.02)' }
              ])
            },
            data: [120, 132, 101, 134, 90, 230, 210, 120, 132, 101, 134, 90]
          },
          {
            name: '用户量',
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            showSymbol: false,
            lineStyle: { width: 2, color: '#FFA552' },
            itemStyle: { color: '#FFA552' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(255,165,82,0.15)' },
                { offset: 1, color: 'rgba(255,165,82,0.02)' }
              ])
            },
            data: [220, 182, 191, 234, 290, 330, 310, 182, 191, 234, 290, 330]
          },
          {
            name: '订单量',
            type: 'line',
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            showSymbol: false,
            lineStyle: { width: 2, color: '#E6A23C' },
            itemStyle: { color: '#E6A23C' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(230,162,60,0.15)' },
                { offset: 1, color: 'rgba(230,162,60,0.02)' }
              ])
            },
            data: [150, 232, 201, 154, 190, 330, 410, 232, 201, 154, 190, 330]
          }
        ]
      }
      myChart.setOption(option)
      window.addEventListener('resize', () => myChart.resize())
    }
  }
}
</script>

<style lang="scss" scoped>
.home-container {
  padding: 24px;
  background: #FFF8F0;
  min-height: 100%;
  box-sizing: border-box;
}

/* 欢迎区 */
.welcome-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;

  .welcome-text {
    h2 {
      font-size: 20px;
      font-weight: 600;
      color: #303133;
      margin: 0 0 6px 0;
    }
    p {
      font-size: 13px;
      color: #B0A09A;
      margin: 0;
    }
  }
}

/* 统计卡片 */
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;

  .stat-item {
    background: #fff;
    border-radius: 8px;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    transition: box-shadow 0.2s;

    &:hover {
      box-shadow: 0 2px 12px rgba(255, 107, 53, 0.08);
    }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
    }

    .stat-value {
      font-size: 26px;
      font-weight: 700;
      color: #303133;
      line-height: 1.2;
    }

    .stat-label {
      font-size: 13px;
      color: #B0A09A;
      margin-top: 4px;
    }
  }
}

/* 主内容区 */
.content-row {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 16px;
}

/* 通用面板 */
.panel {
  background: #fff;
  border-radius: 8px;
  padding: 20px 24px;

  & + .panel {
    margin-top: 16px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    .panel-title {
      font-size: 15px;
      font-weight: 600;
      color: #303133;
    }

    .panel-more {
      font-size: 12px;
      color: #B0A09A;
      cursor: pointer;

      &:hover {
        color: #FF6B35;
      }
    }
  }
}

/* 图表区 */
.chart-panel {
  .chart-area {
    width: 100%;
    height: 340px;
  }
}

/* 快捷入口 */
.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;

  .shortcut-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 16px 8px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;

    &:hover {
      background: #FFF4ED;
    }

    .shortcut-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }

    .shortcut-label {
      font-size: 12px;
      color: #5A4A3A;
    }
  }
}

/* 动态时间线 */
.timeline {
  .timeline-item {
    display: flex;
    gap: 12px;
    padding: 10px 0;
    position: relative;

    &:not(:last-child)::before {
      content: '';
      position: absolute;
      left: 3px;
      top: 22px;
      bottom: -2px;
      width: 1px;
      background: #f0e6de;
    }

    .timeline-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-top: 5px;
      flex-shrink: 0;
    }

    .timeline-content {
      flex: 1;
      min-width: 0;

      .timeline-text {
        font-size: 13px;
        color: #303133;
        line-height: 1.5;
      }

      .timeline-time {
        font-size: 12px;
        color: #d0c4bc;
        margin-top: 2px;
      }
    }
  }
}

/* 响应式 */
@media (max-width: 1200px) {
  .stat-row {
    grid-template-columns: repeat(2, 1fr);
  }
  .content-row {
    grid-template-columns: 1fr;
  }
}
</style>
