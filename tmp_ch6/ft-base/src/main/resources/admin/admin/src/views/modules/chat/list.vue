<template>
  <div class="main-content">
    <!-- 列表页 -->
    <div v-if="!showFlag" style="width: 100%;">
      <div>
        <el-table
		  :stripe='true'
          :data="dataList"
          border
          v-loading="dataListLoading"
          style="width: 100%;"
        >
          <el-table-column prop="ask" :formatter="askFormat" header-align="center" align="center" sortable label="新消息"></el-table-column>
          <el-table-column
		    prop="allnode"
            header-align="center"
            align="center"
            sortable
            label="状态"
            width="150"
          >
            <template slot-scope="scope">
              <el-tag v-if="scope.row.isreply==1" type="primary">未回复</el-tag>
              <el-tag v-if="scope.row.isreply==0" type="info">已回复</el-tag>
            </template>
          </el-table-column>
          <el-table-column
            header-align="center"
            align="center"
            width="150"
            label="操作"
          >
            <template slot-scope="scope">
              <el-button
                type="text"
                size="small"
                @click="addOrUpdateHandler(scope.row)"
              >回复</el-button>
            </template>
          </el-table-column>
        </el-table>
		
        <el-pagination
          @size-change="sizeChangeHandle"
          @current-change="currentChangeHandle"
          :current-page="pageIndex"
          :page-sizes="[10, 20, 50, 100]"
          :page-size="pageSize"
          :total="totalPage"
          :layout="layouts.join()"
          :hide-on-single-page="false"
        ></el-pagination>
      </div>
    </div>
    <!-- 添加/修改页面  将父组件的search方法传递给子组件-->
    <add-or-update v-else :parent="this" ref="addOrUpdate"></add-or-update>
  </div>
</template>
<script>
import AddOrUpdate from "./chat-add-or-update";
import { setInterval, clearInterval } from 'timers';
export default {
  data() {
    return {
      layouts: ["total", "prev", "pager", "next", "sizes", "jumper"],
      searchForm: {},
      dataList: [],
      pageIndex: 1,
      pageSize: 10,
      totalPage: 0,
      dataListLoading: false,
      showFlag: false,
      dataListSelections: [],
      inter: null
    };
  },
  created() {
    var that = this;
    var inter = setInterval(function () {
      that.getDataList();
    }, 5000);
    this.inter = inter;
  },
  destroyed() {
    clearInterval(this.inter);
  },
  components: { AddOrUpdate },
  methods: {
    askFormat(row, column) {
      if (row.ask && row.ask.startsWith('upload/')) {
        return '[图片]';
      } else {
        return row.ask;
      }
    },
    getDataList() {
      this.dataListLoading = true;
      this.$http({
        url: this.$api.chatpage,
        method: "get",
        params: {
          page: this.pageIndex,
          limit: this.pageSize,
          sort: 'id'
        }
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
    addOrUpdateHandler(row) {
      this.showFlag = true;
      this.$nextTick(() => {
        this.$refs.addOrUpdate.init(row.userid);
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
</style>
