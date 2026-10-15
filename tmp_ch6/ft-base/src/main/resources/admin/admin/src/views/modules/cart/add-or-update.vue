<template>
	<div class="form-page">
		<el-form class="form-container" ref="ruleForm" :model="ruleForm" :rules="rules" label-width="100px">
			<div class="form-row">
				<el-form-item class="form-half" label="商品名称" prop="goodname">
					<el-input v-model="ruleForm.goodname" placeholder="请输入商品名称" clearable :readonly="type=='info'"></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="商品类型" prop="goodtype">
					<el-input v-model="ruleForm.goodtype" placeholder="请输入商品类型" clearable :readonly="type=='info'"></el-input>
				</el-form-item>
			</div>
			<div class="form-row">
				<el-form-item class="form-half" label="单价" prop="price">
					<el-input v-model="ruleForm.price" placeholder="请输入单价" clearable :readonly="type=='info'">
						<template slot="prepend">¥</template>
					</el-input>
				</el-form-item>
				<el-form-item class="form-half" label="购买数量" prop="buynumber">
					<el-input v-model="ruleForm.buynumber" placeholder="请输入购买数量" clearable :readonly="type=='info'"></el-input>
				</el-form-item>
			</div>
			<el-form-item class="form-full" label="图片" prop="picture">
				<file-upload v-if="type!='info'" tip="点击上传图片" action="file/upload" :limit="3" :multiple="true" :fileUrls="ruleForm.picture?ruleForm.picture:''" @change="pictureUploadChange"></file-upload>
				<div v-else-if="ruleForm.picture" class="image-list">
					<el-image v-for="(item,index) in ruleForm.picture.split(',')" :key="index" :src="item.substring(0,4)=='http' ? item : $base.url+item" fit="cover" class="preview-image" :preview-src-list="[item.substring(0,4)=='http' ? item : $base.url+item]"></el-image>
				</div>
				<span v-else class="placeholder-text">暂无图片</span>
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
		return { id: '', type: '', ruleForm: { goodname: '', goodtype: '', price: '', buynumber: '', picture: '' }, rules: {} };
	},
	props: ["parent"],
	methods: {
		init(id, type) {
			if (id) { this.id = id; this.type = type; }
			if (this.type == 'info' || this.type == 'else') { this.info(id); }
		},
		info(id) {
			this.$http({ url: `cart/info/${id}`, method: "get" }).then(({ data }) => {
				if (data && data.code === 0) this.ruleForm = data.data;
			});
		},
		onSubmit() {
			if (this.ruleForm.picture != null) this.ruleForm.picture = this.ruleForm.picture.replace(new RegExp(this.$base.url, "g"), "");
			this.$refs["ruleForm"].validate(valid => {
				if (valid) {
					this.$http({ url: `cart/${!this.ruleForm.id ? "save" : "update"}`, method: "post", data: this.ruleForm }).then(({ data }) => {
						if (data && data.code === 0) {
							this.$message({ message: "操作成功", type: "success", duration: 1500, onClose: () => { this.parent.showFlag = true; this.parent.addOrUpdateFlag = false; this.parent.search(); } });
						} else { this.$message.error(data.msg); }
					});
				}
			});
		},
		back() { this.parent.showFlag = true; this.parent.addOrUpdateFlag = false; },
		pictureUploadChange(fileUrls) { this.ruleForm.picture = fileUrls; }
	}
};
</script>
<style lang="scss" scoped>
.form-page { padding: 20px 24px; background: #FFF8F0; min-height: 100%; }
.form-container { background: #fff; border-radius: 8px; padding: 30px; width: 90%; margin: 0 auto; }
.form-row { display: flex; gap: 20px; }
.form-half { flex: 1; margin-bottom: 20px; }
.form-half ::v-deep .el-input__inner { border: 1px solid #e8e8e8; border-radius: 6px; height: 40px; color: #303133; }
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
