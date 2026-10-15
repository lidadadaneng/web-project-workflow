<template>
	<div class="main-content">
		<template v-if="showFlag">
			<div class="action-bar">
				<el-button type="primary" size="small" icon="el-icon-plus" v-if="isAuth('config','新增')" @click="addOrUpdateHandler()">新增</el-button>
				<el-button type="danger" size="small" icon="el-icon-delete" v-if="isAuth('config','删除')" :disabled="dataListSelections.length <= 0" @click="deleteHandler()">删除</el-button>
			</div>

			<el-table class="data-table" :stripe="true" v-if="isAuth('config','查看')" :data="dataList" v-loading="dataListLoading" @selection-change="selectionChangeHandler">
				<el-table-column type="selection" align="center" width="50"></el-table-column>
				<el-table-column type="index" label="序号" width="60" align="center" />
				<el-table-column prop="name" label="名称" show-overflow-tooltip></el-table-column>
				<el-table-column prop="value" label="值" width="200" align="center">
					<template slot-scope="scope">
						<el-image v-if="scope.row.value" :src="scope.row.value.substring(0,4)=='http' ? scope.row.value.split(',')[0] : $base.url+scope.row.value.split(',')[0]" fit="cover" style="width:60px;height:60px;border-radius:4px"></el-image>
						<span v-else style="color:#c0c4cc">暂无</span>
					</template>
				</el-table-column>
				<el-table-column label="操作" width="240" align="center" fixed="right">
					<template slot-scope="scope">
						<el-button size="mini" type="text" icon="el-icon-view" v-if="isAuth('config','查看')" @click="addOrUpdateHandler(scope.row.id,'info')">详情</el-button>
						<el-button size="mini" type="text" icon="el-icon-edit" v-if="isAuth('config','修改')" @click="addOrUpdateHandler(scope.row.id)">修改</el-button>
					</template>
				</el-table-column>
			</el-table>

			<el-pagination @size-change="sizeChangeHandle" @current-change="currentChangeHandle" :current-page="pageIndex" background :page-sizes="[10, 20, 30, 50]" :page-size="pageSize" :layout="layouts.join()" :total="totalPage" :hide-on-single-page="false"></el-pagination>
		</template>
		<add-or-update v-if="addOrUpdateFlag" :parent="this" ref="addOrUpdate"></add-or-update>
	</div>
</template>

<script>
import AddOrUpdate from "./add-or-update";
export default {
  data() {
    return {
      searchForm: { key: "" },
      form: {},
      dataList: [],
      pageIndex: 1,
      pageSize: 10,
      totalPage: 0,
      dataListLoading: false,
      dataListSelections: [],
      showFlag: true,
      addOrUpdateFlag: false,
      layouts: ["total", "prev", "pager", "next", "sizes", "jumper"],
    };
  },
  created() {
    this.init();
    this.getDataList();
  },
  components: { AddOrUpdate },
  methods: {
    init() {},
    search() { this.pageIndex = 1; this.getDataList(); },
    getDataList() {
      this.dataListLoading = true;
      let params = { page: this.pageIndex, limit: this.pageSize, sort: 'id', order: 'desc' }
      this.$http({ url: "config/page", method: "get", params: params }).then(({ data }) => {
        if (data && data.code === 0) { this.dataList = data.data.list; this.totalPage = data.data.total; }
        else { this.dataList = []; this.totalPage = 0; }
        this.dataListLoading = false;
      });
    },
    sizeChangeHandle(val) { this.pageSize = val; this.pageIndex = 1; this.getDataList(); },
    currentChangeHandle(val) { this.pageIndex = val; this.getDataList(); },
    selectionChangeHandler(val) { this.dataListSelections = val; },
    addOrUpdateHandler(id, type) {
      this.showFlag = false; this.addOrUpdateFlag = true;
      if (type != 'info') { type = 'else'; }
      this.$nextTick(() => { this.$refs.addOrUpdate.init(id, type); });
    },
    deleteHandler(id) {
      var ids = id ? [Number(id)] : this.dataListSelections.map(item => Number(item.id));
      this.$confirm(`确定进行[${id ? "删除" : "批量删除"}]操作?`, "提示", { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" }).then(() => {
        this.$http({ url: "config/delete", method: "post", data: ids }).then(({ data }) => {
          if (data && data.code === 0) { this.$message({ message: "操作成功", type: "success", duration: 1500, onClose: () => { this.search(); } }); }
          else { this.$message.error(data.msg); }
        });
      });
    },
  }
};
</script>

<style lang="scss" scoped>
.main-content { padding: 20px 24px; background: #FFF8F0; min-height: 100%; }
.action-bar { display: flex; gap: 10px; margin-bottom: 16px; }
.data-table { border-radius: 6px; overflow: hidden; }
.el-pagination { padding: 16px 0; }
::v-deep .el-table { th { background: #FAFAFA !important; color: #606266; font-weight: 600; font-size: 13px; } td { color: #606266; font-size: 13px; } .el-table__row:hover > td { background: #FFF8F0 !important; } .el-button--text { padding: 0 6px; font-size: 13px; } }
</style>
