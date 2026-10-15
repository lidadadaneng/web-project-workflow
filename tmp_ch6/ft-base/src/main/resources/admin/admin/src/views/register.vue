<template>
	<div>
		<div class="register-page">
			<el-form v-if="pageFlag=='register'" class="register-card" ref="rgsForm" :model="rgsForm">
				<div class="register-header">
					<i class="el-icon-food"></i>
					<h2>食光集 · 注册</h2>
				</div>
				<el-form-item class="form-item" v-if="tableName=='yonghu'">
					<el-input prefix-icon="el-icon-user" v-model="ruleForm.yonghuzhanghao" placeholder="用户账号"></el-input>
				</el-form-item>
				<el-form-item class="form-item" v-if="tableName=='yonghu'">
					<el-input prefix-icon="el-icon-lock" v-model="ruleForm.mima" placeholder="密码" type="password"></el-input>
				</el-form-item>
				<el-form-item class="form-item" v-if="tableName=='yonghu'">
					<el-input prefix-icon="el-icon-lock" v-model="ruleForm.mima2" placeholder="确认密码" type="password"></el-input>
				</el-form-item>
				<el-form-item class="form-item" v-if="tableName=='yonghu'">
					<el-input prefix-icon="el-icon-postcard" v-model="ruleForm.yonghuxingming" placeholder="用户姓名"></el-input>
				</el-form-item>
				<el-form-item class="form-item" v-if="tableName=='yonghu'">
					<el-select v-model="ruleForm.xingbie" placeholder="请选择性别" style="width:100%">
						<el-option v-for="(item,index) in yonghuxingbieOptions" v-bind:key="index" :label="item" :value="item"></el-option>
					</el-select>
				</el-form-item>
				<el-form-item class="form-item" v-if="tableName=='yonghu'">
					<el-input prefix-icon="el-icon-date" v-model="ruleForm.nianling" placeholder="年龄"></el-input>
				</el-form-item>
				<el-form-item class="form-item" v-if="tableName=='yonghu'">
					<file-upload tip="点击上传头像" action="file/upload" :limit="3" :multiple="true" :fileUrls="ruleForm.touxiang?ruleForm.touxiang:''" @change="yonghutouxiangUploadChange"></file-upload>
				</el-form-item>
				<el-button type="primary" class="register-btn" @click="login()">注 册</el-button>
				<div class="login-link" @click="close()">已有账号，直接登录</div>
			</el-form>
		</div>
	</div>
</template>

<script>
export default {
	data() {
		return {
			ruleForm: { xingbie: '' },
			pageFlag: '',
			tableName: "",
			rules: {},
			yonghuxingbieOptions: [],
		};
	},
	mounted() {
		this.pageFlag = this.$storage.get("pageFlag");
		let table = this.$storage.get("loginTable");
		this.tableName = table;
		this.yonghuxingbieOptions = "男,女".split(',')
	},
	methods: {
		close() {
			this.$router.push({ path: "/login" });
		},
		yonghutouxiangUploadChange(fileUrls) {
			this.ruleForm.touxiang = fileUrls;
		},
		login() {
			var url = this.tableName + "/register";
			if ((!this.ruleForm.yonghuzhanghao) && `yonghu` == this.tableName) {
				this.$message.error(`用户账号不能为空`);
				return
			}
			if ((!this.ruleForm.mima) && `yonghu` == this.tableName) {
				this.$message.error(`密码不能为空`);
				return
			}
			if ((this.ruleForm.mima != this.ruleForm.mima2) && `yonghu` == this.tableName) {
				this.$message.error(`两次密码输入不一致`);
				return
			}
			if ((!this.ruleForm.yonghuxingming) && `yonghu` == this.tableName) {
				this.$message.error(`用户姓名不能为空`);
				return
			}
			if (`yonghu` == this.tableName && this.ruleForm.nianling && (!this.$validate.isIntNumer(this.ruleForm.nianling))) {
				this.$message.error(`年龄应输入整数`);
				return
			}
			if (this.ruleForm.touxiang != null) {
				this.ruleForm.touxiang = this.ruleForm.touxiang.replace(new RegExp(this.$base.url, "g"), "");
			}
			if (`yonghu` == this.tableName && this.ruleForm.money && (!this.$validate.isNumber(this.ruleForm.money))) {
				this.$message.error(`余额应输入数字`);
				return
			}
			this.$http({
				url: url,
				method: "post",
				data: this.ruleForm
			}).then(({ data }) => {
				if (data && data.code === 0) {
					this.$message({
						message: "注册成功",
						type: "success",
						duration: 1500,
						onClose: () => {
							this.$router.replace({ path: "/login" });
						}
					});
				} else {
					this.$message.error(data.msg);
				}
			});
		}
	}
};
</script>

<style lang="scss" scoped>
.register-page {
	min-height: 100vh;
	display: flex;
	align-items: center;
	justify-content: center;
	background: linear-gradient(135deg, #FF6B35 0%, #FFA552 50%, #FFD8A5 100%);

	.register-card {
		width: 420px;
		background: #fff;
		border-radius: 16px;
		padding: 40px;
		box-shadow: 0 20px 60px rgba(255, 107, 53, 0.2);

		.register-header {
			text-align: center;
			margin-bottom: 30px;

			i {
				font-size: 36px;
				color: #FF6B35;
			}

			h2 {
				font-size: 20px;
				font-weight: 600;
				color: #303133;
				margin: 10px 0 0 0;
			}
		}

		.form-item {
			margin-bottom: 18px;

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

			::v-deep .el-upload--picture-card {
				background: transparent;
				border: 0;
				border-radius: 0;
				width: auto;
				height: auto;
				line-height: initial;
				vertical-align: middle;
			}

			::v-deep .upload .upload-img {
				border: 1px dashed #e8e8e8;
				cursor: pointer;
				border-radius: 8px;
				color: #B0A09A;
				width: 100px;
				font-size: 32px;
				line-height: 100px;
				text-align: center;
				height: 100px;
			}

			::v-deep .el-upload-list .el-upload-list__item {
				border: 1px dashed #e8e8e8;
				cursor: pointer;
				border-radius: 8px;
				color: #B0A09A;
				width: 100px;
				font-size: 32px;
				line-height: 100px;
				text-align: center;
				height: 100px;
			}

			::v-deep .el-upload .el-icon-plus {
				border: 1px dashed #e8e8e8;
				cursor: pointer;
				border-radius: 8px;
				color: #B0A09A;
				width: 100px;
				font-size: 32px;
				line-height: 100px;
				text-align: center;
				height: 100px;
			}
		}

		.register-btn {
			width: 100%;
			height: 44px;
			border-radius: 8px;
			font-size: 15px;
			font-weight: 500;
			background: #FF6B35;
			border-color: #FF6B35;
			letter-spacing: 4px;
			margin-top: 10px;

			&:hover {
				background: #E85D2C;
				border-color: #E85D2C;
			}
		}

		.login-link {
			text-align: center;
			margin-top: 16px;
			font-size: 13px;
			color: #B0A09A;
			cursor: pointer;

			&:hover {
				color: #FF6B35;
			}
		}
	}
}
</style>
