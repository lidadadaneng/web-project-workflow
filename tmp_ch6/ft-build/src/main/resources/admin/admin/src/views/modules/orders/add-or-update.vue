<template>
	<div class="form-page">
		<el-form class="form-container" ref="ruleForm" :model="ruleForm" :rules="rules" label-width="100px">
			<div class="form-row">
				<el-form-item class="form-half" label="订单编号" prop="orderid">
					<el-input v-model="ruleForm.orderid" readonly></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="商品名称" prop="goodname">
					<el-input v-model="ruleForm.goodname" placeholder="商品名称" clearable :readonly="type=='info' || ro.goodname"></el-input>
				</el-form-item>
			</div>
			<el-form-item class="form-full" label="商品图片" prop="picture">
				<file-upload v-if="type!='info' && !ro.picture" tip="点击上传商品图片" action="file/upload" :limit="3" :multiple="true" :fileUrls="ruleForm.picture?ruleForm.picture:''" @change="pictureUploadChange"></file-upload>
				<div v-else-if="ruleForm.picture" class="image-list">
					<el-image v-for="(item,index) in ruleForm.picture.split(',')" :key="index" :src="item.substring(0,4)=='http' ? item : $base.url+item" fit="cover" class="preview-image" :preview-src-list="[item.substring(0,4)=='http' ? item : $base.url+item]"></el-image>
				</div>
				<span v-else class="placeholder-text">暂无图片</span>
			</el-form-item>
			<div class="form-row">
				<el-form-item class="form-half" label="购买数量" prop="buynumber">
					<el-input v-model="ruleForm.buynumber" placeholder="购买数量" clearable :readonly="type=='info' || ro.buynumber"></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="价格" prop="price">
					<el-input v-model="ruleForm.price" placeholder="价格" clearable :readonly="type=='info' || ro.price">
						<template slot="prepend">¥</template>
					</el-input>
				</el-form-item>
			</div>
			<div class="form-row">
				<el-form-item class="form-half" label="折扣价格" prop="discountprice">
					<el-input v-model="ruleForm.discountprice" placeholder="折扣价格" clearable :readonly="type=='info' || ro.discountprice">
						<template slot="prepend">¥</template>
					</el-input>
				</el-form-item>
				<el-form-item class="form-half" label="总价格" prop="total">
					<el-input v-model="ruleForm.total" placeholder="总价格" clearable :readonly="type=='info' || ro.total">
						<template slot="prepend">¥</template>
					</el-input>
				</el-form-item>
			</div>
			<div class="form-row">
				<el-form-item class="form-half" label="折扣总价格" prop="discounttotal">
					<el-input v-model="ruleForm.discounttotal" placeholder="折扣总价格" clearable :readonly="type=='info' || ro.discounttotal">
						<template slot="prepend">¥</template>
					</el-input>
				</el-form-item>
				<el-form-item class="form-half" label="支付类型" prop="type">
					<el-select v-if="type!='info' && !ro.type" v-model="ruleForm.type" placeholder="请选择支付类型" style="width:100%">
						<el-option v-for="(item,index) in typeOptions" :key="index" :label="item" :value="index+1"></el-option>
					</el-select>
					<el-input v-else :value="ruleForm.type-0==1?'现金':ruleForm.type-0==2?'积分':'拼团'" readonly></el-input>
				</el-form-item>
			</div>
			<div class="form-row">
				<el-form-item class="form-half" label="状态" prop="status">
					<el-select v-if="type!='info' && !ro.status" v-model="ruleForm.status" placeholder="请选择状态" style="width:100%">
						<el-option v-for="(item,index) in statusOptions" :key="index" :label="item" :value="item"></el-option>
					</el-select>
					<el-input v-else :value="ruleForm.status" readonly></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="商品类型" prop="goodtype">
					<el-input v-model="ruleForm.goodtype" placeholder="商品类型" clearable :readonly="type=='info' || ro.goodtype"></el-input>
				</el-form-item>
			</div>
			<div class="form-row">
				<el-form-item class="form-half" label="地址" prop="address">
					<el-input v-model="ruleForm.address" placeholder="地址" clearable :readonly="type=='info' || ro.address"></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="电话" prop="tel">
					<el-input v-model="ruleForm.tel" placeholder="电话" clearable :readonly="type=='info' || ro.tel"></el-input>
				</el-form-item>
			</div>
			<div class="form-row">
				<el-form-item class="form-half" label="收货人" prop="consignee">
					<el-input v-model="ruleForm.consignee" placeholder="收货人" clearable :readonly="type=='info' || ro.consignee"></el-input>
				</el-form-item>
				<el-form-item class="form-half" label="备注" prop="remark">
					<el-input v-model="ruleForm.remark" placeholder="备注" clearable :readonly="type=='info' || ro.remark"></el-input>
				</el-form-item>
			</div>
			<el-form-item v-if="type=='info'" class="form-half" label="下单时间" prop="addtime">
				<el-input v-model="ruleForm.addtime" readonly></el-input>
			</el-form-item>
			<el-form-item class="form-full" label="物流信息" prop="logistics">
				<editor v-if="type!='info'" v-model="ruleForm.logistics" class="editor" action="file/upload"></editor>
				<div v-else-if="ruleForm.logistics" class="detail-content" v-html="ruleForm.logistics"></div>
				<span v-else class="placeholder-text">暂无物流信息</span>
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
			ro: { goodname: false, picture: false, buynumber: false, price: false, discountprice: false, total: false, discounttotal: false, type: false, status: false, address: false, tel: false, consignee: false, remark: false, goodtype: false },
			ruleForm: { orderid: '', goodname: '', picture: '', buynumber: '', price: '', discountprice: '', total: '', discounttotal: '', type: '', status: '', address: '', tel: '', consignee: '', remark: '', goodtype: '', addtime: '', logistics: '' },
			typeOptions: ['现金', '积分', '拼团'],
			statusOptions: ['已支付', '已发货', '已完成', '已取消'],
			rules: {}
		};
	},
	props: ["parent"],
	methods: {
		init(id, type) {
			if (id) { this.id = id; this.type = type; }
			if (this.type == 'info' || this.type == 'else') { this.info(id); }
		},
		info(id) {
			this.$http({ url: `orders/info/${id}`, method: "get" }).then(({ data }) => {
				if (data && data.code === 0) this.ruleForm = data.data;
			});
		},
		onSubmit() {
			if (this.ruleForm.picture != null) this.ruleForm.picture = this.ruleForm.picture.replace(new RegExp(this.$base.url, "g"), "");
			this.$refs["ruleForm"].validate(valid => {
				if (valid) {
					this.$http({ url: `orders/${!this.ruleForm.id ? "save" : "update"}`, method: "post", data: this.ruleForm }).then(({ data }) => {
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
.form-half ::v-deep .el-select { width: 100%; }
.form-full { width: 100%; margin-bottom: 20px; }
.form-full ::v-deep .el-input__inner { border: 1px solid #e8e8e8; border-radius: 6px; color: #303133; }
.image-list { display: flex; gap: 12px; flex-wrap: wrap; }
.preview-image { width: 100px; height: 100px; border-radius: 6px; border: 1px solid #e8e8e8; }
.placeholder-text { color: #c0c4cc; font-size: 14px; }
.detail-content { border: 1px solid #e8e8e8; border-radius: 6px; padding: 16px; max-height: 400px; overflow-y: auto; line-height: 1.8; color: #303133; }
.detail-content img { max-width: 100%; }
.form-actions { padding-top: 20px; border-top: 1px solid #f0f0f0; margin-top: 10px; }
.form-actions .el-button--primary { background: #FF6B35; border-color: #FF6B35; padding: 10px 32px; border-radius: 6px; }
.form-actions .el-button--primary:hover { background: #E85D2C; border-color: #E85D2C; }
.form-actions .el-button--default { padding: 10px 32px; border-radius: 6px; }
</style>
