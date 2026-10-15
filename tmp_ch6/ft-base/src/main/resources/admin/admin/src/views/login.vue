<template>
  <div>
    <div class="login-page">
      <div class="login-card">
        <div class="login-left">
          <div class="brand">
            <i class="el-icon-food brand-icon"></i>
            <h1>食光集</h1>
            <p>美食管理系统</p>
          </div>
          <div class="brand-desc">记录每一份美食的美好时光</div>
        </div>
        <div class="login-right">
          <h2>欢迎登录</h2>
          <div v-if="loginType==1" class="form-item">
            <el-input prefix-icon="el-icon-user" placeholder="请输入用户名" v-model="rulesForm.username"></el-input>
          </div>
          <div v-if="loginType==1" class="form-item">
            <el-input prefix-icon="el-icon-lock" placeholder="请输入密码" type="password" v-model="rulesForm.password"></el-input>
          </div>
          <div class="form-item role-select" v-if="roles.length>1">
            <el-radio v-for="item in roles" v-bind:key="item.roleName" v-model="rulesForm.role" :label="item.roleName">{{item.roleName}}</el-radio>
          </div>
          <div class="form-item">
            <el-button v-if="loginType==1" type="primary" class="login-btn" @click="login()">登 录</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import menu from "@/utils/menu";
export default {
  data() {
    return {
      baseUrl: this.$base.url,
      loginType: 1,
      rulesForm: {
        username: "",
        password: "",
        role: "",
        code: '',
      },
      menus: [],
      roles: [],
      tableName: "",
    };
  },
  mounted() {
    let menus = menu.list();
    this.menus = menus;
    for (let i = 0; i < this.menus.length; i++) {
      if (this.menus[i].hasBackLogin == '是') {
        this.roles.push(this.menus[i])
      }
    }
  },
  methods: {
    login() {
      if (!this.rulesForm.username) {
        this.$message.error("请输入用户名");
        return;
      }
      if (!this.rulesForm.password) {
        this.$message.error("请输入密码");
        return;
      }
      if (this.roles.length > 1) {
        if (!this.rulesForm.role) {
          this.$message.error("请选择角色");
          return;
        }
        let menus = this.menus;
        for (let i = 0; i < menus.length; i++) {
          if (menus[i].roleName == this.rulesForm.role) {
            this.tableName = menus[i].tableName;
          }
        }
      } else {
        this.tableName = this.roles[0].tableName;
        this.rulesForm.role = this.roles[0].roleName;
      }
      this.$http({
        url: `${this.tableName}/login?username=${this.rulesForm.username}&password=${this.rulesForm.password}`,
        method: "post"
      }).then(({ data }) => {
        if (data && data.code === 0) {
          this.$storage.set("Token", data.token);
          this.$storage.set("role", this.rulesForm.role);
          this.$storage.set("sessionTable", this.tableName);
          this.$storage.set("adminName", this.rulesForm.username);
          this.$router.replace({ path: "/index/" });
        } else {
          this.$message.error(data.msg);
        }
      });
    },
  }
};
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #FF6B35 0%, #FFA552 50%, #FFD8A5 100%);

  .login-card {
    display: flex;
    width: 820px;
    min-height: 460px;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(255, 107, 53, 0.2);

    .login-left {
      width: 340px;
      background: linear-gradient(180deg, #FF6B35 0%, #E85D2C 100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      color: #fff;

      .brand {
        text-align: center;

        .brand-icon {
          font-size: 48px;
          margin-bottom: 12px;
        }

        h1 {
          font-size: 28px;
          font-weight: 700;
          margin: 0 0 6px 0;
          letter-spacing: 2px;
        }

        p {
          font-size: 14px;
          opacity: 0.85;
          margin: 0;
        }
      }

      .brand-desc {
        margin-top: 30px;
        font-size: 13px;
        opacity: 0.7;
        text-align: center;
      }
    }

    .login-right {
      flex: 1;
      background: #fff;
      padding: 50px 40px;
      display: flex;
      flex-direction: column;
      justify-content: center;

      h2 {
        font-size: 22px;
        font-weight: 600;
        color: #303133;
        margin: 0 0 30px 0;
      }

      .form-item {
        margin-bottom: 20px;

        .el-input {
          height: 44px;
        }

        ::v-deep .el-input__inner {
          height: 44px;
          border-radius: 8px;
          border-color: #e8e8e8;

          &:focus {
            border-color: #FF6B35;
          }
        }

        ::v-deep .el-input__prefix {
          color: #B0A09A;
        }
      }

      .role-select {
        ::v-deep .el-radio__input.is-checked .el-radio__inner {
          background: #FF6B35;
          border-color: #FF6B35;
        }

        ::v-deep .el-radio__input.is-checked + .el-radio__label {
          color: #FF6B35;
        }
      }

      .login-btn {
        width: 100%;
        height: 44px;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 500;
        background: #FF6B35;
        border-color: #FF6B35;
        letter-spacing: 4px;

        &:hover {
          background: #E85D2C;
          border-color: #E85D2C;
        }
      }
    }
  }
}
</style>
