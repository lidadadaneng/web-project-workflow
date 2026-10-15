<template>
	<div class="form-page">
		<el-form class="form-container" ref="ruleForm" :model="ruleForm" :rules="rules" label-width="100px">
			<el-form-item class="form-full" label="评论内容" prop="content">
				<el-input v-model="ruleForm.content" type="textarea" :rows="3" readonly></el-input>
			</el-form-item>
			<el-form-item class="form-full" label="回复内容" prop="reply">
				<el-input v-if="type!='info'" v-model="ruleForm.reply" type="textarea" :rows="3" placeholder="请输入回复内容"></el-input>
				<el-input v-else :value="ruleForm.reply" readonly></el-input>
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
export default {
	data() {
		return { id: '', type: '', ruleForm: { content: '', reply: '' }, rules: {} };
	},
	props: ["parent"],
	methods: {
		init(id, type) {
			if (id) { this.id = id; this.type = type; }
			if (this.type == 'info' || this.type == 'else') { this.info(id); }
		},
		info(id) {
			this.$http({ url: `discussmeishixinxi/info/${id}`, method: "get" }).then(({ data }) => {
				if (data && data.code === 0) this.ruleForm = data.data;
			});
		},
		onSubmit() {
			this.$refs["ruleForm"].validate(valid => {
				if (valid) {
					this.$http({ url: `discussmeishixinxi/${!this.ruleForm.id ? "save" : "update"}`, method: "post", data: this.ruleForm }).then(({ data }) => {
						if (data && data.code === 0) {
							this.$message({ message: "操作成功", type: "success", duration: 1500, onClose: () => { this.parent.showFlag = true; this.parent.addOrUpdateFlag = false; this.parent.search(); } });
						} else { this.$message.error(data.msg); }
					});
				}
			});
		},
		back() { this.parent.showFlag = true; this.parent.addOrUpdateFlag = false; }
	}
};
</script>
<style lang="scss" scoped>
.form-page { padding: 20px 24px; background: #FFF8F0; min-height: 100%; }
.form-container { background: #fff; border-radius: 8px; padding: 30px; width: 90%; margin: 0 auto; }
.form-full { width: 100%; margin-bottom: 20px; }
.form-full ::v-deep .el-textarea__inner { border: 1px solid #e8e8e8; border-radius: 6px; color: #303133; }
.form-actions { padding-top: 20px; border-top: 1px solid #f0f0f0; margin-top: 10px; }
.form-actions .el-button--primary { background: #FF6B35; border-color: #FF6B35; padding: 10px 32px; border-radius: 6px; }
.form-actions .el-button--primary:hover { background: #E85D2C; border-color: #E85D2C; }
.form-actions .el-button--default { padding: 10px 32px; border-radius: 6px; }
</style>
