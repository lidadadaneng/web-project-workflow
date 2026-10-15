<template>
	<div class="form-page">
		<el-form class="form-container" ref="ruleForm" :model="ruleForm" :rules="rules" label-width="120px">
			<div class="form-row">
				<el-form-item class="form-half" label="收货人" prop="name">
					<el-input v-model="ruleForm.name" placeholder="请输入收货人" clearable :readonly="type=='info'"></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="电话" prop="phone">
					<el-input v-model="ruleForm.phone" placeholder="请输入电话" clearable :readonly="type=='info'"></el-input>
				</el-form-item>
			</div>
			<el-form-item class="form-full" label="地址" prop="address">
				<el-input v-model="ruleForm.address" placeholder="请输入地址" clearable :readonly="type=='info'"></el-input>
			</el-form-item>
			<el-form-item class="form-half" label="是否默认地址" prop="isdefault">
				<el-select v-if="type!='info'" v-model="ruleForm.isdefault" placeholder="请选择" style="width:100%">
					<el-option label="是" value="是"></el-option>
					<el-option label="否" value="否"></el-option>
				</el-select>
				<el-input v-else :value="ruleForm.isdefault" readonly></el-input>
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
		return { id: '', type: '', ruleForm: { name: '', phone: '', address: '', isdefault: '' }, rules: {} };
	},
	props: ["parent"],
	methods: {
		init(id, type) {
			if (id) { this.id = id; this.type = type; }
			if (this.type == 'info' || this.type == 'else') { this.info(id); }
		},
		info(id) {
			this.$http({ url: `address/info/${id}`, method: "get" }).then(({ data }) => {
				if (data && data.code === 0) this.ruleForm = data.data;
			});
		},
		onSubmit() {
			this.$refs["ruleForm"].validate(valid => {
				if (valid) {
					this.$http({ url: `address/${!this.ruleForm.id ? "save" : "update"}`, method: "post", data: this.ruleForm }).then(({ data }) => {
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
.form-row { display: flex; gap: 20px; }
.form-half { flex: 1; margin-bottom: 20px; }
.form-half ::v-deep .el-input__inner { border: 1px solid #e8e8e8; border-radius: 6px; height: 40px; color: #303133; }
.form-half ::v-deep .el-select { width: 100%; }
.form-full { width: 100%; margin-bottom: 20px; }
.form-full ::v-deep .el-input__inner { border: 1px solid #e8e8e8; border-radius: 6px; color: #303133; }
.form-actions { padding-top: 20px; border-top: 1px solid #f0f0f0; margin-top: 10px; }
.form-actions .el-button--primary { background: #FF6B35; border-color: #FF6B35; padding: 10px 32px; border-radius: 6px; }
.form-actions .el-button--primary:hover { background: #E85D2C; border-color: #E85D2C; }
.form-actions .el-button--default { padding: 10px 32px; border-radius: 6px; }
</style>
