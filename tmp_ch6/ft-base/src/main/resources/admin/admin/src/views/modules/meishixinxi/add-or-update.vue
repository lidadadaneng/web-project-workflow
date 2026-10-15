<template>
	<div class="form-page">
		<el-form class="form-container" ref="ruleForm" :model="ruleForm" :rules="rules" label-width="100px">
			<div class="form-row">
				<el-form-item class="form-half" label="美食名称" prop="meishimingcheng">
					<el-input v-model="ruleForm.meishimingcheng" placeholder="请输入美食名称" clearable :readonly="type=='info'" :disabled="ro.meishimingcheng"></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="美食分类" prop="meishifenlei">
					<el-select v-if="type!='info' && !ro.meishifenlei" v-model="ruleForm.meishifenlei" placeholder="请选择美食分类" style="width:100%">
						<el-option v-for="(item,index) in meishifenleiOptions" :key="index" :label="item" :value="item"></el-option>
					</el-select>
					<el-input v-else :value="ruleForm.meishifenlei" readonly></el-input>
				</el-form-item>
			</div>
			<div class="form-row">
				<el-form-item class="form-half" label="口味" prop="kouwei">
					<el-input v-model="ruleForm.kouwei" placeholder="请输入口味" clearable :readonly="type=='info'" :disabled="ro.kouwei"></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="价格" prop="price">
					<el-input v-model="ruleForm.price" placeholder="请输入价格" clearable :readonly="type=='info'" :disabled="ro.price">
						<template slot="prepend">¥</template>
					</el-input>
				</el-form-item>
			</div>
			<el-form-item class="form-full" label="美食图片" prop="meishitupian">
				<file-upload v-if="type!='info' && !ro.meishitupian" tip="点击上传美食图片" action="file/upload" :limit="3" :multiple="true" :fileUrls="ruleForm.meishitupian?ruleForm.meishitupian:''" @change="meishitupianUploadChange"></file-upload>
				<div v-else-if="ruleForm.meishitupian" class="image-list">
					<el-image v-for="(item,index) in ruleForm.meishitupian.split(',')" :key="index" :src="item.substring(0,4)=='http' ? item : $base.url+item" fit="cover" class="preview-image" :preview-src-list="[item.substring(0,4)=='http' ? item : $base.url+item]"></el-image>
				</div>
				<span v-else class="placeholder-text">暂无图片</span>
			</el-form-item>
			<el-form-item class="form-full" label="美食详情" prop="meishixiangqing">
				<editor v-if="type!='info'" v-model="ruleForm.meishixiangqing" class="editor" action="file/upload"></editor>
				<div v-else-if="ruleForm.meishixiangqing" class="detail-content" v-html="ruleForm.meishixiangqing"></div>
				<span v-else class="placeholder-text">暂无详情</span>
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
			id: '', type: '',
			ro: { meishimingcheng: false, meishifenlei: false, meishitupian: false, kouwei: false, meishixiangqing: false, clicktime: false, clicknum: false, price: false },
			ruleForm: { meishimingcheng: '', meishifenlei: '', meishitupian: '', kouwei: '', meishixiangqing: '', clicktime: '', price: '' },
			meishifenleiOptions: [],
			rules: {
				price: [{ required: true, message: '价格不能为空', trigger: 'blur' }, { validator: (r, v, cb) => { if (!v || isNumber(v)) cb(); else cb(new Error('请输入数字')); }, trigger: 'blur' }]
			}
		};
	},
	props: ["parent"],
	methods: {
		init(id, type) {
			if (id) { this.id = id; this.type = type; }
			if (this.type == 'info' || this.type == 'else') { this.info(id); }
			this.$http({ url: 'option/meishifenlei/meishifenlei', method: "get" }).then(({ data }) => {
				if (data && data.code === 0) this.meishifenleiOptions = data.data;
			});
		},
		info(id) {
			this.$http({ url: `meishixinxi/info/${id}`, method: "get" }).then(({ data }) => {
				if (data && data.code === 0) {
					this.ruleForm = data.data;
					let reg = new RegExp('../../../upload', 'g');
					this.ruleForm.meishixiangqing = this.ruleForm.meishixiangqing.replace(reg, '../../../springboot7tr93/upload');
				}
			});
		},
		onSubmit() {
			if (this.ruleForm.meishitupian != null) {
				this.ruleForm.meishitupian = this.ruleForm.meishitupian.replace(new RegExp(this.$base.url, "g"), "");
			}
			this.$refs["ruleForm"].validate(valid => {
				if (valid) {
					this.$http({ url: `meishixinxi/${!this.ruleForm.id ? "save" : "update"}`, method: "post", data: this.ruleForm }).then(({ data }) => {
						if (data && data.code === 0) {
							this.$message({ message: "操作成功", type: "success", duration: 1500, onClose: () => { this.parent.showFlag = true; this.parent.addOrUpdateFlag = false; this.parent.search(); } });
						} else { this.$message.error(data.msg); }
					});
				}
			});
		},
		back() { this.parent.showFlag = true; this.parent.addOrUpdateFlag = false; },
		meishitupianUploadChange(fileUrls) { this.ruleForm.meishitupian = fileUrls; }
	}
};
</script>

<style lang="scss" scoped>
.form-page {
	padding: 20px 24px;
	background: #FFF8F0;
	min-height: 100%;
}

.form-container {
	background: #fff;
	border-radius: 8px;
	padding: 30px;
	width: 90%;
	margin: 0 auto;
}

.form-row {
	display: flex;
	gap: 20px;
}

.form-half {
	flex: 1;
	margin-bottom: 20px;

	::v-deep .el-input__inner,
	::v-deep .el-textarea__inner {
		border: 1px solid #e8e8e8;
		border-radius: 6px;
		color: #303133;
	}

	::v-deep .el-input__inner {
		height: 40px;
	}

	::v-deep .el-select {
		width: 100%;
	}
}

.form-full {
	width: 100%;
	margin-bottom: 20px;

	::v-deep .el-input__inner,
	::v-deep .el-textarea__inner {
		border: 1px solid #e8e8e8;
		border-radius: 6px;
		color: #303133;
	}
}

.image-list {
	display: flex;
	gap: 12px;
	flex-wrap: wrap;

	.preview-image {
		width: 100px;
		height: 100px;
		border-radius: 6px;
		border: 1px solid #e8e8e8;
	}
}

.placeholder-text {
	color: #c0c4cc;
	font-size: 14px;
}

.detail-content {
	border: 1px solid #e8e8e8;
	border-radius: 6px;
	padding: 16px;
	max-height: 400px;
	overflow-y: auto;
	line-height: 1.8;
	color: #303133;

	img {
		max-width: 100%;
	}
}

.form-actions {
	padding-top: 20px;
	border-top: 1px solid #f0f0f0;
	margin-top: 10px;

	.el-button--primary {
		background: #FF6B35;
		border-color: #FF6B35;
		padding: 10px 32px;
		border-radius: 6px;

		&:hover {
			background: #E85D2C;
			border-color: #E85D2C;
		}
	}

	.el-button--default {
		padding: 10px 32px;
		border-radius: 6px;
	}
}
</style>
