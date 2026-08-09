## Context

当前图谱系统的源码解析仅覆盖前端语言与前端生态（Pinia/Vuex/Redux/小程序/uni-app），后端语言零支持。在 vue + springboot 全栈技术栈下，前端半张图完整、后端是黑盒，制约了 wpw 作为全栈 AI 工作流上下文基础设施的定位，也削弱了本课题第 5 章对比实验"vue+springboot 下 wpw 更优"的论证强度。

见 proposal.md 中的 Why 和 What Changes 部分。本 change 采用**路径 1**：Java 作为完整语言接入，wpw 升级为前后端全栈建图工具（非"够用降级"）。

## Goals / Non-Goals

**Goals:**
- 新增 Java 解析器，覆盖 Spring Boot 典型结构（controller / service / repository / entity / dto / config）
- Java 文件产出 L2 文件节点 + L3 类型节点（class/interface/enum）+ L3 方法节点（选择性）
- 包路径 import 正确解析为文件间 import 边
- Spring Boot 业务包推断为 L1 模块，与前端 `src/modules/<业务>` 对齐，使 business_map 跨前后端工作
- Spring 注解捕获为节点 attrs，REST endpoint 元信息进方法 attrs
- 新增节点自动参与向量索引、语义检索、business_map（不改现有算法）
- 零破坏性：现有前端解析行为不变

**Non-Goals:**
- 不实现 `@Autowired` 依赖注入边、JPA 实体关联边（列入未来工作/局限性）
- 不解析 Kotlin（`.kt`）、Scala、Groovy 等 JVM 语言（首版仅 Java）
- 不做 Java 类型推导与跨文件方法调用图分析
- 不解析 `pom.xml` / `build.gradle` 依赖为图谱节点
- 不解析 Lombok 注解生成的合成方法（源码中不存在，无法静态解析）
- 不修改 C 层能力解析与 noisy-OR 聚合算法（新节点自动参与现有流程）
- 不引入新图谱层级（Java 节点纳入既有 C/L1/L2/L3）

## Decisions

### 决策 1：Java 作为完整语言接入（路径 1）

**决定：** Java 与 TypeScript/JavaScript/Vue 平级，作为又一门受支持语言完整接入，使 wpw 升级为前后端全栈建图工具。范围 T1+T2。

**理由：**
- 本课题第 5 章对比实验在 vue+springboot 上进行，需后端图谱完整才能公平论证"wpw 更优"
- 项目类型层（`project-type.ts`）已支持 `backend-java`（pom.xml/build.gradle 嗅探），`isBackend()` 已覆盖，接入成本低
- "够用降级"路径（仅 specs 能力层 + 三源兜底）会让后端图谱明显弱于前端，结论被质疑

**备选方案：** 路径 2（仅 T1 够用降级，后端图谱浅，诚实列为局限）。工作量小但论证弱，已否决。

### 决策 2：Spring Boot 模块按业务包推断（思路 A）

**决定：** backend-java 项目下，将 `src/main/java/<groupId反转>/<业务包>/` 识别为 L1 业务模块。技术分包（controller/service/repository/entity/dto/config）作为包内结构，不单独成模块。

```
src/main/java/com/example/
  user/                  ← L1 模块 "user"
    controller/UserController.java
    service/UserService.java
    repository/UserRepository.java
    entity/User.java
  order/                 ← L1 模块 "order"
    ...
```

**理由：**
- 业务包与能力层 C 天然对齐，"用户能力"映射到 `user` 模块，business_map 跨前后端语义一致（前端 `src/modules/user`、后端 `com/example/user`）
- 思路 B（按 controller/service 技术层成模块）不是业务模块，business_map 语义弱

**实现要点：**
- backend-java 项目下 `moduleRoots` 自动指向 `src/main/java/<groupId反转包路径>/`（从 `package` 声明或目录结构推断）
- 该目录下的直接子目录（业务包）作为 L1 模块
- 现有 `commonDirs` 中的 `dto/entities/models/config` 等在 Spring Boot 语境下是包内技术分层，不应在业务包层级触发排除（需确认排除逻辑只在模块根层级生效，不下钻到业务包内部）

**备选方案：** 思路 B（技术层成模块）。简单但 business_map 语义弱，已否决。

**待确认（Open Question）：** `commonDirs` 排除逻辑当前在 `scanModuleDir` 每层都生效。若业务包内含 `user/dto/` 子目录，`dto` 会被当通用目录跳过--但这是期望行为（dto 不是子模块）。需确认不会误伤业务包本身。

### 决策 3：方法选择性建 L3 节点（选项 B + 选择性）

**决定：** 对 Java 类的 public 方法、以及带 `@*Mapping`（`@GetMapping`/`@PostMapping` 等）注解的接口方法，生成独立 L3 节点（type=function，attrs.parentName=类名）。private/protected 工具方法仅收进类签名的 methods 列表，不建 L3 节点。

**理由：**
- Java 所有逻辑在类方法里，若照搬 ts-parser（方法只进签名不建节点），一个 Controller 只有一个 class 节点，方法级语义丢失，business_map 无法命中具体方法，上下文裁剪粒度过粗
- 全量建方法节点会导致中型 Spring Boot 后端节点膨胀（几百方法），撑大图谱与向量索引
- 选择性策略（public + endpoint 方法）平衡语义粒度与节点规模，REST endpoint 方法恰好是前后端 API 对齐的关键

**备选方案：** 选项 A（照搬 ts-parser，方法只进签名）。简单但语义粒度过粗，已否决。

**待确认（Open Question）：** "public 方法"阈值是否过宽？是否应只对带 Spring 注解（`@*Mapping`/`@Scheduled`/`@EventListener` 等）的方法建 L3，其余 public 方法进签名？倾向当前决定（public + @*Mapping），但可在实现后按节点规模回调。

### 决策 4：注解深度做到"浅 + 中"

**决定：**
- **浅**：所有 Spring 注解（`@RestController`/`@Service`/`@Repository`/`@Component`/`@Configuration`/`@Entity` 等）捕获进节点 `attrs.annotations`；带 stereotype 注解的类在 `attrs.description` 标注角色（如"REST 控制器""业务服务"）
- **中**：`@GetMapping`/`@PostMapping`/`@PutMapping`/`@DeleteMapping`/`@RequestMapping` 的路径与方法绑定，提取为方法 `attrs.endpoint`（`{ method: 'GET', path: '/api/food' }`）
- **不做**：不建独立 endpoint 节点、不建 `@Autowired` DI 边、不建 JPA 实体关联边

**理由：**
- 注解捕获几乎零成本（ts-parser 已有装饰器提取逻辑可复刻），且让模块 side 判断、节点描述更准
- REST endpoint 元信息进方法 attrs，使上下文能回答"推荐接口在哪"，对前后端 API 对齐价值高
- DI 边/JPA 关系边偏离"语言解析"主线，工作量大，列入未来工作

**备选方案：** 深度（endpoint 独立节点 + DI 边 + JPA 边）。价值高但偏离主线，列入 6.2 展望。

### 决策 5：包路径 import 解析依赖 Maven 标准布局

**决定：** Java import 边解析依赖 Maven 标准布局约定：`源根(src/main/java) + 包路径(点转斜杠) + 类名 + .java`，在 fileNodes 中查目标文件。通配 import `com.example.user.*` 连接整个包内文件。

**理由：**
- Maven 标准布局是 Spring Boot 项目的压倒性惯例，覆盖绝大多数场景
- 复用现有 `buildImportEdges` 架构，仅新增 Java 分支，与前端 import 解析降级风格一致（解析不到静默跳过）

**备选方案：** 解析 `pom.xml`/`build.gradle` 的 sourceSets 精确定位源根。准确但复杂，首版不做。

**风险：** 非标准布局（Gradle 自定义 sourceSets、多模块工程）解析不到。缓解：静默跳过不报错，统计输出显示 Java import 解析覆盖率。

### 决策 6：tree-sitter-java WASM 可用性需先 spike

**决定：** 采用 `tree-sitter-java` npm 包自带的 `tree-sitter-java.wasm`（v0.23.5 已验证包含 wasm 文件），loader 路径与 tree-sitter-javascript/typescript 一致：`require.resolve('tree-sitter-java/tree-sitter-java.wasm')`。保留 fallback 到 `tree-sitter-wasms` 的代码路径作为兜底。

**Spike 结论（已验证）：**
- `tree-sitter-java@0.23.5` 包内自带 `tree-sitter-java.wasm`，与 `tree-sitter-javascript`/`tree-sitter-typescript` 模式一致
- 可直接通过 `require.resolve('tree-sitter-java/tree-sitter-java.wasm')` 定位
- 无需 fallback 到 `tree-sitter-wasms`（但代码中保留了该路径以防版本变更）
- 正则降级方案作为最终 fallback 已实现（提取 class/interface/enum 名，不含签名细节）

**理由：**
- 现有 loader 靠 `require.resolve('tree-sitter-javascript/tree-sitter-javascript.wasm')` 拿 wasm，依赖语言包自带 wasm 文件
- `tree-sitter-java` 历史上只带 native binding，是否带 wasm 需实测确认，是本 change 唯一可能卡住的点
- 实测 v0.23.5 已自带 wasm，可直接照搬 loader 模式

**备选方案：** 若 `tree-sitter-java` 无 wasm 且 `tree-sitter-wasms` 也不可用，退化为正则解析 Java（类似 WXML 方案）。能力弱但保证可用。

### 决策 7：Java 图谱通过多图谱机制隔离，依赖 expand-multi-graph-storage

**决定：** Java 后端图谱不与前端图谱合并，而是通过 `expand-multi-graph-storage` 的多图谱机制存入独立命名文件夹（如 `wpw/knowledge/graph/backend-springboot/`）。本 change 只负责 Java 解析（产出图谱内容），存储寻址、`--name`/`--root`/`--graph` 参数、命名图谱共存由 multi-graph change 承担。本 change 不引入 fullstack 合并图谱，不修复 `sniffProjectType` 的 fullstack 检测--多图谱下每次 `graph build --name <stack> --root <subdir>` 只面对单一技术栈，按 scan root 嗅探单栈项目类型即可。

**理由：**
- 多技术栈（vue + springboot）本质是不同技术栈，强行合并成一张图会让模块推断、项目类型嗅探互相干扰
- 多图谱隔离更贴近真实项目（前后端分仓/分包），且检索时前端问题不被后端节点稀释、反之亦然
- 跨端关联由 AI 层（`/wpw:map`）在检索层发起多次单图谱查询聚合，符合三层分离

**实现要点：**
- Java 解析器产出的图谱通过 `graph build --name <java-stack> --root <backend-dir>` 构建到独立文件夹（multi-graph 提供）
- 本 change 不改动存储层路径路由（multi-graph change 负责）
- 本 change 的 Spring Boot 模块推断在 multi-graph 的 `--root` scan root 下生效（scan root 嗅探为 backend-java 时启用）

**备选方案：** fullstack 合并图谱（已否决，见上文）。多图谱隔离由 multi-graph change 统一实现，本 change 消费之。

## Risks / Trade-offs

### 风险 1：tree-sitter-java WASM 缺失
[风险] `tree-sitter-java` 不自带 wasm，loader 无法加载 -> **缓解措施**：决策 6 的 spike 前置；fallback `tree-sitter-wasms`；最终 fallback 正则解析。

### 风险 2：Spring Boot 模块推断误判
[风险] 非 Maven 标准布局、扁平包结构（无业务包层级）项目模块推断失败 -> **缓解措施**：推断不到则按 `src/main/java` 整体作为一个 backend 模块，不阻塞构建；统计输出模块数。

### 风险 3：方法节点膨胀
[风险] 大型 Spring Boot 项目 public 方法多，L3 节点 + 向量爆炸 -> **缓解措施**：决策 3 的选择性策略；若仍膨胀，回调为只对带注解方法建节点；向量构建已有失败降级。

### 风险 4：包路径 import 解析覆盖率
[风险] 通配 import、内部类、静态 import、跨模块工程解析不全 -> **缓解措施**：首版只处理单类型 import + 同源根通配；静态 import（`import static`）跳过；统计覆盖率输出。

### 风险 5：commonDirs 与 Spring 包名冲突
[风险] `commonDirs` 含 `dto/entities/models/config` 等，可能在 Spring Boot 语境误伤业务包内部子目录 -> **缓解措施**：决策 2 的实现要点确认排除逻辑只在模块根层级生效；测试覆盖 `user/dto/` 场景。

### 风险 6：增量更新下 Java import 悬挂边
[风险] 类改名/删除后，引用它但自身未变的文件的 import 边不重建，产生悬挂边 -> **缓解措施**：spec 明确该局限为首版已知问题；建议类改名/删除后执行 `wpw graph rebuild --graph <stack>`；文件删除时通过校验告警提示悬挂边。

### 权衡：解析深度 vs 实现复杂度
Java 解析深度（DI 边/JPA 关联/类型推导）与复杂度正相关。首版聚焦"语言级 + Spring 注解 + 包 import + 业务模块"，深度语义列入未来工作。

### 权衡：方法节点粒度
全量方法节点语义细但膨胀；只进签名粒度粗但轻量。选择性策略（public + endpoint）取中间，可在实现后按实际节点规模回调。

## Migration Plan

- **零破坏性变更**：所有新增内容都是增量的，现有前端解析行为不变
- 默认 `languages` 纳入 `'java'`，但 Java 解析仅在 scan root 含 `.java` 文件时实际触发（无 Java 文件则无影响）
- **依赖 `expand-multi-graph-storage`**：Java 图谱通过 multi-graph 的 `--name`/`--root`/`--graph` 机制存入独立命名文件夹，不引入 fullstack 合并图谱，不修复 `sniffProjectType`（每次构建按 scan root 单栈嗅探）
- Schema 版本次版本号升级（3.0.0 -> 3.1.0），因为是向后兼容的新增节点类型（与 expand-graph-frontend-stacks 一致；需与 multi-graph change 协调版本号，见 Open Question 6）
- 用户升级后执行 `wpw graph build --name <java-stack> --root <backend-dir>` 即可构建 Java 图谱
- 现有 vue/前端项目的图谱不受影响（无 .java 文件）

## Open Questions

1. **方法 L3 节点的选择阈值**：public 方法是否过宽？是否应只对带 Spring 注解的方法建节点？（决策 3，倾向当前决定，实现后回调）
2. **多模块 Maven 工程**：父项目含多个子模块（`user-service/`、`order-service/` 子目录各含 src/main/java），是否需要支持下钻多模块？（首版假设单模块，列未来工作）
3. **Kotlin 支持**：Spring Boot 大量使用 Kotlin，`.kt` 是否纳入首版？（Non-Goal，列未来工作）
4. **commonDirs 在 Spring 语境的调整**：是否需要为 backend-java 项目准备一份 Spring Boot 专用 commonDirs（排除 controller/service/repository 等，避免它们在模块根层级被误排）？（决策 2，需测试确认）
5. **依赖 multi-graph 的实现时序**：本 change 依赖 `expand-multi-graph-storage`，需后者先落地（存储分文件夹 + `--name`/`--root`/`--graph` 参数）。若并行开发，Java 解析器可先在单图谱 default 下开发测试，待 multi-graph 落地后切换到命名图谱。
6. **schema 版本与 frontend-stacks / multi-graph 协调**：frontend-stacks（已完成 60/60）design 提过 3.1.0 但代码仍是 3.0.0；multi-graph change 也在 3.x.x 段。本 change 占 3.1.0 是否冲突？需确认 frontend-stacks 是否计划重开并占该版本号（若是，本 change 改占 3.2.0）。三个 change 的 schema 版本号需协调。
