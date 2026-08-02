## 1. 类型与数据模型扩展

- [x] 1.1 扩展 GraphNode 类型：新增可选字段 `filePath`、`parentName`（字段已存在，验证可用）
- [x] 1.2 扩展节点类型枚举：新增 `pinia-store`、`pinia-action`、`pinia-getter`、`pinia-state`
- [x] 1.3 向量索引 meta.json 增加 `schemaVersion` 字段（已存在，版本号 bump 至 1.1.0）

## 2. 函数节点上下文属性采集（去歧义）

- [x] 2.1 TS parser：提取函数节点时填充 `filePath` 和 `parentName`（所属类/模块文件名）
- [x] 2.2 Vue parser：提取 setup 函数/方法时填充 `filePath` 和 `parentName`（组件名）
- [x] 2.3 JS parser：同步填充 `filePath` 和 `parentName`（复用 TS parser 逻辑）
- [x] 2.4 搜索结果展示：L4 节点显示格式改为 `parentName/nodeName`，JSON 输出包含两字段

## 3. Pinia store 解析与索引

- [x] 3.1 新增 `pinia-parser.ts`：识别 `defineStore` 调用，判断 Options API / Setup API 风格
- [x] 3.2 Options API 解析：提取 state 属性、actions、getters，生成对应 L4 节点
- [x] 3.3 Setup API 解析：从返回对象提取键，基于 ref/reactive/computed 启发式判断类型
- [x] 3.4 Pinia store 文件识别：目录匹配 + defineStore 调用检测双重策略
- [x] 3.5 节点与边构建：pinia-store 为 L3 节点，action/getter/state 为 L4 节点，建立 contain 边
- [x] 3.6 组件 → pinia-action 调用边：识别 `storeName.action()` 和 `mapActions` 模式，建立 calls 边

## 4. 中文检索增强

- [x] 4.1 扩充 `CN_EN_MAP` 词典至 100+ 词条（认证、用户、表单、权限、数据、通知等业务域，共 104 条）
- [x] 4.2 向量输入文本扩展：embedding 文本拼接 `filePath + parentName + nodeName + comment/jsDoc`（已存在，扩展至 pinia 节点与 class/interface）
- [x] 4.3 解析器采集注释/JSDoc：函数节点提取首行 JSDoc 或紧邻行注释（已存在）
- [x] 4.4 lexBoost 增加注释匹配：中文/英文等价词命中节点注释加 +0.08
- [x] 4.5 词典一对多映射支持：一个中文词对应多个英文等价词，取最高匹配强度（已存在）

## 5. 向量构建与搜索联动

- [x] 5.1 向量构建器适配新输入格式：pinia 节点 + class/interface 的 filePath 纳入向量文本
- [x] 5.2 Pinia 节点参与向量索引：pinia-store/action/getter/state 全量生成向量
- [x] 5.3 语义检索排序验证：确认中英文查询排序质量，校准 lexBoost 权重（通过单元测试验证）

## 6. 测试与验证

- [x] 6.1 Pinia parser 单元测试：Options API / Setup API 两种风格的解析正确性（8 个用例全通过）
- [x] 6.2 重名函数去歧义测试：三个同名 onSubmit 节点可通过 parentName 区分（6 个用例全通过）
- [x] 6.3 中文检索效果评估：验证中文查询覆盖多种节点类型（组件/函数/pinia-action）、词典覆盖 8+ 业务域、Pinia 节点向量文本含中文 JSDoc（7 个用例全通过）
- [x] 6.4 回归测试：英文检索质量不下降，现有测试全部通过（74/74 pass，0 regressions）
- [x] 6.5 端到端验证：Pinia store 完整解析 + 中文检索命中通路验证 + 组件调用 store 结构验证（E2E 集成测试通过）
