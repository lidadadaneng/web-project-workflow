<template>
  <div id="app" class="">
    <router-view></router-view>
  </div>
</template>

<script>
export default {
  name: "app",
};
</script>

<style lang="scss">
*{
  padding: 0;
  margin:0;
  box-sizing: border-box;
}
html,body{
  width: 100%;
  height: 100%;
}
#app{
  height:100%;
}
body {
  padding: 0;
  margin: 0;
}

/* Loading 遮罩 */
.el-loading-mask {
  .el-loading-spinner .circular .path {
    stroke: #FF6B35;
  }

  .el-loading-text {
    color: #FF6B35;
  }
}

/* 分页组件 */
.el-pagination {
  .el-select .el-input .el-input__inner:focus {
    border-color: #FF6B35;
  }

  .el-select .el-input.is-focus .el-input__inner {
    border-color: #FF6B35;
  }

  .el-pager li.active {
    background: #FF6B35;
    color: #fff;
  }

  .el-pager li:hover {
    color: #FF6B35;
  }
}

/* 表格操作按钮 */
.el-table .el-button--mini {
  &.el-button--warning {
    background: #FF6B35;
    border-color: #FF6B35;
  }
}

/* 消息提示 */
.el-message--warning .el-message__content {
  color: #FF6B35;
}

/* 确认弹框 */
.el-message-box__btns .el-button--primary {
  background: #FF6B35;
  border-color: #FF6B35;

  &:hover, &:focus {
    background: #E85D2C;
    border-color: #E85D2C;
  }
}

/* 输入框聚焦主题色 */
.el-input__inner:focus,
.el-input.is-focus .el-input__inner,
.el-textarea__inner:focus {
  border-color: #FF6B35;
}

/* 下拉选中色 */
.el-select-dropdown__item.selected {
  color: #FF6B35;
}

/* Radio/Checkbox 选中色 */
.el-radio__input.is-checked .el-radio__inner {
  background: #FF6B35;
  border-color: #FF6B35;
}
.el-radio__input.is-checked + .el-radio__label {
  color: #FF6B35;
}
.el-checkbox__input.is-checked .el-checkbox__inner {
  background: #FF6B35;
  border-color: #FF6B35;
}
.el-checkbox__input.is-checked + .el-checkbox__label {
  color: #FF6B35;
}

/* Switch 开关 */
.el-switch.is-checked .el-switch__core {
  background: #FF6B35;
  border-color: #FF6B35;
}

/* Tag 标签 */
.el-tag--warning {
  background: #FFF4ED;
  border-color: #FFD8BD;
  color: #FF6B35;
}
</style>
