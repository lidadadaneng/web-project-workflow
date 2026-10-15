<template>
	<div class="main-content">
		<!-- 列表页 -->
		<template v-if="showFlag">
			<!-- 搜索栏 -->
			<div class="search-bar">
				<div class="search-item">
					<label>美食名称</label>
					<el-input v-model="searchForm.meishimingcheng" placeholder="美食名称" clearable size="small"></el-input>
				</div>
				<div class="search-item">
					<label>价格</label>
					<el-input v-model="searchForm.pricestart" placeholder="最低" clearable size="small"></el-input>
					<span class="sep">-</span>
					<el-input v-model="searchForm.priceend" placeholder="最高" clearable size="small"></el-input>
				</div>
				<el-button type="primary" size="small" icon="el-icon-search" @click="search()">查询</el-button>
			</div>

			<!-- 操作栏 -->
			<div class="action-bar">
				<el-button type="primary" size="small" icon="el-icon-plus" v-if="isAuth('meishixinxi','新增')" @click="addOrUpdateHandler()">新增</el-button>
				<el-button type="danger" size="small" icon="el-icon-delete" v-if="isAuth('meishixinxi','删除')" :disabled="dataListSelections.length <= 0" @click="deleteHandler()">删除</el-button>
			</div>

			<!-- 数据表格 -->
			<el-table class="data-table" :stripe="true" v-if="isAuth('meishixinxi','查看')" :data="dataList" v-loading="dataListLoading" @selection-change="selectionChangeHandler">
				<el-table-column type="selection" align="center" width="50"></el-table-column>
				<el-table-column type="index" label="序号" width="60" align="center"></el-table-column>
				<el-table-column prop="meishimingcheng" label="美食名称" show-overflow-tooltip></el-table-column>
				<el-table-column prop="meishifenlei" label="美食分类" show-overflow-tooltip></el-table-column>
				<el-table-column prop="meishitupian" label="美食图片" width="120" align="center">
					<template slot-scope="scope">
						<el-image v-if="scope.row.meishitupian" :src="scope.row.meishitupian.substring(0,4)=='http' ? scope.row.meishitupian.split(',')[0] : $base.url+scope.row.meishitupian.split(',')[0]" :preview-src-list="[scope.row.meishitupian.substring(0,4)=='http' ? scope.row.meishitupian.split(',')[0] : $base.url+scope.row.meishitupian.split(',')[0]]" fit="cover" style="width:60px;height:60px;border-radius:4px"></el-image>
						<span v-else style="color:#c0c4cc">暂无</span>
					</template>
				</el-table-column>
				<el-table-column prop="kouwei" label="口味" show-overflow-tooltip></el-table-column>
				<el-table-column prop="clicknum" label="点击次数" width="100" align="center"></el-table-column>
				<el-table-column prop="price" label="价格" width="100" align="center">
					<template slot-scope="scope">
						<span style="color:#FF6B35;font-weight:600">¥{{ scope.row.price }}</span>
					</template>
				</el-table-column>
				<el-table-column label="操作" width="240" align="center" fixed="right">
					<template slot-scope="scope">
						<el-button size="mini" type="text" icon="el-icon-view" v-if="isAuth('meishixinxi','查看')" @click="addOrUpdateHandler(scope.row.id,'info')">详情</el-button>
						<el-button size="mini" type="text" icon="el-icon-edit" v-if="isAuth('meishixinxi','修改')" @click="addOrUpdateHandler(scope.row.id)">修改</el-button>
						<el-button size="mini" type="text" icon="el-icon-chat-dot-round" v-if="isAuth('meishixinxi','查看评论')" @click="disscussListHandler(scope.row.id)">评论</el-button>
						<el-button size="mini" type="text" icon="el-icon-delete" class="danger-text" v-if="isAuth('meishixinxi','删除')" @click="deleteHandler(scope.row.id)">删除</el-button>
					</template>
				</el-table-column>
			</el-table>

			<!-- 分页 -->
			<el-pagination
				@size-change="sizeChangeHandle"
				@current-change="currentChangeHandle"
				:current-page="pageIndex"
				background
				:page-sizes="[10, 20, 30, 50]"
				:page-size="pageSize"
				:layout="layouts.join()"
				:total="totalPage"
				:hide-on-single-page="false"
			></el-pagination>
		</template>

		<!-- 添加/修改页面 -->
		<add-or-update v-if="addOrUpdateFlag" :parent="this" ref="addOrUpdate"></add-or-update>
	</div>
</template>

<script>
import axios from 'axios'
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
      sfshVisiable: false,
      shForm: {},
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
    search() {
      this.pageIndex = 1;
      this.getDataList();
    },
    getDataList() {
      this.dataListLoading = true;
      let params = {
        page: this.pageIndex,
        limit: this.pageSize,
        sort: 'id',
        order: 'desc',
      }
      if (this.searchForm.meishimingcheng != '' && this.searchForm.meishimingcheng != undefined) {
        params['meishimingcheng'] = '%' + this.searchForm.meishimingcheng + '%'
      }
      if (this.searchForm.pricestart != '' && this.searchForm.pricestart != undefined) {
        params['pricestart'] = this.searchForm.pricestart
      }
      if (this.searchForm.priceend != '' && this.searchForm.priceend != undefined) {
        params['priceend'] = this.searchForm.priceend
      }
      this.$http({
        url: "meishixinxi/page",
        method: "get",
        params: params
      }).then(({ data }) => {
        if (data && data.code === 0) {
          this.dataList = data.data.list;
          this.totalPage = data.data.total;
        } else {
          this.dataList = [];
          this.totalPage = 0;
        }
        this.dataListLoading = false;
      });
    },
    sizeChangeHandle(val) {
      this.pageSize = val;
      this.pageIndex = 1;
      this.getDataList();
    },
    currentChangeHandle(val) {
      this.pageIndex = val;
      this.getDataList();
    },
    selectionChangeHandler(val) {
      this.dataListSelections = val;
    },
    addOrUpdateHandler(id, type) {
      this.showFlag = false;
      this.addOrUpdateFlag = true;
      this.crossAddOrUpdateFlag = false;
      if (type != 'info') { type = 'else'; }
      this.$nextTick(() => {
        this.$refs.addOrUpdate.init(id, type);
      });
    },
    disscussListHandler(id) {
      this.$router.push({ path: '/discussmeishixinxi', query: { refid: id } });
    },
    download(file) {
      window.open(`${file}`)
    },
    deleteHandler(id) {
      var ids = id
        ? [Number(id)]
        : this.dataListSelections.map(item => Number(item.id));
      this.$confirm(`确定进行[${id ? "删除" : "批量删除"}]操作?`, "提示", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning"
      }).then(() => {
        this.$http({
          url: "meishixinxi/delete",
          method: "post",
          data: ids
        }).then(({ data }) => {
          if (data && data.code === 0) {
            this.$message({ message: "操作成功", type: "success", duration: 1500, onClose: () => { this.search(); } });
          } else {
            this.$message.error(data.msg);
          }
        });
      });
    },
  }
};
</script>

<style lang="scss" scoped>
.main-content {
  padding: 20px 24px;
  background: #FFF8F0;
  min-height: 100%;
}

/* 搜索栏 */
.search-bar {
  background: #fff;
  border-radius: 6px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;

  .search-item {
    display: flex;
    align-items: center;
    gap: 8px;

    label {
      font-size: 13px;
      color: #606266;
      white-space: nowrap;
    }

    .el-input {
      width: 160px;
    }

    .sep {
      color: #c0c4cc;
      margin: 0 2px;
    }
  }
}

/* 操作栏 */
.action-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

/* 数据表格 */
.data-table {
  border-radius: 6px;
  overflow: hidden;

  .danger-text {
    color: #F56C6C;

    &:hover {
      color: #f78989;
    }
  }
}

/* 分页 */
.el-pagination {
  padding: 16px 0;
}

/* 表格通用样式 */
::v-deep .el-table {
  th {
    background: #FAFAFA !important;
    color: #606266;
    font-weight: 600;
    font-size: 13px;
  }

  td {
    color: #606266;
    font-size: 13px;
  }

  .el-table__row:hover > td {
    background: #FFF8F0 !important;
  }

  .el-button--text {
    padding: 0 6px;
    font-size: 13px;
  }
}
</style>
