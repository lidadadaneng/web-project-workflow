<template>
  <div class="not-found">
    <div class="not-found-inner">
      <i class="el-icon-food not-found-icon"></i>
      <h1>404</h1>
      <p>抱歉，您访问的页面走丢了...</p>
      <el-button type="primary" icon="el-icon-back" @click="back()">返回首页</el-button>
    </div>
  </div>
</template>

<script>
export default {
  methods: {
    back() {
      window.history.length > 1 ? this.$router.go(-1) : this.$router.push("/");
    }
  }
};
</script>

<style lang="scss" scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: #FFF8F0;

  .not-found-inner {
    text-align: center;

    .not-found-icon {
      font-size: 80px;
      color: #FFD8A5;
    }

    h1 {
      font-size: 72px;
      font-weight: 700;
      color: #FF6B35;
      margin: 16px 0 0 0;
      line-height: 1;
    }

    p {
      font-size: 16px;
      color: #B0A09A;
      margin: 16px 0 30px 0;
    }

    .el-button {
      border-radius: 20px;
      padding: 12px 30px;
      background: #FF6B35;
      border-color: #FF6B35;

      &:hover {
        background: #E85D2C;
        border-color: #E85D2C;
      }
    }
  }
}
</style>
