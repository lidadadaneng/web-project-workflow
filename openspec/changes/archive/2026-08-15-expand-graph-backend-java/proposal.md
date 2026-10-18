## Why

当前图谱的源码解析只覆盖前端语言（TypeScript / TSX / JavaScript / JSX / Vue SFC）及前端状态管理生态（Pinia / Vuex / Redux / 小程序 / uni-app），对后端语言完全没有支持。`source-parser.ts` 的 `extToLanguage` 对 `.java` 返回 null，Java 文件在 `isSupportedFile` 阶段即被跳过；`buildImportEdges` 只解析以 `./` 或 `/` 开头的相对路径 import，Java 的包路径 import（`import com.example.user.UserService`）全部被跳过。

这导致 wpw 在 vue + springboot 这类国内最主流的全栈技术栈上，只能建出前端半张图，后端是黑盒。直接影响本课题第 5 章对比实验的论证强度--若 springboot 后端不进图谱，"wpw 在 vue+springboot 技术栈下更优"的结论会被质疑"后端都没建好图"。需要新增 Java 解析器，让 Spring Boot 后端源码进入图谱，使 wpw 升级为前后端全栈建图工具。

## What Changes

- 新增 Java 源码解析器（基于 tree-sitter-java WASM），提取 class / interface / enum / method / field 节点与注解
- 新增 Java 包路径 import 解析：将 `import com.example.user.UserService` 解析为文件间 import 边（依赖 Maven 标准布局 `src/main/java/`）
- 新增 Spring Boot 业务包模块推断：将 `src/main/java/<groupId反转>/<业务包>/` 识别为 L1 业务模块，与技术分包（controller/service/repository）对齐
- 新增方法级 L3 节点：对 public 方法及带 `@*Mapping` 注解的接口方法生成独立 L3 节点，private 工具方法仅进类签名
- 捕获 Spring 注解（`@RestController` / `@Service` / `@Repository` / `@Entity` / `@GetMapping` 等）进节点 attrs，REST endpoint 元信息进方法 attrs
- 配置扩展：`languages` 默认纳入 `java`，`ignore` 纳入 `target`（Maven 构建产物），`moduleRoots` 在 backend-java 项目下指向 Java 源根
- 新增节点自动参与向量索引、语义检索、business_map 多源证据融合（与现有流程一致，无需改算法）

## Capabilities

### New Capabilities

- `java-indexing`: Java / Spring Boot 源码的图谱索引能力，基于 tree-sitter-java 解析 `.java` 文件，提取类型/方法/字段/注解节点，解析包路径 import，推断 Spring Boot 业务模块

### Modified Capabilities

- `graph-build`: 构建流程新增 Java 解析步骤，`source-parser` 分发逻辑扩展 `.java`，`tree-sitter-loader` 加载 java 语言包，`buildImportEdges` 新增包路径解析分支，`module-parser` 在 backend-java 项目下按 Spring Boot 布局推断模块，配置默认值扩展

## Impact

- `src/graph/parsers/`：新增 `java-parser.ts`（仿 `ts-parser.ts`）
- `src/graph/parsers/source-parser.ts`：`extToLanguage` 加 `.java -> 'java'`，`SupportedLanguage` 加 `'java'`，`parseSourceFile` switch 加 `case 'java'`
- `src/graph/parsers/tree-sitter-loader.ts`：`loadLanguage` / `setParserLanguage` 的 lang 联合类型加 `'java'`，新增 `tree-sitter-java.wasm` 解析分支
- `src/graph/builders/graph-builder.ts`：`buildImportEdges` 新增 Java 包路径解析分支（依赖 Maven 标准布局）；`scanSourceFiles` 默认 ignore 纳入 `target`
- `src/graph/parsers/module-parser.ts`：backend-java 构建（scan root 嗅探为 backend-java）下 `moduleRoots` 指向 Spring Boot 源根，按业务包推断 L1 模块
- `src/graph/config.ts`：`DEFAULT_BUILD.languages` 纳入 `'java'`，`ignore` 纳入 `'target'`，`moduleRoots` 补充 Spring Boot 源根
- `src/graph/types.ts`：`NodeAttributes` 新增 `endpoint`（REST 端点元信息）等可选字段（如需）
- `package.json`：新增 `tree-sitter-java` 依赖
- 测试文件：新增 `java-parser` 单元测试 + Spring Boot 示例项目解析测试
- 文档：`README.md` 知识图谱子系统小节补充 Java/Spring Boot 支持

## Dependencies

- **依赖 `expand-multi-graph-storage`**：Java 图谱通过多图谱机制存入独立命名文件夹（如 `wpw/knowledge/graph/backend-springboot/`），与前端图谱隔离共存。存储分文件夹、`--name`/`--root`/`--graph` 参数、命名图谱列举由 multi-graph change 承担；本 change 只负责 Java 解析（产出图谱内容）。本 change 不引入 fullstack 合并图谱，不修复 `sniffProjectType`--多图谱下每次 `graph build --name <stack> --root <subdir>` 按 scan root 单栈嗅探。
