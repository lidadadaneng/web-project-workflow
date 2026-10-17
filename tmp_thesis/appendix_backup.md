# 附录

## 附录 A 系统功能测试记录

本附录依次收录第 6 章三个层面验证的原始记录：系统功能测试、典型开发任务运行、上下文获取对比与实验环境冻结记录。正文只报告汇总结果，题目、逐次运行数据和冻结记录集中放在这里，便于复核。各表中的数值与第 6 章正文保持一致。逐次运行的完整记录（会话标识、读取轨迹、命令原始输出）另存为机器可读的实验数据目录（仓库的 `tmp_ch6/` 目录，不随论文提交），附录只列出可核对的结果与依据。

附录 A 与附录 C 的执行时间取自各用例的墙钟耗时，包含进程启动与文件读写；FT-03 与 FT-07 的耗时以图谱构建和向量索引重建为主，明显高于其余用例。附录 B 的执行耗时为任务运行的净时间，人工确认等待单列。

表A-1 逐条记录 12 个功能测试用例的操作与证据。用例编号与第 6 章一致，判定依据是命令输出和持久化文件，不以智能体的自述结论为准。

表A-1 WPW 系统功能测试详细记录

Table A-1 Detailed Records of the WPW System Functional Tests

| 编号 | 操作命令或步骤 | 命令输出摘要 | 持久化证据与位置 | 执行时间 | 结论 |
|---|---|---|---|---|---|
| FT-01 | `wpw new ft01`；`wpw done brd -c ft01`；`wpw done prd -c ft01` | `new` 生成 `.wpw.yaml` 与需求目录；`done brd` 后 `status.brd=done`；`done prd` 后 `status.prd=done` | `wpw/active/ft01/.wpw.yaml`（`brd`、`prd` 字段）、`wpw/active/ft01/.wpw-events.jsonl` | 1 s | 通过 |
| FT-02 | `brd`、`prd` 均未完成时执行 `wpw check design -c ft02`；补齐两阶段后执行同一命令 | 首次被拒绝，提示缺失的前置阶段；补齐后同一命令通过 | 命令退出码与标准错误输出 | 1 s | 通过 |
| FT-03 | `wpw graph build --json --no-progress`；`wpw graph query --graph default --type class --limit 200 --json` | `build 成功=true`；`nodesByLevel={"C":25,"L1":12,"L2":393,"L3":1369}`；`edgesByType={"contain":1599,"import":535,"business_map":300}`；Java 类节点可查 | `ft-build/wpw/knowledge/graph/default/{graph.jsonl,meta.json}` | 198 s | 通过 |
| FT-04 | `wpw graph stat --graph default --json`；`wpw graph query --graph default --level C --json`（另起进程） | `meta.json` 记 1799 节点/2434 边，另起进程 `stat` 读到同一数值；C 层节点可读 20 个；向量索引与映射文件均存在 | `.../default/meta.json`、`.../default/index/{vector.index,vector-mapping.json}` | 1 s | 通过 |
| FT-05 | `wpw graph context "购物车 添加商品到购物车" --graph default --json` | 锚点 5 个（C 与 L3 两级），子图 28 节点/30 边，压缩文本 1832 字符，压缩比 25.06 | 命令 JSON 输出（`anchors`、`subgraph`、`stats`） | 1 s | 通过 |
| FT-06 | `wpw graph context --anchors mod:f026598ce176 --depth 2 --max-nodes 20 --json`，预算分别取不设、800、120 | 不设预算的宽松档 162 tokens；预算 800 时 20 节点/155 tokens；预算 120 时压缩档下探至 70 tokens，锚点保留 | 命令 JSON 输出（`stats.estimatedTokens`、`anchors`、`subgraph`） | 1 s | 通过 |
| FT-07 | 在 `CartController.java` 中新增一个公开方法；`wpw graph update --graph default --json`；`wpw graph stat --json` | `updated=true`；节点 1799→1800、边 2434→2435（各 +1）；无关类节点原样保留；图结构增量处理合计 263 ms，其中重建 80 ms（同次运行向量索引全量重建 184,589 ms） | `ft-inc/wpw/knowledge/graph/default/{graph.jsonl,meta.json}` | 189 s | 通过 |
| FT-08 | `wpw new ft08-archive`；`wpw graph stat --json` 取归档前基线；`wpw archive ft08-archive`；归档后再次 `wpw graph stat --json` | 需求工作区按月份归档落盘；图谱节点数 1799→1799 未变；归档过程未触发全量重建 | `ft-arch/wpw/archived/<YYYY-MM>/ft08-archive/`、归档前后的 `meta.json` 与 `stat` 输出 | 4 s | 通过 |
| FT-09 | 启动 `wpw viz --root ft-console --port 7821`，请求 `/api/changes`、`/api/changes/ft09-demo` 与首页 `/` | 看板读到需求 1 个；接口返回阶段 `{brd:done, prd:done, plan:done, apply:pending}` 与 `.wpw.yaml` 一致；任务进度 1/3；前端产物可托管 | `ft-console/wpw/active/ft09-demo/.wpw.yaml`；浏览器实测截图 `results/ft09-board.png` | 1 s | 通过 |
| FT-10 | 启动 `wpw viz --root ft-console --port 7822`，请求 `/api/graph/default/stat`、`/api/graph/default?limit=500`、`POST /api/context` | 图谱接口返回 500 节点/919 边；统计页 `{C:25,L1:12,L2:393,L3:1369}`、`business_map:300`；上下文演示页返回 5 个锚点与三档压缩（loose 32 节点/852 tokens、standard 32/483、extreme 32/277），无降级 | 浏览器实测截图 `results/ft10-graph.png`、`results/ft10-context.png` | 2 s | 通过 |
| FT-11 | 完成 `brd`、`prd` 后另起进程执行 `wpw status -c ft11 --json` | 读回 `status.brd=done`、`status.prd=done`，阶段未丢失 | `wpw/active/ft11/.wpw.yaml` | 1 s | 通过 |
| FT-12 | 删除 `default` 图谱的 `vector.index` 与 `vector-mapping.json`；`wpw graph context --anchors <id> --json`；`wpw graph search 购物车 --graph default` | 显式锚点路径仍生成上下文；语义检索路径提示「图谱 default 没有向量索引」 | 语义检索的标准错误输出、上下文命令的 JSON 输出 | 3 s | 通过 |

## 附录 B 典型开发任务运行记录

表B-1 列出三个开发任务在运行前确定的验收清单。清单确定后不再调整，两种方法使用同一份清单。

表B-1 开发任务验收清单

Table B-1 Acceptance Checklist for the Development Tasks

| 任务 | 验收项 | 判定方式 |
|---|---|---|
| T1 基础搭建 | 后端新增 `GET /cart/total` 接口，按当前登录用户返回购物车商品金额合计；前端购物车页面在底部展示该总价 | 在源码快照上检查四项：`CartController.java` 含 `/total` 路由、`CartService.java` 声明 `total`、`CartServiceImpl.java` 实现 `total`、`shop-cart.vue` 出现总价展示。四项全部满足才判为通过 |
| T2 业务核心 | 后端新增 `GET /meishixinxi/search` 接口，支持 `keyword`（按美食名称模糊匹配）与 `fenlei`（按美食分类精确匹配）两个可选查询参数 | 在源码快照上检查四项：`MeishixinxiController.java` 含 `/search` 路由、`MeishixinxiService.java` 声明 `search`、`MeishixinxiServiceImpl.java` 实现 `search`、服务实现同时处理 `keyword` 与 `fenlei`。四项全部满足才判为通过 |
| T3 迭代增强 | 用户端取消订单按新规则流转：未支付订单取消后状态为「已取消」；已支付订单不允许用户直接取消，须先走退款流程（状态为「退款中」） | 在源码快照上检查三项：`shop-order.vue` 出现「已取消」、后端出现「退款中」状态、后端对「已支付」订单的取消请求出现拦截类表述。三项全部满足才判为通过 |

表B-2 逐个运行记录 3 个任务、2 种方法、每种 2 次，共 12 次执行。失败或超时的运行同样保留在表中并注明原因，不用重跑结果替换。图谱初始化与规范准备的投入单独列明，不并入在线任务开销。

表B-2 开发任务运行记录

Table B-2 Run Records of the Development Tasks

| 任务 | 方法 | 运行 | 前置版本提交 | 验收是否通过 | 累计模型 Token | 执行耗时 | 人工确认等待 | 备注 |
|---|---|---|---|---|---|---|---|---|
| T1 基础搭建 | OpenSpec | 第 1 次 | `afca51b` | 通过 | 235,964 | 511 s | 0 | 改动 14 个文件，模型调用 46 次 |
| T1 基础搭建 | OpenSpec | 第 2 次 | `afca51b` | 通过 | 201,328 | 452 s | 0 | 改动 11 个文件，模型调用 52 次 |
| T1 基础搭建 | WPW | 第 1 次 | `afca51b` | 通过 | 209,658 | 444 s | 0 | 改动 15 个文件，模型调用 53 次 |
| T1 基础搭建 | WPW | 第 2 次 | `afca51b` | 通过 | 225,730 | 371 s | 0 | 改动 19 个文件，模型调用 60 次 |
| T2 业务核心 | OpenSpec | 第 1 次 | `afca51b` | 通过 | 59,384 | 69 s | 0 | 改动 6 个文件，模型调用 25 次 |
| T2 业务核心 | OpenSpec | 第 2 次 | `afca51b` | 通过 | 50,521 | 57 s | 0 | 改动 7 个文件，模型调用 18 次 |
| T2 业务核心 | WPW | 第 1 次 | `afca51b` | 通过 | 54,939 | 96 s | 0 | 改动 11 个文件，模型调用 37 次 |
| T2 业务核心 | WPW | 第 2 次 | `afca51b` | 通过 | 67,008 | 97 s | 0 | 改动 11 个文件，模型调用 35 次 |
| T3 迭代增强 | OpenSpec | 第 1 次 | `afca51b` | 通过 | 116,421 | 193 s | 0 | 改动 8 个文件，模型调用 47 次 |
| T3 迭代增强 | OpenSpec | 第 2 次 | `afca51b` | 通过 | 156,514 | 272 s | 0 | 改动 9 个文件，模型调用 60 次 |
| T3 迭代增强 | WPW | 第 1 次 | `afca51b` | 通过 | 131,974 | 219 s | 0 | 改动 15 个文件，模型调用 56 次 |
| T3 迭代增强 | WPW | 第 2 次 | `afca51b` | 通过 | 136,457 | 186 s | 0 | 改动 14 个文件，模型调用 59 次 |

表B-2 的十二次运行全部通过验收，没有失败或超时，因此表中不含以失败替换的记录。人工确认等待一列为 0：本组实验在两种方法下都按全自动方式运行，没有插入人工确认环节，需求描述与验收清单在运行前一次性交给智能体。「前置版本提交」一列记为快照提交的短号 `afca51b`，完整提交号见附录 D 表D-2。

需要说明一处执行过程中的调整。首次试跑没有通过验收：智能体把步数消耗在摸索命令用法上，未在步数用尽前落到代码改动。据此把单次运行的步数上限由 30 提到 60，并在两种方法各自的工作说明里补齐流程命令速查，然后重新运行了全部十二次。上表报告的是调整后的结果，通过率应放在这一前提下阅读。改动文件数由运行目录与前置快照逐文件比对得出，只统计源码与流程产物目录下的差异文件。

## 附录 C 上下文获取对比题集与结果

表C-1 给出 20 个代码定位问题的题集，其中功能定位问题与跨模块定位问题各 10 个。必要文件由人工在运行前根据源码和规范标注，每题不超过 5 个，标注结果不向被测条件开放。

表C-1 上下文获取对比题集

Table C-1 Question Set for the Context Retrieval Comparison

| 编号 | 类型 | 问题 | 必要文件（人工标注） | 标注人 | 标注日期 |
|---|---|---|---|---|---|
| Q01（QF-01） | 功能定位 | 前台用户登录时，后端在哪个文件中校验账号密码？生成登录 token 逻辑写在哪个文件？ | `src/main/java/com/controller/YonghuController.java`<br>`src/main/java/com/service/TokenService.java`<br>`src/main/java/com/service/impl/TokenServiceImpl.java`<br>`src/main/java/com/entity/TokenEntity.java` | 本文作者 | 2026-10-16 |
| Q02（QF-02） | 功能定位 | 管理员的登录接口与注册接口分别写在哪个控制器里？它注入的业务服务接口是哪个？ | `src/main/java/com/controller/UsersController.java`<br>`src/main/java/com/service/UsersService.java`<br>`src/main/java/com/service/impl/UsersServiceImpl.java` | 本文作者 | 2026-10-16 |
| Q03（QF-03） | 功能定位 | 删除一条购物车记录的接口写在哪个控制器？它把请求转给了哪个服务实现类？ | `src/main/java/com/controller/CartController.java`<br>`src/main/java/com/service/CartService.java`<br>`src/main/java/com/service/impl/CartServiceImpl.java` | 本文作者 | 2026-10-16 |
| Q04（QF-04） | 功能定位 | 商品收藏的保存接口写在哪个文件？收藏记录对应哪个实体类？ | `src/main/java/com/controller/StoreupController.java`<br>`src/main/java/com/entity/StoreupEntity.java`<br>`src/main/java/com/service/impl/StoreupServiceImpl.java` | 本文作者 | 2026-10-16 |
| Q05（QF-05） | 功能定位 | 文件上传接口实现在哪个文件？把上传文件转成字节数组的工具方法写在哪个文件？ | `src/main/java/com/controller/FileController.java`<br>`src/main/java/com/utils/FileUtil.java` | 本文作者 | 2026-10-16 |
| Q06（QF-06） | 功能定位 | 全局的登录鉴权拦截逻辑写在哪个文件？它从请求头的哪个字段取 token、又调用哪个服务去校验？ | `src/main/java/com/interceptor/AuthorizationInterceptor.java`<br>`src/main/java/com/service/impl/TokenServiceImpl.java` | 本文作者 | 2026-10-16 |
| Q07（QF-07） | 功能定位 | 鉴权拦截器是在哪个文件里注册到 Spring MVC 的？ | `src/main/java/com/config/InterceptorConfig.java` | 本文作者 | 2026-10-16 |
| Q08（QF-08） | 功能定位 | 美食信息的列表与详情接口写在哪个文件？对应的实体类与返回用的 VO 各是哪个？ | `src/main/java/com/controller/MeishixinxiController.java`<br>`src/main/java/com/entity/MeishixinxiEntity.java`<br>`src/main/java/com/entity/vo/MeishixinxiVO.java` | 本文作者 | 2026-10-16 |
| Q09（QF-09） | 功能定位 | 订单的「按列分组统计」接口写在哪个文件？管理端哪个页面用到这个接口？ | `src/main/java/com/controller/OrdersController.java`<br>`src/main/resources/admin/admin/src/views/modules/orders/list.vue` | 本文作者 | 2026-10-16 |
| Q10（QF-10） | 功能定位 | 把某个收货地址设为默认地址的接口写在哪个文件？前台哪个页面会调用它？ | `src/main/java/com/controller/AddressController.java`<br>`src/main/resources/front/front/pages/shop-address/shop-address.vue` | 本文作者 | 2026-10-16 |
| Q11（QM-01） | 跨模块定位 | 用户在订单确认页点击下单时，会依次触发哪些后端接口调用？这些接口分别由哪些后端文件处理？ | `src/main/resources/front/front/pages/shop-order-confirm/shop-order-confirm.vue`<br>`src/main/java/com/controller/OrdersController.java`<br>`src/main/java/com/controller/CartController.java`<br>`src/main/java/com/controller/AddressController.java` | 本文作者 | 2026-10-16 |
| Q12（QM-02） | 跨模块定位 | 要在购物车页面上展示商品的收藏状态，需要同时改动哪些前端与后端文件？ | `src/main/resources/front/front/pages/shop-cart/shop-cart.vue`<br>`src/main/java/com/controller/StoreupController.java`<br>`src/main/java/com/entity/StoreupEntity.java` | 本文作者 | 2026-10-16 |
| Q13（QM-03） | 跨模块定位 | 前台的登录态是如何在前后端之间传递的？从前端请求封装到后端解析 token，涉及哪些文件？ | `src/main/resources/front/front/api/http.js`<br>`src/main/java/com/interceptor/AuthorizationInterceptor.java`<br>`src/main/java/com/service/impl/TokenServiceImpl.java`<br>`src/main/java/com/config/InterceptorConfig.java` | 本文作者 | 2026-10-16 |
| Q14（QM-04） | 跨模块定位 | 用户端（前台小程序）中普通用户的注册流程，从前端注册页面一路到后端落库，涉及哪些文件？注意本题只问普通用户，不含管理员后台的注册。 | `src/main/resources/front/front/pages/register/register.vue`<br>`src/main/resources/front/front/api/index.js`<br>`src/main/java/com/controller/YonghuController.java`<br>`src/main/java/com/entity/YonghuEntity.java` | 本文作者 | 2026-10-16 |
| Q15（QM-05） | 跨模块定位 | 要修改「用户头像上传」这项功能，需要改动哪些前后端文件？ | `src/main/resources/front/front/pages/user-info/user-info.vue`<br>`src/main/java/com/controller/FileController.java`<br>`src/main/java/com/utils/FileUtil.java`<br>`src/main/java/com/controller/YonghuController.java` | 本文作者 | 2026-10-16 |
| Q16（QM-06） | 跨模块定位 | 订单支付（支付宝）相关的配置与前端支付页分别写在哪些文件？ | `src/main/java/com/config/AlipayConfig.java`<br>`src/main/java/com/controller/ConfigController.java`<br>`src/main/resources/front/front/pages/shop-recharge/pay-confirm.vue`<br>`src/main/resources/front/front/pages/shop-order/shop-order.vue` | 本文作者 | 2026-10-16 |
| Q17（QM-07） | 跨模块定位 | 美食评价（评论）功能：前端页面、后端控制器、实体类与服务实现分别在哪里？ | `src/main/resources/front/front/pages/discussmeishixinxi/list.vue`<br>`src/main/java/com/controller/DiscussmeishixinxiController.java`<br>`src/main/java/com/entity/DiscussmeishixinxiEntity.java`<br>`src/main/java/com/service/impl/DiscussmeishixinxiServiceImpl.java` | 本文作者 | 2026-10-16 |
| Q18（QM-08） | 跨模块定位 | 首页展示的美食（推荐）数据来自哪些后端文件？前端哪个页面渲染它？ | `src/main/resources/front/front/pages/index/index.vue`<br>`src/main/java/com/controller/MeishixinxiController.java`<br>`src/main/java/com/service/impl/CommonServiceImpl.java` | 本文作者 | 2026-10-16 |
| Q19（QM-09） | 跨模块定位 | 管理员后台的订单管理列表使用哪些前端与后端文件？ | `src/main/resources/admin/admin/src/views/modules/orders/list.vue`<br>`src/main/resources/admin/admin/src/views/modules/orders/add-or-update.vue`<br>`src/main/java/com/controller/OrdersController.java` | 本文作者 | 2026-10-16 |
| Q20（QM-10） | 跨模块定位 | 前台的收货地址从列表管理到在订单确认页被引用，这条链路涉及哪些文件？ | `src/main/resources/front/front/pages/shop-address/shop-address.vue`<br>`src/main/resources/front/front/pages/shop-order-confirm/shop-order-confirm.vue`<br>`src/main/java/com/controller/AddressController.java`<br>`src/main/java/com/entity/AddressEntity.java` | 本文作者 | 2026-10-16 |

表C-2 按题记录两种条件的运行结果。覆盖率按命中必要文件数占必要文件总数的比例计算，累计模型 Token 为该次运行全部模型调用的输入与输出用量之和。普通检索组每题两次；图谱增强组为四个独立批次、每题八次，四个批次用的都是第 6.4.5.3 节报告配置下的引擎。逐次运行的完整读取轨迹另存数据目录。

表C-2 上下文获取对比逐题结果

Table C-2 Per-Question Results of the Context Retrieval Comparison

| 编号 | 普通检索·覆盖率 | 普通检索·Token | 图谱增强·覆盖率 | 图谱增强·Token |
|---|---|---|---|---|
| Q01（QF-01） | 0.875 | 13,740 | 0.844 | 16,118 |
| Q02（QF-02） | 0.667 | 10,091 | 0.833 | 18,689 |
| Q03（QF-03） | 1.000 | 6,384 | 1.000 | 8,322 |
| Q04（QF-04） | 0.833 | 13,560 | 0.708 | 10,888 |
| Q05（QF-05） | 1.000 | 5,448 | 1.000 | 8,775 |
| Q06（QF-06） | 1.000 | 4,486 | 1.000 | 10,012 |
| Q07（QF-07） | 1.000 | 1,971 | 1.000 | 7,730 |
| Q08（QF-08） | 1.000 | 7,295 | 1.000 | 16,976 |
| Q09（QF-09） | 1.000 | 35,639 | 1.000 | 35,311 |
| Q10（QF-10） | 0.750 | 18,093 | 0.875 | 16,679 |
| Q11（QM-01） | 0.875 | 33,244 | 0.844 | 27,128 |
| Q12（QM-02） | 0.833 | 50,649 | 0.792 | 32,633 |
| Q13（QM-03） | 1.000 | 12,741 | 0.875 | 15,471 |
| Q14（QM-04） | 1.000 | 12,034 | 0.969 | 17,576 |
| Q15（QM-05） | 0.625 | 15,896 | 0.656 | 26,663 |
| Q16（QM-06） | 0.625 | 13,998 | 0.531 | 16,686 |
| Q17（QM-07） | 0.875 | 7,886 | 0.906 | 11,430 |
| Q18（QM-08） | 0.667 | 13,580 | 0.667 | 19,098 |
| Q19（QM-09） | 1.000 | 11,371 | 0.708 | 10,435 |
| Q20（QM-10） | 0.750 | 17,484 | 0.844 | 13,162 |

表C-3 汇总两种条件的平均覆盖率、平均累计模型 Token 与本地查询耗时中位数，数值与第 6 章正文一致。

表C-3 上下文获取对比结果汇总

Table C-3 Summary of the Context Retrieval Comparison

| 条件 | 平均关键文件覆盖率 | 平均累计模型 Token | 本地查询耗时中位数/ms | 平均轮次 |
|---|---:|---:|---:|---:|
| 普通检索组 | 0.869 | 15,279 | 342 | 6.4 |
| 图谱增强组 | 0.853 | 16,989 | 1,136 | 4.1 |

表C-2 的每一格是该题各次运行的均值，与第 6 章的统计口径一致：先算每题运行的均值，再对 20 题求平均。图谱增强组在正式回答前多出两步准备——把中文问题翻译成英文检索词（一次模型调用）和调用 `wpw graph context` 生成注入上下文（本地进程）。前者的 Token 用量计入累计模型 Token，其等待时间归模型侧、不计入本地查询耗时；后者的墙钟计入本地查询耗时，单次实测集中在 0.8 至 1.6 秒、中位数约 1.1 秒（该进程要加载图谱并按锚点扩展出子图，子图越大耗时越长）。因此增强组的本地查询耗时中位数（1,136 ms）约为普通检索组的 3.3 倍，多出的部分主要就是这次检索进程的启动与图谱加载。

表C-2 报告的是正文 6.4 节的条件（预置一次上下文 + 保真压缩）。另有三种增强形态在同一批题集与同一普通检索基线上做过对照，汇总见表C-4；把图谱输出由"组织好的上下文"换成"候选路径清单"的导航形态另见表C-6。

表C-4 增强形态与压缩保真的对照

Table C-4 Comparison of Augmented Forms

| 形态 | 平均覆盖率 | 覆盖率差/百分点 | 平均累计模型 Token | Token 变化 | 平均轮次 |
|---|---:|---:|---:|---:|---:|
| 前缀注入 + 不含路径的压缩 | 0.842 | −2.71 | 18,685 | +22.3% | 5.2 |
| 前缀注入 + 保真压缩 | 0.853 | −1.56 | 15,829 | +3.6% | 4.3 |
| 工具调用 + 保真压缩 | 0.856 | −1.25 | 18,249 | +19.4% | 6.1 |
| 前缀注入 + 保真压缩 + 覆盖核对提示 | 0.848 | −2.08 | 20,289 | +32.8% | 4.8 |

「不含路径的压缩」指压缩序列化未保留文件路径的形态，「工具调用」指上下文不预置、由智能体自行调用图谱工具获取的形态，「覆盖核对提示」指在保真压缩形态上追加一句「先核对覆盖了问题的每个环节再提交」。逐次运行数据分别见 `retrieval.jsonl` 的增强组（前缀注入 + 不含路径的压缩）、`retrieval-prefix-fidelity.jsonl` 与 `retrieval-prefix-fidelity-r2.jsonl`（前缀注入 + 保真压缩，两个批次）、`retrieval-tool.jsonl` 与 `retrieval-tool-r2.jsonl`（工具调用，两个批次）、`retrieval-cover.jsonl`（覆盖核对提示），对照汇总见 `variants.txt` 与 6.4.6 节表6-10。

表C-4 的四种形态在同一版引擎上跑完，用于比较形态本身；表内「前缀注入 + 保真压缩」一行是该版引擎的读数（两个批次，扩展范围未变）。报告配置在此基础上把扩展范围放大（可换向、上限 200、树外节点单列），在同一题集上重跑四个批次，平均覆盖率 0.853、平均累计模型 Token 16,989、平均轮次 4.1（表C-3），逐批次的覆盖率与成本见 6.4.5.3 节表6-13 与数据目录的 `reach-fixes.txt`。

另有两点只改动检索词语言或提示语的稳健性变体（其余参数与正文条件一致）：变体 A 用中文原问题直接检索、不加 `--multi`，平均覆盖率 0.869、平均累计模型 Token 16,585；变体 E 沿用正文条件的检索方式但把提示改为「上下文是起点，覆盖不足则补齐」，平均覆盖率 0.835、平均累计模型 Token 22,103。逐次运行数据见 `retrievalA.jsonl` 与 `retrievalE.jsonl`。

同一批题集与条件在统一阈值一档（业务映射边权重统一取 0.7）也各测过一轮，数字为：变体 A（中文原问题直接检索、不加 `--multi`）平均覆盖率 0.808、平均累计模型 Token 13,047；变体 C（即上述形态的前身）0.800、14,662；变体 E（提示改为「覆盖不足则补齐」）0.808、18,861，逐次运行数据分别见 `retrievalA.pre-fix.jsonl`、`retrieval.pre-fix.jsonl`、`retrievalE.pre-fix.jsonl`（文件名沿用当时的命名）。两档并置可见阈值的作用与代价：三类条件的覆盖率都回升（A 上升 6.1 个百分点至与普通检索持平，C 上升 4.2 个百分点，E 上升 2.7 个百分点），代价是注入的子图变大、同一批运行的平均累计模型 Token 上升 17.2% 至 27.4%；压缩保真再把「前缀注入 + 保真压缩」这一形态的 Token 增幅由 +22.3% 压到 +3.6%。

检索侧两档配置的差别可以由一项不调用模型的离线测量直接看出：拿每题运行时实际使用的检索词跑一次 `wpw graph context`，数人工标注的必要文件里有多少进了子图、有多少进了压缩文本。表C-5 给出两侧的结果。

表C-5 二十题必要文件的离线可达性

Table C-5 Offline Reachability of the Gold Files

| 配置 | 必要文件总数 | 进入子图 | 进入压缩文本 | 平均估算 Token | 平均子图节点数 |
|---|---:|---:|---:|---:|---:|
| 方向固定 · 上限 100（对照） | 62 | 50 | 49 | 1,522 | 86 |
| 报告配置（可换向 · 上限 200 · 树外节点单列） | 62 | 55 | 55 | 1,988 | 194 |
| 报告配置 · 导航形态 | 62 | 55 | 55 | 1,459 | 194 |

后两行是报告配置的构建、加入 6.4.8 节共能力边之前的读数；加入之后的同一测量见表C-8 与表C-9。

按问题类别拆分：功能定位类（25 个必要文件）由 22 个够得着、21 个进文本变为 23 个与 23 个；跨模块类（37 个）由 28 个与 28 个变为 32 个与 32 个。

表C-5 第三行是同一版引擎换用导航形态序列化（`--mode nav`）的结果，第三列与第四列故意与正文报告配置一行完全相同（进子图与进输出文本的都是同一批文件），差别只在输出体积：同一张子图上，锚点与候选路径清单的估算 Token 为 1,459，是层级树与依赖压缩文本的 0.73 倍。该行由 `WPW_REACH_MODE=nav node tmp_ch6/harness/reach.js` 测得，候选截断到 20 条的那一档只能让 34 个必要文件进文本，报告配置改为默认不截断，逐批记录见 `tmp_ch6/results/nav-form.txt`。

这项改善没有转成端到端覆盖率。同一条件在两档扩展范围下的平均覆盖率都是 0.853，而同一配置的批次标准差为 1.3 个百分点、七个批次的跨度为 0.838 到 0.867（扩展范围对照的两个批次自身相差 2.7 个百分点）。逐批次数据见 6.4.5.3 节表6-13 与数据目录的 `reach-fixes.txt`，其中 `r5-nocap` 一批是放开驱动脚本 12,000 字符截断的对照，覆盖率没有起色而 Token 上升，正文不采纳该设定。离线测量脚本为 `tmp_ch6/harness/reach.js`，分段归因脚本为 `tmp_ch6/harness/triagediag.js`。

表C-6 导航形态与预置上下文形态的对照

Table C-6 Comparison of the Navigation Form and the Pre-injected Context Form

| 形态 | 平均覆盖率 | 覆盖率差/百分点 | 平均累计模型 Token | Token 变化 | 平均轮次 |
|---|---:|---:|---:|---:|---:|
| 前缀注入 + 保真压缩（正文报告配置） | 0.853 | −1.61 | 16,989 | +11.2% | 4.1 |
| 导航图预置 + 图谱工具 | 0.840 | −2.92 | 20,492 | +34.1% | 5.0 |
| 仅图谱工具 | 0.852 | −1.67 | 24,131 | +57.9% | 6.0 |

覆盖率差与 Token 变化都以同一批题的普通检索组为基线（覆盖率 0.869、平均累计模型 Token 15,279、平均轮次 6.4）。「导航图预置 + 图谱工具」指先注入一次导航图、再由智能体按需调用图谱工具，「仅图谱工具」指不预置任何内容、只提供工具。

表C-6 两臂与正文条件取自同一批构建批次，因此三者可直接比较：正文条件即表6-7 的四个批次（每题 8 次），导航两臂为同一批二十题每题 2 次。表C-4 的五种形态取自另一批次，两张表不能横向掺读。导航形态既没有提高覆盖率，也没有降低开销——它把"选好的材料"换成"一张地图"，智能体要自己打开文件，平均轮次由 4.1 升到 5.0 与 6.0，而前缀上下文每轮重发；它的价值在检索侧，同一张子图上用正文形态 0.73 倍的体积给出相同的 55/62 可达路径（表C-5 第三行）。需要说明的是，二十道题每次都从零开始找代码、没有先验上下文，全部属于"不知道代码在哪"这一情形，也就是导航形态本该出场的场景；即便在这个场景里它也没有换来覆盖率。因此实践中的用法按 6.4.7 节所述收紧：已有上下文（任务或计划指明文件、本会话读过该模块）直接读文件，只有对陌生模块做一轮检索时才用导航形态介入，正文形态只用于通读模块、建立全局认知。逐次运行数据见 `tmp_ch6/results/retrieval-nav-full.jsonl`（默认不截断候选位置），初版（候选截断到 20 条，二十题里丢了 21 个金标文件）保留在 `retrieval-nav.jsonl`，离线可达性与在线结果汇总见 `tmp_ch6/results/nav-form.txt`。

表C-7 共能力边与每能力文件数上限 K

Table C-7 Sibling Edges and the Per-capability Fan-out K

| K（每能力参与连边的文件数） | 共能力边数 | MRR | Recall@3 | Recall@5 | Recall@10 | 候选前 5 条精度 | 平均候选条数 | 导航文本平均 Token | 金标对直接相连 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0（关闭） | 0 | 0.597 | 0.262 | 0.371 | 0.521 | 0.200 | 88.3 | 1,459 | 3/73 |
| 2 | 46 | 0.597 | 0.262 | 0.371 | 0.521 | 0.200 | 88.6 | 1,459 | 3/73 |
| 3 | 130 | 0.596 | 0.262 | 0.371 | 0.533 | 0.200 | 89.5 | 1,451 | 3/73 |
| 5（采用） | 422 | 0.596 | 0.262 | 0.371 | 0.546 | 0.200 | 91.2 | 1,463 | 3/73 |
| 12 | 2,762 | 0.597 | 0.262 | 0.371 | 0.546 | 0.200 | 105.8 | 1,695 | 6/73 |

表C-8 共能力边加入前后的离线可达性

Table C-8 Offline Reachability Before and After the Sibling Edges

| 测量 | 补边前 | 补边后 | 变化 |
|---|---:|---:|---:|
| 正文形态：进入子图 / 进入压缩文本 | 55 / 55 | 56 / 56 | +1 / +1 |
| 正文形态：平均估算 Token | 1,988 | 1,877 | −5.6% |
| 正文形态：平均子图节点数 | 194 | 198 | +4 |
| 导航形态：进入子图 / 进入输出文本 | 55 / 55 | 56 / 56 | +1 / +1 |
| 导航形态：平均估算 Token | 1,459 | 1,463 | +0.3% |

两表的检索词来源不同：表C-7 用六批运行记录里的检索词，表C-8 用前两批；「补边前」的导航 Token 在两张表里都取同一批运行记录时相等（1,459），不代表两表可以互相换算。

表C-9 把同一处改动放到不同的搜索形态下各量一遍，用来看它究竟在什么时候起作用。

表C-9 共能力边在不同搜索形态下的可达性

Table C-9 Reachability Gain of Sibling Edges Across Search Shapes

| 检索形态 | 补边前 | 补边后 | 变化 |
|---|---:|---:|---:|
| `--depth 2`（默认，节点上限 200） | 55/62 · 1,988 Token · 194 节点 | 56/62 · 1,877 Token · 198 节点 | +1 |
| `--depth 2 --max-nodes 100` | 52/62 · 2,084 Token · 100 节点 | 53/62 · 2,216 Token · 100 节点 | +1 |
| `--depth 1` | 45/62 · 1,564 Token · 61 节点 | 47/62 · 1,907 Token · 72 节点 | +2 |
| `--depth 3`（节点上限 200） | 57/62 · 2,062 Token · 200 节点 | 57/62 · 2,091 Token · 200 节点 | 0 |
| 导航形态（`--mode nav`，depth 2） | 55/62 · 1,459 Token | 56/62 · 1,463 Token | +1 |

形态对照由 `reach.js` 配合 `WPW_REACH_DEPTH`、`WPW_REACH_MAXNODES`、`WPW_REACH_MODE` 三个环境变量在补边前后各跑一遍得到，汇总存于 `tmp_ch6/results/shape-sibling.txt`。深度 1 的收益最大（结构路径只有一跳，同能力文件彼此走不到），深度 3 时结构路径已经能绕到这些文件，改动不再加分。

**共能力边的低优先规则**：在已补边的图谱上把节点上限收到 100，可达性会由 52/62 掉到 49/62——同一能力下的文件与锚点语义相似、综合得分高，额度一紧就把靠结构边够得的节点挤了出去。报告实现把 `sibling` 登记为低优先边（`src/graph/trimming/subgraph-trimmer.ts` 的 `lowPriorityEdgeTypes`，由 `src/graph/context/context-pipeline.ts` 传入）：先按「去掉这些边」的扩展结果占位，共能力边带来的新节点只花剩余槽位，而清单位次仍用含共能力边的得分。途中对照过一版把两份分值都按不含共能力边来算的实现，收紧额度那一档回到 53/62，但 Recall@10 由 0.546 掉回 0.521；报告实现把两者分开，两处都保住（表C-9 第三行与表C-8「补边后」列）。单元测试见 `src/test/subgraph-trimmer.test.ts`（含「不设低优先边时共能力文件挤掉结构可达文件」这一对照用例）。

**在线试点**（8 题 × 2 次，配对）：两臂覆盖率均为 81.8%，配对差平均 0.00 个百分点（2 次改善、12 次持平、2 次变差）；两臂分别由 `WPW_EVAL_QIDS=QF-01,QF-03,QF-05,QF-08,QM-03,QM-05,QM-06,QM-09 WPW_EVAL_RUNS=1,2` 跑出，原始记录为 `tmp_ch6/results/pilot-sib-on.jsonl` 与 `pilot-sib-off.jsonl`，配对对照见 `tmp_ch6/results/pilot-sibling.txt`。这是小样本试点，只用于判断方向，不替代正式批次。

共能力边由 `src/graph/builders/coupling-builder.ts` 生成（单元测试 `src/test/coupling-builder.test.ts`），规则是「被同一个 C 层能力够到的前 K 个文件两两相连、权重取两侧较弱值、双向」；对已有图谱补边而不重建的脚本为 `tmp_ch6/harness/patch-sibling.js`（`--k` 指定 K，`--strip` 回到补边前），K 扫描脚本为 `tmp_ch6/harness/sweep-sibling.js`。排序列（MRR 至金标对）由 `tmp_ch6/harness/rank.js` 测得，可达性两行由 `reach.js` 测得（导航形态加 `WPW_REACH_MODE=nav`），候选清单的构成用 `tmp_ch6/harness/navdump.js` 打印，金标对耦合探针为 `tmp_ch6/harness/pairprobe.js`。

一处反向实验记录在案：锚点原按路径字母序排列（锚点一律记满分，比较时落到路径），改为按各自检索相似度排序后，MRR 由 0.594 掉到 0.341、Recall@3 由 0.262 掉到 0.171、候选前 5 条精度由 0.200 掉到 0.160，已回退。原因是路径序在本题集上恰好把后端 Java 文件排在静态资源之前，而必要文件全是后端文件；检索相似度本身又集中在 0.70 至 0.94 的窄带内，区分度不足。据此，MRR 一列在本题集上量的是"锚点块内部次序"，不用作图谱质量的判据，可主张项限于 Recall@5、Recall@10 与候选前 5 条精度。

## 附录 D 实验环境、版本与冻结记录

表D-1 记录运行环境与工具版本。对比工具的版本号和提交号以正式运行时的实际配置为准；基础模型记录模型标识、上下文上限与采样参数。

表D-1 实验环境与版本

Table D-1 Experimental Environment and Versions

| 项目 | 记录 | 获取方式 |
|---|---|---|
| 操作系统 | Microsoft Windows 11 家庭版中文版，64 位 | 系统信息 |
| Node.js | v20.20.2 | `node --version` |
| WPW 版本与提交 | v0.1.8，提交 `1285f4c`（工作区另含未提交的可视化控制台实现） | 发布版本与 Git 提交 |
| TypeScript | v5.9.3 | 依赖版本 |
| 图谱 Schema | v3.1.0 | `meta.json` 的 `schemaVersion` |
| 解析范围 | TypeScript、JavaScript、Vue、Java | 图谱配置中的 `languages` |
| 对比工具版本 | OpenSpec v1.7.0 | OpenSpec 仓库版本记录 |
| 基础模型 | `deepseek-v4.1-flash`；单轮输出上限 4096 tokens；采样参数取服务端默认值；经 Anthropic 兼容接口调用 | 模型标识与调用配置 |

表D-2 记录实验载体与规范目录对应的 Git 提交，三次验证使用同一份快照。

表D-2 源码与规范快照

Table D-2 Source and Specification Snapshot

| 项目 | 文件数或规模 | 提交号 | 冻结日期 |
|---|---|---|---|
| 源码仓库 | `src/` 下共 996 个文件，其中被图谱解析的源文件 393 个（对应 L2 层） | `afca51b09abd73c619986659a7af34b8d616d9b1` | 2026-10-16 |
| 能力规范目录 | 25 份能力规范（`wpw/specs/<能力名>/spec.md`） | 与源码仓库同一快照 | 2026-10-16 |
| 图谱构建产物 | 1799 个节点、2434 条边（C=25、L1=12、L2=393、L3=1369），Schema v3.1.0，向量索引 1794 条 | 与源码仓库同一快照 | 2026-10-16 |

源码快照以压缩包 `snapshot-afca51b09abd.zip` 的形式留档，三种验证都从该快照复制出独立工作区开始，运行之间不共享工作区。图谱构建产物随快照一并冻结，三段验证使用同一份图谱，不重新构建。

表D-3 记录运行前冻结的题集与参数。冻结后不再调整，试运行数据不进入正式统计。

表D-3 题集与参数冻结记录

Table D-3 Frozen Question Sets and Parameters

| 项目 | 内容或取值 | 冻结方式 |
|---|---|---|
| 开发任务与验收清单 | T1 基础搭建、T2 业务核心、T3 迭代增强三个任务；每种方法各运行 2 次，共 12 次；单次运行步数上限 60；全自动执行，无人工确认环节 | 见附录 B 表B-1 |
| 代码定位题集与必要文件 | 20 题，功能定位与跨模块定位各 10 题；每题人工标注的必要文件不超过 5 个；正文两种条件各运行 2 次共 80 次，6.4.6 节的形态消融另计 240 次，6.4.5 节的实现配置对照另计 200 次 | 见附录 C 表C-1 |
| Token 预算与压缩档位 | 三档压缩 loose/standard/extreme，系统默认 standard；图谱增强组生成注入上下文时取 `--token-budget 3000 --depth 2` | 配置文件与运行脚本 |
| 图谱构建参数 | 模块定义 12 个；`semanticThreshold` 0.5；`semanticTopK` 12；`gitHistory` true | `workflow.config.yaml` |
| 检索参数 | 语义检索相似度阈值 0.6；每查询锚点上限 5；子图扩展深度 2；节点上限 200；扩展最小边权重 0.7（结构边）与 0.3（business_map 边，见 6.4.5） | 图谱默认配置与运行参数 |

表D-3 所列参数在正式运行前确定，正式运行期间未再调整（报告配置把节点上限取 200、扩展允许中途换向，6.4.5.3 节的扩展范围对照档按 100 记录，逐批次见 6.4.5.3 节表6-13）。第 6.4 节的两种条件除是否注入图谱上下文外，其余参数完全相同；关键词生成完成后，检索词一并记入逐次运行数据。稳健性变体 A 与 E 分别只改动检索词语言与增强组提示语（见表6-9），形态消融的其余各臂分别只改动注入方式（预置改为按需调用）、压缩保真（是否保留文件路径）或提示语（是否要求核对覆盖，见表6-10），参数与正文条件一致；各组的逐次运行数据随主数据一并留存。表D-3 中检索参数一行的 business_map 阈值是 6.4.5.1 节按类型取值一档的取值。