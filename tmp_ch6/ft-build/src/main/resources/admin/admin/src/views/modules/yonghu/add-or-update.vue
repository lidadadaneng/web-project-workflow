<template>
	<div class="form-page">
		<el-form class="form-container" ref="ruleForm" :model="ruleForm" :rules="rules" label-width="100px">
			<div class="form-row">
				<el-form-item class="form-half" label="用户账号" prop="yonghuzhanghao">
					<el-input v-model="ruleForm.yonghuzhanghao" placeholder="请输入用户账号" clearable :readonly="type=='info'"></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="用户姓名" prop="yonghuxingming">
					<el-input v-model="ruleForm.yonghuxingming" placeholder="请输入用户姓名" clearable :readonly="type=='info'"></el-input>
				</el-form-item>
			</div>
			<div class="form-row">
				<el-form-item class="form-half" label="性别" prop="xingbie">
					<el-select v-if="type!='info'" v-model="ruleForm.xingbie" placeholder="请选择性别" style="width:100%">
						<el-option v-for="(item,index) in xingbieOptions" :key="index" :label="item" :value="item"></el-option>
					</el-select>
					<el-input v-else :value="ruleForm.xingbie" readonly></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="年龄" prop="nianling">
					<el-input v-model="ruleForm.nianling" placeholder="请输入年龄" clearable :readonly="type=='info'"></el-input>
				</el-form-item>
			</div>
			<el-form-item class="form-full" label="头像" prop="touxiang">
				<file-upload v-if="type!='info'" tip="点击上传头像" action="file/upload" :limit="3" :multiple="true" :fileUrls="ruleForm.touxiang?ruleForm.touxiang:''" @change="touxiangUploadChange"></file-upload>
				<div v-else-if="ruleForm.touxiang" class="image-list">
					<el-image v-for="(item,index) in ruleForm.touxiang.split(',')" :key="index" :src="item.substring(0,4)=='http' ? item : $base.url+item" fit="cover" class="preview-image" :preview-src-list="[item.substring(0,4)=='http' ? item : $base.url+item]"></el-image>
				</div>
				<span v-else class="placeholder-text">暂无头像</span>
			</el-form-item>
			<div class="form-actions">
				<el-button v-if="type!='info'" type="primary" @click="onSubmit">提交</el-button>
				<el-button v-if="type!='info'" @click="back()">取消</el-button>
				<el-button v-if="type=='info'" @click="back()">返回</el-button>
			</div>
		</el-form>
	</div>
</template>
<script>
import { isNumber, isIntNumer } from "@/utils/validate";
export default {
	data() {
		return {
			id: '', type: '', xingbieOptions: [],
			ruleForm: { yonghuzhanghao: '', yonghuxingming: '', xingbie: '', nianling: '', touxiang: '' },
			rules: {}
		};
	},
	props: ["parent"],
	mounted() { this.xingbieOptions = "男,女".split(','); },
	methods: {
		init(id, type) {
			if (id) { this.id = id; this.type = type; }
			if (this.type == 'info' || this.type == 'else') { this.info(id); }
		},
		info(id) {
			this.$http({ url: `yonghu/info/${id}`, method: "get" }).then(({ data }) => {
				if (data && data.code === 0) this.ruleForm = data.data;
			});
		},
		onSubmit() {
			if (this.ruleForm.touxiang != null) this.ruleForm.touxiang = this.ruleForm.touxiang.replace(new RegExp(this.$base.url, "g"), "");
			this.$refs["ruleForm"].validate(valid => {
				if (valid) {
					this.$http({ url: `yonghu/${!this.ruleForm.id ? "save" : "update"}`, method: "post", data: this.ruleForm }).then(({ data }) => {
						if (data && data.code === 0) {
							this.$message({ message: "操作成功", type: "success", duration: 1500, onClose: () => { this.parent.showFlag = true; this.parent.addOrUpdateFlag = false; this.parent.search(); } });
						} else { this.$message.error(data.msg); }
					});
				}
			});
		},
		back() { this.parent.showFlag = true; this.parent.addOrUpdateFlag = false; },
		touxiangUploadChange(fileUrls) { this.ruleForm.touxiang = fileUrls; }
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
.image-list { display: flex; gap: 12px; flex-wrap: wrap; }
.preview-image { width: 100px; height: 100px; border-radius: 6px; border: 1px solid #e8e8e8; }
.placeholder-text { color: #c0c4cc; font-size: 14px; }
.form-actions { padding-top: 20px; border-top: 1px solid #f0f0f0; margin-top: 10px; }
.form-actions .el-button--primary { background: #FF6B35; border-color: #FF6B35; padding: 10px 32px; border-radius: 6px; }
.form-actions .el-button--primary:hover { background: #E85D2C; border-color: #E85D2C; }
.form-actions .el-button--default { padding: 10px 32px; border-radius: 6px; }
</style>
