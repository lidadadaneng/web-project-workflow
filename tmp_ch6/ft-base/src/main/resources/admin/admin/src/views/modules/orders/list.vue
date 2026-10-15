<template>
	<div class="main-content">
		<!-- 列表页 -->
		<template v-if="showFlag">
			<div class="search-bar">
				<div class="search-item">
					<label>订单编号</label>
					<el-input v-model="searchForm.orderid" placeholder="订单编号" clearable size="small"></el-input>
				</div>
				<div class="search-item">
					<label>商品名称</label>
					<el-input v-model="searchForm.goodname" placeholder="商品名称" clearable size="small"></el-input>
				</div>
				<el-button type="primary" size="small" icon="el-icon-search" @click="search()">查询</el-button>
			</div>

			<div class="action-bar">
				<el-button type="primary" size="small" icon="el-icon-plus" v-if="isAuth('orders'+'/'+orderStatus,'新增')" @click="addOrUpdateHandler()">新增</el-button>
				<el-button type="danger" size="small" icon="el-icon-delete" v-if="isAuth('orders'+'/'+orderStatus,'删除')" :disabled="dataListSelections.length <= 0" @click="deleteHandler()">删除</el-button>
				<download-excel v-if="isAuth('orders'+'/'+orderStatus,'导出')" class="export-excel-wrapper" :data="dataList" :fields="json_fields" name="订单.xls">
					<el-button size="small" type="primary" icon="el-icon-download">导出</el-button>
				</download-excel>
				<el-button size="small" type="primary" v-if="isAuth('orders'+'/'+orderStatus,'日销量')" @click="dayNumberChartDialog()">日销量</el-button>
				<el-button size="small" type="primary" v-if="isAuth('orders'+'/'+orderStatus,'月销量')" @click="monthNumberChartDialog()">月销量</el-button>
				<el-button size="small" type="primary" v-if="isAuth('orders'+'/'+orderStatus,'年销量')" @click="yearNumberChartDialog()">年销量</el-button>
				<el-button size="small" type="primary" v-if="isAuth('orders'+'/'+orderStatus,'品销量')" @click="goodnameNumberChartDialog()">商品销量</el-button>
				<el-button size="small" type="primary" v-if="isAuth('orders'+'/'+orderStatus,'类销量')" @click="goodtypeNumberChartDialog()">类型销量</el-button>
				<el-button size="small" type="primary" v-if="isAuth('orders'+'/'+orderStatus,'日销额')" @click="dayAmountChartDialog()">日销额</el-button>
				<el-button size="small" type="primary" v-if="isAuth('orders'+'/'+orderStatus,'月销额')" @click="monthAmountChartDialog()">月销额</el-button>
				<el-button size="small" type="primary" v-if="isAuth('orders'+'/'+orderStatus,'年销额')" @click="yearAmountChartDialog()">年销额</el-button>
				<el-button size="small" type="primary" v-if="isAuth('orders'+'/'+orderStatus,'品销额')" @click="goodnameAmountChartDialog()">商品销额</el-button>
				<el-button size="small" type="primary" v-if="isAuth('orders'+'/'+orderStatus,'类销额')" @click="goodtypeAmountChartDialog()">类型销额</el-button>
			</div>

				<el-table class="data-table" :stripe="true"
					v-if="isAuth('orders'+'/'+orderStatus,'查看')"
					:data="dataList"
					v-loading="dataListLoading"
				@selection-change="selectionChangeHandler">
					<el-table-column type="selection" align="center" width="50"></el-table-column>
					<el-table-column type="index" label="序号" width="60" align="center" />
					<el-table-column :sortable='false'
						prop="orderid"
					label="订单编号">
						<template slot-scope="scope">
							{{scope.row.orderid}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="goodname"
					label="商品名称">
						<template slot-scope="scope">
							{{scope.row.goodname}}
						</template>
					</el-table-column>
					<el-table-column prop="picture" width="200" label="商品图片">
						<template slot-scope="scope">
							<div v-if="scope.row.picture">
								<img v-if="scope.row.picture.substring(0,4)=='http'" :src="scope.row.picture.split(',')[0]" width="100" height="100">
								<img v-else :src="$base.url+scope.row.picture.split(',')[0]" width="100" height="100">
							</div>
							<div v-else>无图片</div>
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="buynumber"
					label="购买数量">
						<template slot-scope="scope">
							{{scope.row.buynumber}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="price"
					label="价格">
						<template slot-scope="scope">
							{{scope.row.price}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="discountprice"
					label="折扣价格">
						<template slot-scope="scope">
							{{scope.row.discountprice}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="total"
					label="总价格">
						<template slot-scope="scope">
							{{scope.row.total}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="discounttotal"
					label="折扣总价格">
						<template slot-scope="scope">
							{{scope.row.discounttotal}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="type"
						:formatter="orderStatusFormatter"
					label="支付类型">
					</el-table-column>
					<el-table-column :sortable='false'
						prop="status"
					label="状态">
						<template slot-scope="scope">
							{{scope.row.status}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="address"
					label="地址">
						<template slot-scope="scope">
							{{scope.row.address}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="tel"
					label="电话">
						<template slot-scope="scope">
							{{scope.row.tel}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="consignee"
					label="收货人">
						<template slot-scope="scope">
							{{scope.row.consignee}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="remark"
					label="备注">
						<template slot-scope="scope">
							{{scope.row.remark}}
						</template>
					</el-table-column>
					<el-table-column :sortable='false'
						prop="goodtype"
					label="商品类型">
						<template slot-scope="scope">
							{{scope.row.goodtype}}
						</template>
					</el-table-column>
					<el-table-column prop="tel" label="下单时间">
						<template slot-scope="scope">
							{{scope.row.addtime}}
						</template>
					</el-table-column>
					<el-table-column width="300" label="操作">
						<template slot-scope="scope">
							<el-button size="mini" type="text" @click="addOrUpdateHandler(scope.row.id,'info')">详情</el-button>
							<el-button size="mini" type="text" @click="addOrUpdateHandler(scope.row.id)">修改</el-button>

							<el-button size="mini" type="text" @click="logisticsUpdate(scope.row.id)">物流</el-button>

							<el-button size="mini" type="text" @click="updateHandler(scope.row)">发货</el-button>

							<el-button size="mini" type="text" @click="updateHandler2(scope.row)">确认收货</el-button>




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





		<el-dialog
		  title="日销量"
		  :visible.sync="dayNumberChartVisiable"
		  width="800">
			<div id="dayNumberChart" style="width:100%;height:600px;"></div>
		  <span slot="footer" class="dialog-footer">
			<el-button @click="dayNumberChartDialog">返回</el-button>
		  </span>
		</el-dialog>

		<el-dialog
		  title="月销量"
		  :visible.sync="monthNumberChartVisiable"
		  width="800">
			<div id="monthNumberChart" style="width:100%;height:600px;"></div>
		  <span slot="footer" class="dialog-footer">
			<el-button @click="monthNumberChartDialog">返回</el-button>
		  </span>
		</el-dialog>

		<el-dialog
		  title="年销量"
		  :visible.sync="yearNumberChartVisiable"
		  width="800">
			<div id="yearNumberChart" style="width:100%;height:600px;"></div>
		  <span slot="footer" class="dialog-footer">
			<el-button @click="yearNumberChartDialog">返回</el-button>
		  </span>
		</el-dialog>

		<el-dialog
		  title="商品销量"
		  :visible.sync="goodnameNumberChartVisiable"
		  width="800">
			<div id="goodnameNumberChart" style="width:100%;height:600px;"></div>
		  <span slot="footer" class="dialog-footer">
			<el-button @click="goodnameNumberChartDialog">返回</el-button>
		  </span>
		</el-dialog>

		<el-dialog
		  title="类型销量"
		  :visible.sync="goodtypeNumberChartVisiable"
		  width="800">
			<div id="goodtypeNumberChart" style="width:100%;height:600px;"></div>
		  <span slot="footer" class="dialog-footer">
			<el-button @click="goodtypeNumberChartDialog">返回</el-button>
		  </span>
		</el-dialog>

		<el-dialog
		  title="日销额"
		  :visible.sync="dayAmountChartVisiable"
		  width="800">
			<div id="dayAmountChart" style="width:100%;height:600px;"></div>
		  <span slot="footer" class="dialog-footer">
			<el-button @click="dayAmountChartDialog">返回</el-button>
		  </span>
		</el-dialog>

		<el-dialog
		  title="月销额"
		  :visible.sync="monthAmountChartVisiable"
		  width="800">
			<div id="monthAmountChart" style="width:100%;height:600px;"></div>
		  <span slot="footer" class="dialog-footer">
			<el-button @click="monthAmountChartDialog">返回</el-button>
		  </span>
		</el-dialog>

		<el-dialog
		  title="年销额"
		  :visible.sync="yearAmountChartVisiable"
		  width="800">
			<div id="yearAmountChart" style="width:100%;height:600px;"></div>
		  <span slot="footer" class="dialog-footer">
			<el-button @click="yearAmountChartDialog">返回</el-button>
		  </span>
		</el-dialog>

		<el-dialog
		  title="商品销额"
		  :visible.sync="goodnameAmountChartVisiable"
		  width="800">
			<div id="goodnameAmountChart" style="width:100%;height:600px;"></div>
		  <span slot="footer" class="dialog-footer">
			<el-button @click="goodnameAmountChartDialog">返回</el-button>
		  </span>
		</el-dialog>

		<el-dialog
		  title="类型销额"
		  :visible.sync="goodtypeAmountChartVisiable"
		  width="800">
			<div id="goodtypeAmountChart" style="width:100%;height:600px;"></div>
		  <span slot="footer" class="dialog-footer">
			<el-button @click="goodtypeAmountChartDialog">返回</el-button>
		  </span>
		</el-dialog>
	</div>
</template>

<script>
import * as echarts from 'echarts'
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
      dayNumberChartVisiable: false,
      monthNumberChartVisiable: false,
      yearNumberChartVisiable: false,
      goodnameNumberChartVisiable: false,
      goodtypeNumberChartVisiable: false,
      dayAmountChartVisiable: false,
      monthAmountChartVisiable: false,
      yearAmountChartVisiable: false,
      goodnameAmountChartVisiable: false,
      goodtypeAmountChartVisiable: false,
      addOrUpdateFlag:false,
      layouts: ["total","prev","pager","next","sizes","jumper"],
      orderStatus: this.$route.params.status,
//导出excel
      json_fields: {
      "订单编号": "orderid",    //常规字段
      "商品表名": "tablename",    //常规字段
      "用户id": "userid",    //常规字段
      "商品id": "goodid",    //常规字段
      "商品名称": "goodname",    //常规字段
      "商品图片": "picture",    //常规字段
      "购买数量": "buynumber",    //常规字段
      "价格": "price",    //常规字段
      "折扣价格": "discountprice",    //常规字段
      "总价格": "total",    //常规字段
      "折扣总价格": "discounttotal",    //常规字段
      "支付类型": "type",    //常规字段
      "状态": "status",    //常规字段
      "地址": "address",    //常规字段
      "电话": "tel",    //常规字段
      "收货人": "consignee",    //常规字段
      "备注": "remark",    //常规字段
      "物流": "logistics",    //常规字段
      "商品类型": "goodtype",    //常规字段
      },
      json_meta: [
        [
          {
            " key ": " charset ",
            " value ": " utf- 8 "
          }
        ]
      ]

    };
  },
  created() {
    this.init();
    this.getDataList();
    this.contentStyleChange()
  },
  mounted() {
  },
//监听订单表参数是否变化，从而调取接口
  watch: {
  '$route' (to, from) { //监听路由是否变化
    if(this.$route.params.status){//判断状态是否有值
      //调数据
        this.orderStatus=this.$route.params.status;
        this.getDataList();
        this.contentStyleChange()
    }
  }
  },
  filters: {
    htmlfilter: function (val) {
      return val.replace(/<[^>]*>/g).replace(/undefined/g,'');
    }
  },
  components: {
    AddOrUpdate,
  },
  methods: {

    orderStatusFormatter: function(row, column) {
      var temp = ''
      // 处理逻辑 保存接口 数据，进行匹配 name
      switch (row.type-0) {
        case 1:
          temp = '现金'
          break
        case 2:
          temp = '积分'
          break
        case 3:
          temp = '拼团'
          break
      }
      return temp
    },
    updateHandler(row) {
      this.$confirm(`确定进行发货操作?`, "提示", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning"
      }).then(() => {
        row.status = "已发货";
        this.$http({
          url: `orders/update`,
          method: "post",
          data: row
        }).then(({ data }) => {
          if (data && data.code === 0) {
            this.$message({
              message: "操作成功",
              type: "success",
              duration: 1500,
              onClose: () => {
                this.search();
              }
            });
          } else {
             this.$message.error(data.msg);
          }
        });
      });
    },
    updateHandler2(row) {
      this.$confirm(`确定已收货?`, "提示", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning"
      }).then(() => {
        row.status = "已完成";
        this.$http({
          url: `orders/update`,
          method: "post",
          data: row
        }).then(({ data }) => {
          if (data && data.code === 0) {
            this.$message({
              message: "操作成功",
              type: "success",
              duration: 1500,
              onClose: () => {
                this.search();
              }
            });
          } else {
            this.$message.error(data.msg);
          }
        });
      });
    },
    //物流
    logisticsUpdate(id,type) {
      this.showFlag = false;
      this.addOrUpdateFlag = true;
      this.crossAddOrUpdateFlag = false;
      if(type!='info'){
        type = 'logistics';
      }
      this.$nextTick(() => {
        this.$refs.addOrUpdate.init(id,type);
      });
    },
    contentStyleChange() {
      this.contentPageStyleChange()
    },
    // 分页
    contentPageStyleChange(){
      let arr = []

      // if(this.contents.pageTotal) arr.push('total')
      // if(this.contents.pageSizes) arr.push('sizes')
      // if(this.contents.pagePrevNext){
      //   arr.push('prev')
      //   if(this.contents.pagePager) arr.push('pager')
      //   arr.push('next')
      // }
      // if(this.contents.pageJumper) arr.push('jumper')
      // this.layouts = arr.join()
      // this.contents.pageEachNum = 10
    },

    dayNumberChartDialog() {
      this.dayNumberChartVisiable = !this.dayNumberChartVisiable;
      this.$nextTick(()=>{
        var dayNumberChart = echarts.init(document.getElementById("dayNumberChart"),'macarons');
        this.$http({
            url: `orders/value/addtime/buynumber/日`,
            method: "get"
        }).then(({ data }) => {
            if (data && data.code === 0) {
                let res = data.data;
                let xAxis = [];
                let yAxis = [];
                let pArray = []
                for(let i=0;i<res.length;i++){
                    xAxis.push(res[i].addtime);
                    yAxis.push(parseFloat(res[i].total));
                    pArray.push({
                    value: parseFloat((res[i].total)),
                    name: res[i].addtime
                    })
                    var option = {};
                    option = {
                        tooltip: {
                          trigger: 'item',
                          formatter: '{b} : {c}'
                        },
                        title: {
                            text: '日销量',
                            left: 'center'
                        },
                        xAxis: {
                            type: 'category',
                            data: xAxis
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [{
                            data: yAxis,
                            type: 'bar'
                        }]
                    };
                    // 使用刚指定的配置项和数据显示图表。
                    dayNumberChart.setOption(option);
                    //根据窗口的大小变动图表
                    window.onresize = function() {
                        dayNumberChart.resize();
                    };
                }
            }
        });
      })
    },

    monthNumberChartDialog() {
      this.monthNumberChartVisiable = !this.monthNumberChartVisiable;
      this.$nextTick(()=>{
        var monthNumberChart = echarts.init(document.getElementById("monthNumberChart"),'macarons');
        this.$http({
            url: `orders/value/addtime/buynumber/月`,
            method: "get"
        }).then(({ data }) => {
            if (data && data.code === 0) {
                let res = data.data;
                let xAxis = [];
                let yAxis = [];
                let pArray = []
                for(let i=0;i<res.length;i++){
                    xAxis.push(res[i].addtime);
                    yAxis.push(parseFloat(res[i].total));
                    pArray.push({
                    value: parseFloat((res[i].total)),
                    name: res[i].addtime
                    })
                    var option = {};
                    option = {
                        tooltip: {
                          trigger: 'item',
                          formatter: '{b} : {c}'
                        },
                        title: {
                            text: '月销量',
                            left: 'center'
                        },
                        xAxis: {
                            type: 'category',
                            data: xAxis
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [{
                            data: yAxis,
                            type: 'bar'
                        }]
                    };
                    // 使用刚指定的配置项和数据显示图表。
                    monthNumberChart.setOption(option);
                    //根据窗口的大小变动图表
                    window.onresize = function() {
                        monthNumberChart.resize();
                    };
                }
            }
        });
      })
    },

    yearNumberChartDialog() {
      this.yearNumberChartVisiable = !this.yearNumberChartVisiable;
      this.$nextTick(()=>{
        var yearNumberChart = echarts.init(document.getElementById("yearNumberChart"),'macarons');
        this.$http({
            url: `orders/value/addtime/buynumber/年`,
            method: "get"
        }).then(({ data }) => {
            if (data && data.code === 0) {
                let res = data.data;
                let xAxis = [];
                let yAxis = [];
                let pArray = []
                for(let i=0;i<res.length;i++){
                    xAxis.push(res[i].addtime);
                    yAxis.push(parseFloat(res[i].total));
                    pArray.push({
                    value: parseFloat((res[i].total)),
                    name: res[i].addtime
                    })
                    var option = {};
                    option = {
                        tooltip: {
                          trigger: 'item',
                          formatter: '{b} : {c}'
                        },
                        title: {
                            text: '年销量',
                            left: 'center'
                        },
                        xAxis: {
                            type: 'category',
                            data: xAxis
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [{
                            data: yAxis,
                            type: 'bar'
                        }]
                    };
                    // 使用刚指定的配置项和数据显示图表。
                    yearNumberChart.setOption(option);
                    //根据窗口的大小变动图表
                    window.onresize = function() {
                        yearNumberChart.resize();
                    };
                }
            }
        });
      })
    },

    goodnameNumberChartDialog() {
      this.goodnameNumberChartVisiable = !this.goodnameNumberChartVisiable;
      this.$nextTick(()=>{
        var goodnameNumberChart = echarts.init(document.getElementById("goodnameNumberChart"),'macarons');
        this.$http({
            url: `orders/value/goodname/buynumber`,
            method: "get"
        }).then(({ data }) => {
            if (data && data.code === 0) {
                let res = data.data;
                let xAxis = [];
                let yAxis = [];
                let pArray = []
                for(let i=0;i<res.length;i++){
                    xAxis.push(res[i].goodname);
                    yAxis.push(parseFloat(res[i].total));
                    pArray.push({
                    value: parseFloat((res[i].total)),
                    name: res[i].goodname
                    })
                    var option = {};
                    option = {
                        tooltip: {
                          trigger: 'item',
                          formatter: '{b} : {c}'
                        },
                        title: {
                            text: '商品销量',
                            left: 'center'
                        },
                        xAxis: {
                            type: 'category',
                            data: xAxis
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [{
                            data: yAxis,
                            type: 'bar'
                        }]
                    };
                    // 使用刚指定的配置项和数据显示图表。
                    goodnameNumberChart.setOption(option);
                    //根据窗口的大小变动图表
                    window.onresize = function() {
                        goodnameNumberChart.resize();
                    };
                }
            }
        });
      })
    },

    goodtypeNumberChartDialog() {
      this.goodtypeNumberChartVisiable = !this.goodtypeNumberChartVisiable;
      this.$nextTick(()=>{
        var goodtypeNumberChart = echarts.init(document.getElementById("goodtypeNumberChart"),'macarons');
        this.$http({
            url: `orders/value/goodtype/buynumber`,
            method: "get"
        }).then(({ data }) => {
            if (data && data.code === 0) {
                let res = data.data;
                let xAxis = [];
                let yAxis = [];
                let pArray = []
                for(let i=0;i<res.length;i++){
                    xAxis.push(res[i].goodtype);
                    yAxis.push(parseFloat(res[i].total));
                    pArray.push({
                    value: parseFloat((res[i].total)),
                    name: res[i].goodtype
                    })
                    var option = {};
                    option = {
                        tooltip: {
                          trigger: 'item',
                          formatter: '{b} : {c}'
                        },
                        title: {
                            text: '类型销量',
                            left: 'center'
                        },
                        xAxis: {
                            type: 'category',
                            data: xAxis
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [{
                            data: yAxis,
                            type: 'bar'
                        }]
                    };
                    // 使用刚指定的配置项和数据显示图表。
                    goodtypeNumberChart.setOption(option);
                    //根据窗口的大小变动图表
                    window.onresize = function() {
                        goodtypeNumberChart.resize();
                    };
                }
            }
        });
      })
    },

    dayAmountChartDialog() {
      this.dayAmountChartVisiable = !this.dayAmountChartVisiable;
      this.$nextTick(()=>{
        var dayAmountChart = echarts.init(document.getElementById("dayAmountChart"),'macarons');
        this.$http({
            url: `orders/value/addtime/total/日`,
            method: "get"
        }).then(({ data }) => {
            if (data && data.code === 0) {
                let res = data.data;
                let xAxis = [];
                let yAxis = [];
                let pArray = []
                for(let i=0;i<res.length;i++){
                    xAxis.push(res[i].addtime);
                    yAxis.push(parseFloat((res[i].total)).toFixed(2));
                    pArray.push({
                    value: parseFloat((res[i].total)),
                    name: res[i].addtime
                    })
                    var option = {};
                    option = {
                        tooltip: {
                          trigger: 'item',
                          formatter: '{b} : {c}'
                        },
                        title: {
                            text: '日销额',
                            left: 'center'
                        },
                        xAxis: {
                            type: 'category',
                            data: xAxis
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [{
                            data: yAxis,
                            type: 'bar'
                        }]
                    };
                    // 使用刚指定的配置项和数据显示图表。
                    dayAmountChart.setOption(option);
                    //根据窗口的大小变动图表
                    window.onresize = function() {
                        dayAmountChart.resize();
                    };
                }
            }
        });
      })
    },

    monthAmountChartDialog() {
      this.monthAmountChartVisiable = !this.monthAmountChartVisiable;
      this.$nextTick(()=>{
        var monthAmountChart = echarts.init(document.getElementById("monthAmountChart"),'macarons');
        this.$http({
            url: `orders/value/addtime/total/月`,
            method: "get"
        }).then(({ data }) => {
            if (data && data.code === 0) {
                let res = data.data;
                let xAxis = [];
                let yAxis = [];
                let pArray = []
                for(let i=0;i<res.length;i++){
                    xAxis.push(res[i].addtime);
                    yAxis.push(parseFloat((res[i].total)).toFixed(2));
                    pArray.push({
                    value: parseFloat((res[i].total)),
                    name: res[i].addtime
                    })
                    var option = {};
                    option = {
                        tooltip: {
                          trigger: 'item',
                          formatter: '{b} : {c}'
                        },
                        title: {
                            text: '月销额',
                            left: 'center'
                        },
                        xAxis: {
                            type: 'category',
                            data: xAxis
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [{
                            data: yAxis,
                            type: 'bar'
                        }]
                    };
                    // 使用刚指定的配置项和数据显示图表。
                    monthAmountChart.setOption(option);
                    //根据窗口的大小变动图表
                    window.onresize = function() {
                        monthAmountChart.resize();
                    };
                }
            }
        });
      })
    },

    yearAmountChartDialog() {
      this.yearAmountChartVisiable = !this.yearAmountChartVisiable;
      this.$nextTick(()=>{
        var yearAmountChart = echarts.init(document.getElementById("yearAmountChart"),'macarons');
        this.$http({
            url: `orders/value/addtime/total/年`,
            method: "get"
        }).then(({ data }) => {
            if (data && data.code === 0) {
                let res = data.data;
                let xAxis = [];
                let yAxis = [];
                let pArray = []
                for(let i=0;i<res.length;i++){
                    xAxis.push(res[i].addtime);
                    yAxis.push(parseFloat((res[i].total)).toFixed(2));
                    pArray.push({
                    value: parseFloat((res[i].total)),
                    name: res[i].addtime
                    })
                    var option = {};
                    option = {
                        tooltip: {
                          trigger: 'item',
                          formatter: '{b} : {c}'
                        },
                        title: {
                            text: '年销额',
                            left: 'center'
                        },
                        xAxis: {
                            type: 'category',
                            data: xAxis
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [{
                            data: yAxis,
                            type: 'bar'
                        }]
                    };
                    // 使用刚指定的配置项和数据显示图表。
                    yearAmountChart.setOption(option);
                    //根据窗口的大小变动图表
                    window.onresize = function() {
                        yearAmountChart.resize();
                    };
                }
            }
        });
      })
    },

    goodnameAmountChartDialog() {
      this.goodnameAmountChartVisiable = !this.goodnameAmountChartVisiable;
      this.$nextTick(()=>{
        var goodnameAmountChart = echarts.init(document.getElementById("goodnameAmountChart"),'macarons');
        this.$http({
            url: `orders/value/goodname/total`,
            method: "get"
        }).then(({ data }) => {
            if (data && data.code === 0) {
                let res = data.data;
                let xAxis = [];
                let yAxis = [];
                let pArray = []
                for(let i=0;i<res.length;i++){
                    xAxis.push(res[i].goodname);
                    yAxis.push(parseFloat((res[i].total)).toFixed(2));
                    pArray.push({
                    value: parseFloat((res[i].total)),
                    name: res[i].goodname
                    })
                    var option = {};
                    option = {
                        tooltip: {
                          trigger: 'item',
                          formatter: '{b} : {c}'
                        },
                        title: {
                            text: '商品销额',
                            left: 'center'
                        },
                        xAxis: {
                            type: 'category',
                            data: xAxis
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [{
                            data: yAxis,
                            type: 'bar'
                        }]
                    };
                    // 使用刚指定的配置项和数据显示图表。
                    goodnameAmountChart.setOption(option);
                    //根据窗口的大小变动图表
                    window.onresize = function() {
                        goodnameAmountChart.resize();
                    };
                }
            }
        });
      })
    },

    goodtypeAmountChartDialog() {
      this.goodtypeAmountChartVisiable = !this.goodtypeAmountChartVisiable;
      this.$nextTick(()=>{
        var goodtypeAmountChart = echarts.init(document.getElementById("goodtypeAmountChart"),'macarons');
        this.$http({
            url: `orders/value/goodtype/total`,
            method: "get"
        }).then(({ data }) => {
            if (data && data.code === 0) {
                let res = data.data;
                let xAxis = [];
                let yAxis = [];
                let pArray = []
                for(let i=0;i<res.length;i++){
                    xAxis.push(res[i].goodtype);
                    yAxis.push(parseFloat((res[i].total)).toFixed(2));
                    pArray.push({
                    value: parseFloat((res[i].total)),
                    name: res[i].goodtype
                    })
                    var option = {};
                    option = {
                        tooltip: {
                          trigger: 'item',
                          formatter: '{b} : {c}'
                        },
                        title: {
                            text: '类型销额',
                            left: 'center'
                        },
                        xAxis: {
                            type: 'category',
                            data: xAxis
                        },
                        yAxis: {
                            type: 'value'
                        },
                        series: [{
                            data: yAxis,
                            type: 'bar'
                        }]
                    };
                    // 使用刚指定的配置项和数据显示图表。
                    goodtypeAmountChart.setOption(option);
                    //根据窗口的大小变动图表
                    window.onresize = function() {
                        goodtypeAmountChart.resize();
                    };
                }
            }
        });
      })
    },







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
        status: this.$route.params.status,
      }
           if(this.searchForm.orderid!='' && this.searchForm.orderid!=undefined){
            params['orderid'] = '%' + this.searchForm.orderid + '%'
          }
           if(this.searchForm.goodname!='' && this.searchForm.goodname!=undefined){
            params['goodname'] = '%' + this.searchForm.goodname + '%'
          }
      this.$http({
        url: "orders/page",
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
      }
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
          url: "orders/delete",
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
              }
            });
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
.export-excel-wrapper { display: inline-block; }
.main-content { padding: 20px 24px; background: #FFF8F0; min-height: 100%; }
.search-bar { background: #fff; border-radius: 6px; padding: 16px 20px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.search-item { display: flex; align-items: center; gap: 8px; }
.search-item label { font-size: 13px; color: #606266; white-space: nowrap; }
.action-bar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.data-table { border-radius: 6px; overflow: hidden; }
.el-pagination { padding: 16px 0; }
::v-deep .el-table th { background: #FAFAFA !important; color: #606266; font-weight: 600; font-size: 13px; }
::v-deep .el-table td { color: #606266; font-size: 13px; }
::v-deep .el-table .el-table__row:hover > td { background: #FFF8F0 !important; }
::v-deep .el-table .el-button--text { padding: 0 6px; font-size: 13px; }
.danger-text { color: #F56C6C; }
.danger-text:hover { color: #f78989; }
::v-deep .el-table .el-button--text { padding: 0 4px; margin: 0 2px; font-size: 13px; }
</style></style>
