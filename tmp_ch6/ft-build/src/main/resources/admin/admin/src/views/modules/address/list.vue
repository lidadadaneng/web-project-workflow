<template>
	<div class="main-content">
		<!-- 列表页 -->
		<template v-if="showFlag">
			<div class="search-bar">
					<el-button type="primary" size="small" icon="el-icon-search" @click="search()">查询</el-button>
				</div>
			<div class="action-bar">
					<el-button type="primary" size="small" icon="el-icon-plus">新增</el-button>
					<el-button type="danger" size="small" icon="el-icon-delete">删除</el-button>
			</div>

<el-table class="data-table" :stripe="true" 
					v-if="isAuth('address','查看')"
					:data="dataList"
					v-loading="dataListLoading"
				@selection-change="selectionChangeHandler">
					<el-table-column type="selection" align="center" width="50"></el-table-column>
					<el-table-column type="index" label="序号" width="60" align="center" />
					<el-table-column prop="address"
					label="地址">
						<template slot-scope="scope">
							{{scope.row.address}}
						</template>
					</el-table-column>
					<el-table-column prop="name"
					label="收货人">
						<template slot-scope="scope">
							{{scope.row.name}}
						</template>
					</el-table-column>
					<el-table-column prop="phone"
					label="电话">
						<template slot-scope="scope">
							{{scope.row.phone}}
						</template>
					</el-table-column>
					<el-table-column prop="isdefault"
					label="是否默认地址[是/否]">
						<template slot-scope="scope">
							{{scope.row.isdefault}}
						</template>
					</el-table-column>
					<el-table-column width="300" label="操作">
						<template slot-scope="scope">
							<el-button size="mini" type="text" @click="addOrUpdateHandler(scope.row.id,'info')">详情</el-button>
							<el-button size="mini" type="text" @click="addOrUpdateHandler(scope.row.id)">修改</el-button>

							<el-button size="mini" type="text" class="danger-text" @click="deleteHandler(scope.row.id)">删除</el-button>
						</template>
					</el-table-column>
				</el-table>
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
		
		<!-- 添加/修改页面  将父组件的search方法传递给子组件-->
		<add-or-update v-if="addOrUpdateFlag" :parent="this" ref="addOrUpdate"></add-or-update>

	</div>
</template>

<script>
import axios from 'axios'
import AddOrUpdate from "./add-or-update";
export default {
  data() {
    return {
      searchForm: {
        key: ""
      },
      form:{},
      dataList: [],
      pageIndex: 1,
      pageSize: 10,
      totalPage: 0,
      dataListLoading: false,
      dataListSelections: [],
      showFlag: true,
      sfshVisiable: false,
      shForm: {},
      chartVisiable: false,
      chartVisiable1: false,
      chartVisiable2: false,
      chartVisiable3: false,
      chartVisiable4: false,
      chartVisiable5: false,
      addOrUpdateFlag:false,
      layouts: ["total","prev","pager","next","sizes","jumper"],

    };
  },
  created() {
    this.init();
    this.getDataList();
  },
  mounted() {
  },
  filters: {
    htmlfilter: function (val) {
      return val.replace(/<[^>]*>/g).replace(/undefined/g,'');

  },
  components: {
    AddOrUpdate,
  },
  methods: {

    // 分页    },

    init () {
    },
    search() {
      this.pageIndex = 1;
      this.getDataList();
    },

    // 获取数据列表
    getDataList() {
      this.dataListLoading = true;
      let params = {
        page: this.pageIndex,
        limit: this.pageSize,
        sort: 'id',
        order: 'desc',

      this.$http({
        url: "address/page",
        method: "get",
        params: params
      }).then(({ data }) => {
        if (data && data.code === 0) {
          this.dataList = data.data.list;
          this.totalPage = data.data.total;
        } else {
          this.dataList = [];
          this.totalPage = 0;

        this.dataListLoading = false;
      });
    },
    // 每页数
    sizeChangeHandle(val) {
      this.pageSize = val;
      this.pageIndex = 1;
      this.getDataList();
    },
    // 当前页
    currentChangeHandle(val) {
      this.pageIndex = val;
      this.getDataList();
    },
    // 多选
    selectionChangeHandler(val) {
      this.dataListSelections = val;
    },
    // 添加/修改
    addOrUpdateHandler(id,type) {
      this.showFlag = false;
      this.addOrUpdateFlag = true;
      this.crossAddOrUpdateFlag = false;
      if(type!='info'){
        type = 'else';

      this.$nextTick(() => {
        this.$refs.addOrUpdate.init(id,type);
      });
    },
    // 下载
    download(file){
      window.open(`${file}`)
    },
    // 删除
    deleteHandler(id) {
      var ids = id
        ? [Number(id)]
        : this.dataListSelections.map(item => {
            return Number(item.id);
          });
      this.$confirm(`确定进行[${id ? "删除" : "批量删除"}]操作?`, "提示", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning"
      }).then(() => {
        this.$http({
          url: "address/delete",
          method: "post",
          data: ids
        }).then(({ data }) => {
          if (data && data.code === 0) {
            this.$message({
              message: "操作成功",
              type: "success",
              duration: 1500,
              onClose: () => {
                this.search();

            });
          } else {
            this.$message.error(data.msg);

        });
      });
    },

};
</script>
<style lang="scss" scoped>
.main-content {
  padding: 20px 24px;
  background: #FFF8F0;
  min-height: 100%;
}

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
  }
}

.action-bar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.data-table {
  border-radius: 6px;
  overflow: hidden;
}

.el-pagination {
  padding: 16px 0;
}

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

.danger-text {
  color: #F56C6C;

  &:hover {
    color: #f78989;
  }
}
</style></style>
