<template>
	<div class="form-page">
		<el-form class="form-container" ref="ruleForm" :model="ruleForm" label-width="100px">
			<div class="form-row" v-if="flag=='yonghu'">
				<el-form-item class="form-half" label="用户账号" prop="yonghuzhanghao">
					<el-input v-model="ruleForm.yonghuzhanghao" readonly></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="用户姓名" prop="yonghuxingming">
					<el-input v-model="ruleForm.yonghuxingming" placeholder="请输入用户姓名" clearable></el-input>
				</el-form-item>
			</div>
			<div class="form-row" v-if="flag=='yonghu'">
				<el-form-item class="form-half" label="性别" prop="xingbie">
					<el-select v-model="ruleForm.xingbie" placeholder="请选择性别" style="width:100%">
						<el-option v-for="(item,index) in yonghuxingbieOptions" :key="index" :label="item" :value="item"></el-option>
					</el-select>
				</el-form-item>
				<el-form-item class="form-half" label="年龄" prop="nianling">
					<el-input v-model="ruleForm.nianling" placeholder="请输入年龄" clearable></el-input>
				</el-form-item>
			</div>
			<el-form-item class="form-full" v-if="flag=='yonghu'" label="头像" prop="touxiang">
				<file-upload tip="点击上传头像" action="file/upload" :limit="3" :multiple="true" :fileUrls="ruleForm.touxiang?ruleForm.touxiang:''" @change="yonghutouxiangUploadChange"></file-upload>
			</el-form-item>
			<div class="form-row" v-if="flag=='users'">
				<el-form-item class="form-half" label="用户名" prop="username">
					<el-input v-model="ruleForm.username" placeholder="请输入用户名"></el-input>
				</el-form-item>
			</div>
			<div class="form-actions">
				<el-button type="primary" @click="onUpdateHandler">修 改</el-button>
			</div>
		</el-form>
	</div>
</template>

<script>
import { isNumber, isIntNumer } from "@/utils/validate";
export default {
	data() {
		return {
			ruleForm: {},
			flag: '',
			yonghuxingbieOptions: [],
		};
	},
	mounted() {
		var table = this.$storage.get("sessionTable");
		this.flag = table;
		this.$http({
			url: `${this.$storage.get("sessionTable")}/session`,
			method: "get"
		}).then(({ data }) => {
			if (data && data.code === 0) {
				this.ruleForm = data.data;
			} else {
				this.$message.error(data.msg);
			}
		});
		this.yonghuxingbieOptions = "男,女".split(',');
	},
	methods: {
		yonghutouxiangUploadChange(fileUrls) {
			this.ruleForm.touxiang = fileUrls;
		},
		onUpdateHandler() {
			if ((!this.ruleForm.yonghuzhanghao) && 'yonghu' == this.flag) {
				this.$message.error('用户账号不能为空');
				return
			}
			if ((!this.ruleForm.yonghuxingming) && 'yonghu' == this.flag) {
				this.$message.error('用户姓名不能为空');
				return
			}
			if ('yonghu' == this.flag && this.ruleForm.nianling && (!isIntNumer(this.ruleForm.nianling))) {
				this.$message.error(`年龄应输入整数`);
				return
			}
			if (this.ruleForm.touxiang != null) {
				this.ruleForm.touxiang = this.ruleForm.touxiang.replace(new RegExp(this.$base.url, "g"), "");
			}
			if ('yonghu' == this.flag && this.ruleForm.money && (!isNumber(this.ruleForm.money))) {
				this.$message.error(`余额应输入数字`);
				return
			}
			if ('users' == this.flag && this.ruleForm.username.trim().length < 1) {
				this.$message.error(`用户名不能为空`);
				return
			}
			this.$http({
				url: `${this.$storage.get("sessionTable")}/update`,
				method: "post",
				data: this.ruleForm
			}).then(({ data }) => {
				if (data && data.code === 0) {
					this.$message({ message: "修改信息成功", type: "success", duration: 1500 });
				} else {
					this.$message.error(data.msg);
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
.form-half ::v-deep .el-select { width: 100%; }
.form-full { width: 100%; margin-bottom: 20px; }
.form-full ::v-deep .el-input__inner { border: 1px solid #e8e8e8; border-radius: 6px; color: #303133; }
.form-actions { padding-top: 20px; border-top: 1px solid #f0f0f0; margin-top: 10px; }
.form-actions .el-button--primary { background: #FF6B35; border-color: #FF6B35; padding: 10px 32px; border-radius: 6px; }
.form-actions .el-button--primary:hover { background: #E85D2C; border-color: #E85D2C; }
</style>
