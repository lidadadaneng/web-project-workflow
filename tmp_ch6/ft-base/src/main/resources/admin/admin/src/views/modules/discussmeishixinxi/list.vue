<template>
	<div class="main-content">
		<template v-if="showFlag">
			<div class="search-bar">
				<div class="search-item">
					<label>用户名</label>
					<el-input v-model="searchForm.nickname" placeholder="用户名" clearable size="small"></el-input>
				</div>
				<div class="search-item">
					<label>评论内容</label>
					<el-input v-model="searchForm.content" placeholder="评论内容" clearable size="small"></el-input>
				</div>
				<el-button type="primary" size="small" icon="el-icon-search" @click="search()">查询</el-button>
			</div>
			<div class="action-bar">
				<el-button type="danger" size="small" icon="el-icon-delete" v-if="isAuth('discussmeishixinxi','删除')" :disabled="dataListSelections.length <= 0" @click="deleteHandler()">批量删除</el-button>
			</div>

			<el-table class="data-table" :stripe="true" :data="dataList" v-loading="dataListLoading" @selection-change="selectionChangeHandler">
				<el-table-column type="selection" align="center" width="50"></el-table-column>
				<el-table-column type="index" label="序号" width="60" align="center" />
				<el-table-column prop="nickname" label="用户名" show-overflow-tooltip></el-table-column>
				<el-table-column prop="content" label="评论内容" show-overflow-tooltip></el-table-column>
				<el-table-column prop="reply" label="回复内容" show-overflow-tooltip></el-table-column>
				<el-table-column label="操作" width="240" align="center" fixed="right">
					<template slot-scope="scope">
						<el-button size="mini" type="text" icon="el-icon-edit" @click="addOrUpdateHandler(scope.row.id)">修改</el-button>
						<el-button size="mini" type="text" icon="el-icon-chat-dot-round" @click="addOrUpdateHandler(scope.row.id)">回复</el-button>
						<el-button size="mini" type="text" icon="el-icon-delete" class="danger-text" @click="deleteHandler(scope.row.id)">删除</el-button>
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
      if (this.searchForm.nickname != '' && this.searchForm.nickname != undefined) { params['nickname'] = '%' + this.searchForm.nickname + '%' }
      if (this.searchForm.content != '' && this.searchForm.content != undefined) { params['content'] = '%' + this.searchForm.content + '%' }
      this.$http({ url: "discussmeishixinxi/page", method: "get", params: params }).then(({ data }) => {
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
        this.$http({ url: "discussmeishixinxi/delete", method: "post", data: ids }).then(({ data }) => {
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
.search-bar { background: #fff; border-radius: 6px; padding: 16px 20px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
  .search-item { display: flex; align-items: center; gap: 8px; label { font-size: 13px; color: #606266; white-space: nowrap; } }
}
.action-bar { display: flex; gap: 10px; margin-bottom: 16px; }
.data-table { border-radius: 6px; overflow: hidden; }
.el-pagination { padding: 16px 0; }
::v-deep .el-table { th { background: #FAFAFA !important; color: #606266; font-weight: 600; font-size: 13px; } td { color: #606266; font-size: 13px; } .el-table__row:hover > td { background: #FFF8F0 !important; } .el-button--text { padding: 0 6px; font-size: 13px; } }
.danger-text { color: #F56C6C; &:hover { color: #f78989; } }
</style>
