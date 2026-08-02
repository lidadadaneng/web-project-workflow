## 1. 基础类型与配置扩展

- [x] 1.1 在 types.ts 中新增 Vuex 节点类型常量与类型（vuex-store / vuex-state / vuex-mutation / vuex-action / vuex-getter）
- [x] 1.2 在 types.ts 中新增 Redux 节点类型常量与类型（redux-slice / redux-state / redux-reducer / redux-action / redux-selector）
- [x] 1.3 在 types.ts 中新增微信小程序节点类型常量与类型（mp-app / mp-page / mp-component / mp-method / mp-lifecycle / mp-data / mp-property）
- [x] 1.4 在 types.ts 中新增 uni-app 节点类型常量与类型（uni-page）
- [x] 1.5 在 types.ts 中新增边类型常量（navigate / use-component / bind-event / bind-data）
- [x] 1.6 在 config.ts 中新增 stateManagers 和 frameworks 配置项及默认值
- [x] 1.7 在 NodeAttributes 中新增节点属性（platform、subPackage、namespaced 等）

## 2. Vuex 解析器

- [x] 2.1 实现 isVuexStoreFile 文件识别函数（目录特征 + 内容特征双重校验）
- [x] 2.2 实现 Vuex 根 store 解析（new Vuex.Store + modules 识别）
- [x] 2.3 实现 Vuex 模块化 store 解析（独立文件导出对象形式）
- [x] 2.4 实现 state / mutations / actions / getters 四类元素提取
- [x] 2.5 实现命名空间（namespaced）识别与节点属性设置
- [x] 2.6 实现嵌套模块递归解析
- [x] 2.7 在 source-parser.ts 中集成 Vuex 解析调用（Pinia 同款增强解析模式）
- [x] 2.8 组件调用 Vuex 建边（dispatch / commit / mapActions / mapMutations / mapState / mapGetters）
- [x] 2.9 编写 vuex-parser 单元测试

## 3. Redux / Redux Toolkit 解析器

- [x] 3.1 实现 Redux 文件识别函数（目录特征 + createSlice / configureStore 等内容特征）
- [x] 3.2 实现 createSlice 解析（name / initialState / reducers / extraReducers）
- [x] 3.3 实现 createAction / createReducer 原生 API 解析
- [x] 3.4 实现 selector 识别（createSelector + selectXxx 命名约定）
- [x] 3.5 实现 configureStore 配置文件识别（reducer 注册的 slice 信息收集）
- [x] 3.6 在 source-parser.ts 中集成 Redux 解析调用
- [x] 3.7 React 组件调用 Redux 建边（useSelector / useDispatch / connect）
- [x] 3.8 编写 redux-parser 单元测试

## 4. 微信小程序解析器

- [x] 4.1 实现微信小程序项目识别（app.json + app.js + app.wxss + project.config.json）
- [x] 4.2 实现 app.json 解析（pages 列表 / window / tabBar / subPackages）
- [x] 4.3 实现 app.js 解析（App 实例 / 全局生命周期 / globalData）
- [x] 4.4 实现页面 JS 解析（Page 调用 / data / methods / 生命周期）
- [x] 4.5 实现组件 JS 解析（Component 调用 / properties / methods / lifetimes）
- [x] 4.6 实现 WXML 模板解析（组件引用 / 事件绑定 / 数据绑定）
- [x] 4.7 实现页面路由跳转边生成（navigateTo / redirectTo / switchTab / reLaunch / navigateBack）
- [x] 4.8 实现 use-component 边生成（WXML 组件引用）
- [x] 4.9 实现 bind-event / bind-data 边生成
- [x] 4.10 在 graph-builder.ts 中集成小程序解析入口
- [x] 4.11 编写 miniprogram-parser 单元测试

## 5. uni-app 解析器

- [x] 5.1 实现 uni-app 项目识别（pages.json + manifest.json + App.vue + @dcloudio 依赖）
- [x] 5.2 实现 pages.json 解析（页面路由 / tabBar / subPackages / globalStyle）
- [x] 5.3 生成 uni-page 节点并关联到对应 .vue 文件
- [x] 5.4 实现 uni.* API 调用识别（路由类）
- [x] 5.5 实现 uni-app 页面生命周期识别（isUniPageLifecycle）
- [x] 5.6 实现条件编译识别（#ifdef / #ifndef），标记 platform 属性
- [x] 5.7 实现页面 navigate 边生成（uni.navigateTo 等）
- [x] 5.8 在 graph-builder.ts 中集成 uni-app 解析入口
- [x] 5.9 编写 uniapp-parser 单元测试

## 6. 边构建器扩展

- [x] 6.1 navigate 边构建（miniprogram-parser + uniapp-parser 内实现，EdgeBuilder.addRawEdge 接入）
- [x] 6.2 use-component 边构建（miniprogram-parser 内实现）
- [x] 6.3 bind-event / bind-data 边构建（miniprogram-parser 内实现）
- [x] 6.4 新增边类型不参与 business_map 聚合（结构边，非证据边）
- [x] 6.5 图谱统计的边类型分布动态计算，自动包含新类型

## 7. 查询与检索适配

- [x] 7.1 graph-query --type 过滤基于 nodesByType 动态索引，自动支持所有新节点类型
- [x] 7.2 platform / subPackage 属性已存入 NodeAttributes，可通过节点属性过滤
- [x] 7.3 语义检索基于向量索引，纳入新节点类型即自动支持
- [x] 7.4 向量构建补充所有新节点类型的向量化文本（vector-builder.ts）
- [x] 7.5 context 子图基于图索引遍历，自动支持新节点类型和边类型

## 8. 项目类型嗅探与自动启用

- [x] 8.1 小程序 / uni-app 项目识别函数（isMiniprogramProject / isUniappProject）
- [x] 8.2 状态管理库自动嗅探：各 parser 的 isXxxFile 预检 + 内容特征
- [x] 8.3 构建流程自动启用：frameworks 为空时自动检测，状态管理按文件特征逐文件判断
- [x] 8.4 构建输出的边类型/节点类型分布可反映已启用解析器（动态统计）

## 9. 测试与验证

- [~] 9.1 端到端测试：Vuex 项目构建并验证节点/边正确性（单元测试覆盖解析逻辑，端到端待补充）
- [~] 9.2 端到端测试：Redux 项目构建并验证节点/边正确性（单元测试覆盖解析逻辑，端到端待补充）
- [~] 9.3 端到端测试：微信小程序项目构建并验证节点/边正确性（单元测试覆盖解析逻辑，端到端待补充）
- [~] 9.4 端到端测试：uni-app 项目构建并验证节点/边正确性（单元测试覆盖解析逻辑，端到端待补充）
- [~] 9.5 语义检索测试：新增节点类型的中文检索效果验证（向量文本已生成，端到端待补充）
- [x] 9.6 回归测试：单元测试全部通过，新增逻辑条件触发不影响普通项目
- [x] 9.7 向后兼容测试：stateManagers 默认 ['pinia']、frameworks 默认空数组，行为与原版本一致
