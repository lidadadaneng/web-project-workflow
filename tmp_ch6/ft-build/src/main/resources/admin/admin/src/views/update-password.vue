<template>
	<div class="form-page">
		<el-form class="form-container" ref="ruleForm" :rules="rules" :model="ruleForm" label-width="100px">
			<div class="form-row">
				<el-form-item class="form-half" label="原密码" prop="password">
					<el-input v-model="ruleForm.password" placeholder="请输入原密码" show-password></el-input>
				</el-form-item>
			</div>
			<div class="form-row">
				<el-form-item class="form-half" label="新密码" prop="newpassword">
					<el-input v-model="ruleForm.newpassword" placeholder="请输入新密码" show-password></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="确认密码" prop="repassword">
					<el-input v-model="ruleForm.repassword" placeholder="请再次输入新密码" show-password></el-input>
				</el-form-item>
			</div>
			<div class="form-actions">
				<el-button type="primary" @click="onUpdateHandler">确 定</el-button>
			</div>
		</el-form>
	</div>
</template>

<script>
export default {
	data() {
		return {
			ruleForm: {},
			user: {},
			rules: {
				password: [{ required: true, message: "密码不能为空", trigger: "blur" }],
				newpassword: [{ required: true, message: "新密码不能为空", trigger: "blur" }],
				repassword: [{ required: true, message: "确认密码不能为空", trigger: "blur" }]
			}
		};
	},
	mounted() {
		this.$http({
			url: `${this.$storage.get("sessionTable")}/session`,
			method: "get"
		}).then(({ data }) => {
			if (data && data.code === 0) {
				this.user = data.data;
			} else {
				this.$message.error(data.msg);
			}
		});
	},
	methods: {
		onUpdateHandler() {
			this.$refs["ruleForm"].validate(valid => {
				if (valid) {
					var password = "";
					if (this.user.mima) { password = this.user.mima; }
					else if (this.user.password) { password = this.user.password; }
					if (this.user.password) { password = this.user.password; }
					if (this.ruleForm.password != password) {
						this.$message.error("原密码错误");
						return;
					}
					if (this.ruleForm.newpassword != this.ruleForm.repassword) {
						this.$message.error("两次密码输入不一致");
						return;
					}
					this.user.password = this.ruleForm.newpassword;
					this.user.mima = this.ruleForm.newpassword;
					this.$http({
						url: `${this.$storage.get("sessionTable")}/update`,
						method: "post",
						data: this.user
					}).then(({ data }) => {
						if (data && data.code === 0) {
							this.$message({ message: "修改密码成功，下次登录系统生效", type: "success", duration: 1500 });
						} else {
							this.$message.error(data.msg);
						}
					});
				}
			});
		}
	}
};
</script>

<style lang="scss" scoped>
.form-page { padding: 20px 24px; background: #FFF8F0; min-height: 100%; }
.form-container { background: #fff; border-radius: 8px; padding: 30px; width: 90%; margin: 0 auto; }
.form-row { display: flex; gap: 20px; }
.form-half { flex: 1; margin-bottom: 20px; }
.form-half ::v-deep .el-input__inner { border: 1px solid #e8e8e8; border-radius: 6px; height: 40px; color: #303133; }
.form-actions { padding-top: 20px; border-top: 1px solid #f0f0f0; margin-top: 10px; }
.form-actions .el-button--primary { background: #FF6B35; border-color: #FF6B35; padding: 10px 32px; border-radius: 6px; }
.form-actions .el-button--primary:hover { background: #E85D2C; border-color: #E85D2C; }
</style>
