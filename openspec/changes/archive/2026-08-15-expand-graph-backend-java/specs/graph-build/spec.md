## ADDED Requirements

### Requirement: Java 文件分发与解析调度
`source-parser` SHALL 将 `.java` 文件分发到 Java 解析器。`extToLanguage` SHALL 将 `.java` 映射为 `java` 语言；`parseSourceFile` 的 switch SHALL 新增 `case 'java'` 分支，调用 `parseJavaFile`。

#### Scenario: .java 文件识别为支持文件
- **WHEN** `isSupportedFile` 判断 `.java` 文件，且 `languages` 配置含 `java`
- **THEN** 返回 true
- **AND** 文件被纳入源码扫描结果

#### Scenario: .java 文件分发到 Java 解析器
- **WHEN** `parseSourceFile` 处理 `.java` 文件
- **THEN** 调用 `parseJavaFile(filePath, root, source)` 解析
- **AND** 返回 `ParseResult`（fileNode + elements + imports）

#### Scenario: languages 未配置 java 时跳过
- **WHEN** `languages` 配置不含 `java`
- **THEN** `.java` 文件不被识别为支持文件
- **AND** 不触发 Java 解析

#### Scenario: Java 文件解析失败降级
- **WHEN** Java 解析抛出异常
- **THEN** 输出 warning，不中断构建
- **AND** 仍生成 file 节点（无元素），保证文件级图谱完整

### Requirement: Java 包路径 import 边解析
`buildImportEdges` SHALL 新增 Java 包路径解析分支。对于 Java 文件的 import（形如 `import com.example.user.UserService`），SHALL 按 Maven 标准布局解析为目标文件路径：`源根(src/main/java) + 包路径(点转斜杠) + 类名 + .java`，在 fileNodes 中查找并建立 import 边。

#### Scenario: 单类型 import 解析
- **WHEN** `UserService.java`（位于 `src/main/java/com/example/user/`）含 `import com.example.order.Order;`，且 `Order.java` 存在于 `src/main/java/com/example/order/`
- **THEN** `UserService` 文件节点与 `Order` 文件节点之间建立 `import` 边
- **AND** 边权重与前端 import 一致（0.75）

#### Scenario: 通配 import 解析
- **WHEN** 文件含 `import com.example.order.*;`，且 `com.example.order` 包下有 `Order.java`、`OrderItem.java`
- **THEN** 当前文件与包下每个文件节点各建立一条 `import` 边

#### Scenario: 静态 import 跳过
- **WHEN** 文件含 `import static com.example.Constants.MAX;`
- **THEN** 跳过该 import，不建立边
- **AND** 不报错

#### Scenario: 同文件内类型 import 跳过
- **WHEN** import 的类型与当前文件同名（自引用）
- **THEN** 不建立 import 边

#### Scenario: 目标文件不存在时静默跳过
- **WHEN** import 的类型在源根下找不到对应 `.java` 文件（如 JDK 类型 `java.util.List`、第三方库类型）
- **THEN** 跳过该 import，不建立边
- **AND** 不报错
- **AND** 构建统计中记录 Java import 解析覆盖率

#### Scenario: 源根识别
- **WHEN** backend-java 项目下扫描 Java 文件
- **THEN** 源根识别为 `src/main/java`（Maven 标准布局）
- **AND** 包路径解析基于该源根计算

### Requirement: Spring Boot 业务模块推断
`module-parser` SHALL 在 backend-java 项目下按 Spring Boot 布局推断 L1 业务模块。模块根 SHALL 指向 `src/main/java/<groupId反转包路径>/`，该目录下的直接子目录（业务包）作为 L1 模块。技术分包（controller/service/repository/entity/dto/config）不单独成模块。

#### Scenario: 业务包识别为模块
- **WHEN** backend-java 项目，`src/main/java/com/example/` 下含 `user/`、`order/` 业务包
- **THEN** `user`、`order` 生成 L1 模块节点（类型 `module`，`side` = `backend`）
- **AND** `attrs.dir` 为业务包相对路径

#### Scenario: 技术分包不单独成模块
- **WHEN** 业务包 `user/` 下含 `controller/`、`service/`、`repository/` 子目录
- **THEN** `controller`、`service`、`repository` 不生成独立 L1 模块
- **AND** 这些目录下的文件归属 `user` 模块

#### Scenario: groupId 反转包路径推断
- **WHEN** 项目无显式模块配置，Java 源文件位于 `src/main/java/com/example/<包>/`
- **THEN** 模块根推断为 `src/main/java/com/example/`
- **AND** 其下直接子目录作为业务模块

#### Scenario: 扁平包结构降级
- **WHEN** Java 源文件直接位于 `src/main/java/com/example/` 下（无业务包子目录）
- **THEN** 整个 `src/main/java` 作为一个 backend 模块
- **AND** 不阻塞构建，输出模块数统计

#### Scenario: commonDirs 不误伤业务包
- **WHEN** 业务包 `user/` 下含 `user/dto/` 子目录，且 `dto` 在 `commonDirs` 中
- **THEN** `dto` 在业务包内部层级被正确跳过（不作为子模块）
- **AND** `user` 业务包本身不被 commonDirs 误排

### Requirement: 后端项目默认配置扩展
图谱默认配置 SHALL 扩展以支持 Java 后端项目：`languages` 纳入 `java`，`ignore` 纳入 `target`（Maven 构建产物），backend-java 项目下 `moduleRoots` 补充 Spring Boot 源根。

#### Scenario: 默认 languages 含 java
- **WHEN** 读取默认配置
- **THEN** `build.languages` 含 `['typescript', 'javascript', 'vue', 'java']`

#### Scenario: ignore 纳入 target
- **WHEN** 读取默认配置
- **THEN** `build.ignore` 含 `target`（Maven 构建产物目录）

#### Scenario: backend-java 构建 moduleRoots 扩展
- **WHEN** 某次构建（`graph build --name <stack> --root <dir>`）的 scan root 嗅探为 `backend-java`
- **THEN** 该构建的 `moduleRoots` 采用 Spring Boot 源根（`src/main/java` 相关）
- **AND** 默认配置同时含前端 moduleRoots 与 Java 源根，按本次构建的项目类型选用

#### Scenario: 扫描覆盖 src/main/java
- **WHEN** `scanSourceFiles` 在 backend-java 构建（scan root 含 pom.xml）下扫描
- **THEN** scan root 下 `src/main/java` 的 `.java` 文件被纳入扫描
- **AND** `target/` 目录被忽略

### Requirement: Java 节点 contain 边与层级
Java 节点 SHALL 纳入既有 contain 边体系：L1 业务模块 ⊃ L2 文件 ⊃ L3 元素（class/interface/enum/method/constant）。contain 边生成逻辑无需新增分支，复用现有 `buildContainEdges`。

#### Scenario: 模块 contain 文件
- **WHEN** `UserService.java` 位于 `src/main/java/com/example/user/service/`
- **THEN** `user` 模块节点 contain `UserService` 文件节点
- **AND** 边权重 0.9（与前端一致）

#### Scenario: 文件 contain 元素
- **WHEN** `UserService.java` 含 class `UserService` 与 method `findById`
- **THEN** 文件节点 contain class 节点与 method 节点
- **AND** class 节点与 method 节点层级均为 L3

### Requirement: Java 图谱作为命名图谱独立存储
Java 后端图谱 SHALL 通过 `expand-multi-graph-storage` 的多图谱机制存入独立命名文件夹（如 `wpw/knowledge/graph/backend-springboot/`），与前端图谱（如 `frontend-vue/`）并列共存、相互独立。Java 解析器只负责产出图谱内容，存储寻址由 multi-graph 机制承担。本 change 不引入 fullstack 合并图谱--多技术栈通过多图谱隔离，每次 `graph build --name <stack> --root <subdir>` 只面对单一技术栈。

#### Scenario: Java 图谱独立命名存储
- **WHEN** 执行 `wpw graph build --name backend-springboot --root backend`（backend 目录含 pom.xml + Java 源码）
- **THEN** Java 图谱写入 `wpw/knowledge/graph/backend-springboot/`
- **AND** 与 `frontend-vue/` 等其他图谱并列共存、相互独立

#### Scenario: 每次构建只面对单一技术栈
- **WHEN** AI 层分别对前端子目录与后端子目录执行命名构建
- **THEN** 前端图谱项目类型为 frontend-h5，后端图谱项目类型为 backend-java
- **AND** 两者各自独立嗅探（由 multi-graph 的 `--root` 按 scan root 嗅探），互不干扰
- **AND** 不存在 fullstack 合并图谱

#### Scenario: 检索时按图谱名定向
- **WHEN** AI 层针对后端问题检索
- **THEN** 发起 `wpw graph context "..." --graph backend-springboot`
- **AND** 仅在 Java 图谱内检索（multi-graph 的 `--graph` 契约）
- **AND** 跨端由 AI 层发起多次单图谱检索聚合（首版不做联合检索）

### Requirement: Schema 版本次版本升级
因新增 Java 节点类型与解析能力为向后兼容的增量变更，schema 版本 SHALL 从 `3.0.0` 升级到 `3.1.0`。旧版本（3.0.x）图谱在 `wpw graph update` 时 SHALL 增量兼容（主版本号相同），无需全量重建。

#### Scenario: 新构建写入 3.1.0
- **WHEN** 执行 `wpw graph build` 或 `wpw graph rebuild`
- **THEN** meta.json 中 `schemaVersion` 写入 `3.1.0`

#### Scenario: 3.0.x 图谱增量兼容
- **WHEN** 执行 `wpw graph update` 且已有图谱 schema 为 `3.0.x`
- **THEN** 主版本号相同（均为 3），增量兼容
- **AND** 不触发全量重建
- **AND** Java 文件变更走增量更新流程

### Requirement: Java import 边增量重建范围
`wpw graph update` 在 Java 文件变更时 SHALL 重建该文件自身的 import 边（出边）。首版 SHALL 仅重建变更文件自身的 import 边，不重建引用了被删/改名类的其他文件的 import 边--此为既有局限，Java 包路径 import 会放大该影响。

#### Scenario: 变更文件自身 import 边重建
- **WHEN** `UserService.java` 内容变更（如新增 import），执行 `wpw graph update`
- **THEN** `UserService` 文件节点的 import 出边被重建
- **AND** 旧的不再存在的 import 边被移除

#### Scenario: 被引用类改名时其他文件 import 边不重建（已知局限）
- **WHEN** `Order.java` 改名为 `OrderEntity.java`，而 `UserService.java`（import Order 且自身未变）执行 `wpw graph update`
- **THEN** `UserService` 的 import 边仍指向已不存在的 `Order`（悬挂边）
- **AND** 不报错
- **AND** 建议用户在类改名/删除后执行 `wpw graph rebuild` 全量重建以保证一致性

#### Scenario: 文件删除时 import 边清理
- **WHEN** `Order.java` 被删除，执行 `wpw graph update`
- **THEN** `Order` 文件节点及其 contain 边被移除
- **AND** 其他文件指向 `Order` 的 import 边被移除（边引用的 to 节点不存在时校验告警）
