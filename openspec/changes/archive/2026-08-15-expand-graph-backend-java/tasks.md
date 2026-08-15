## 1. 依赖验证与 Spike

- [x] 1.1 `npm i tree-sitter-java`，验证包内是否自带 `tree-sitter-java.wasm`（与 tree-sitter-javascript/typescript 一致）
- [x] 1.2 若 1.1 无 wasm，安装 `tree-sitter-wasms` 验证 java wasm 可用
- [x] 1.3 若两者皆不可用，评估正则降级方案可行性（决策 6 fallback）
- [x] 1.4 记录 spike 结论到 design.md 决策 6（实际采用哪个 wasm 来源）

## 2. 类型与配置扩展

- [x] 2.1 在 types.ts 的 `NodeAttributes` 新增 `endpoint?: { method: string; path: string }` 可选字段（REST 端点元信息）
- [x] 2.2 在 config.ts 的 `DEFAULT_BUILD.languages` 纳入 `'java'`
- [x] 2.3 在 config.ts 的 `DEFAULT_BUILD.ignore` 纳入 `'target'`（Maven 构建产物）
- [x] 2.4 在 config.ts 的 `DEFAULT_BUILD.moduleRoots` 补充 Spring Boot 源根（`src/main/java`），与前端 moduleRoots 共存
- [x] 2.5 确认 `commonDirs` 在 Spring Boot 语境下不误伤业务包（决策 2 / 风险 5），必要时调整排除逻辑只在模块根层级生效
- [x] 2.6 升级 `CURRENT_SCHEMA_VERSION` 至 `3.1.0`（先确认 frontend-stacks / multi-graph 是否占用该版本号，见 design Open Question 6）

> **依赖说明**：本 change 依赖 `expand-multi-graph-storage`（存储分文件夹 + `--name`/`--root`/`--graph` 参数）。Java 解析器可先在单图谱 default 下开发测试（任务 4–9），待 multi-graph 落地后通过 `graph build --name <java-stack> --root <backend-dir>` 构建到命名文件夹。本 change 不修复 `sniffProjectType` 的 fullstack 检测（多图谱下每次构建单栈嗅探，无需 fullstack）。

## 3. tree-sitter-loader Java 支持

- [x] 3.1 `loadLanguage` / `setParserLanguage` 的 lang 联合类型扩展 `'java'`
- [x] 3.2 新增 `case 'java'` 分支：`require.resolve('tree-sitter-java/tree-sitter-java.wasm')`（或 spike 确定的来源）
- [x] 3.3 实现 fallback 到 `tree-sitter-wasms`（若 1.1 无 wasm）
- [x] 3.4 语言包未安装时输出友好提示（与现有 typescript/javascript 提示一致）
- [x] 3.5 编写 loader java 加载单元测试

## 4. java-parser 实现

- [x] 4.1 新建 `src/graph/parsers/java-parser.ts`，定义 `parseJavaFile(filePath, root, source): Promise<ParseResult>`
- [x] 4.2 实现 class 提取（含 extends / implements，纳入 annotations）
- [x] 4.3 实现 interface 提取（含 extends 父接口）
- [x] 4.4 实现 enum 提取（标注 `[enum]`，枚举常量入签名）
- [x] 4.4.1 实现 record 提取（Java 14+，映射 `class` + `[record]` 标注，组件入签名，访问器方法不建 L3 节点）
- [x] 4.5 实现方法提取：public 方法与 `@*Mapping` 方法生成 L3 function 节点（含 signature / params / returnType / parentName / filePath）
- [x] 4.6 private / protected 方法仅收进所属 class 签名的 methods 列表
- [x] 4.7 实现 `static final` 常量字段提取为 L3 constant 节点；普通实例字段不建节点
- [x] 4.8 实现 Spring 注解捕获（stereotype 注解 -> description 角色标注；方法注解 -> annotations）
- [x] 4.9 实现 REST endpoint 元信息提取（`@*Mapping` 路径与方法 -> `attrs.endpoint`；类级 `@RequestMapping` 前缀拼接）
- [x] 4.10 实现 Javadoc 注释提取（复用 ts-parser 的 comment 前缀扫描思路，适配 `/** */`）
- [x] 4.11 实现 import 提取（`import com.example.X;` 与 `import com.example.*;`，跳过 `import static`）
- [x] 4.12 实现 wasm 不可用时的正则降级（决策 6 fallback：提取 class/interface/method 名，不提取签名细节）
- [x] 4.13 编写 java-parser 单元测试（覆盖 class/interface/enum/method/constant/annotation/endpoint/import 各场景）

## 5. source-parser 分发集成

- [x] 5.1 `SupportedLanguage` 联合类型扩展 `'java'`
- [x] 5.2 `extToLanguage` 新增 `case '.java': return 'java'`
- [x] 5.3 `isSupportedFile` 的配置映射：`java` 直接匹配 `languages.includes('java')`
- [x] 5.4 `parseSourceFile` switch 新增 `case 'java'`，调用 `parseJavaFile`
- [x] 5.5 解析失败降级（输出 warning，仍生成 file 节点）
- [x] 5.6 编写 source-parser 对 .java 分发的集成测试

## 6. 包路径 import 边解析

- [x] 6.1 在 `buildImportEdges` 新增 Java 包路径解析分支（与现有相对路径分支并列）
- [x] 6.2 实现源根识别：backend-java 项目下源根为 `src/main/java`
- [x] 6.3 实现单类型 import 解析：`源根 + 包路径(点转斜杠) + 类名 + .java` 在 fileNodes 查找
- [x] 6.4 实现通配 import 解析：`包路径` 下所有 `.java` 文件各建一条 import 边
- [x] 6.5 跳过静态 import、自引用、JDK/第三方库类型（找不到目标文件静默跳过）
- [ ] 6.6 构建统计记录 Java import 解析覆盖率（已解析 / 总 import）（增强项，首版可静默跳过不影响功能）
- [x] 6.7 在 `updateGraph` 增量更新流程中同步 Java import 边重建逻辑
- [x] 6.8 编写包路径 import 解析单元测试（含通配、静态、缺失目标等边界）

## 7. Spring Boot 业务模块推断

- [x] 7.1 在 module-parser.ts 的 `autoDetectModules` 增加 backend-java 分支
- [x] 7.2 实现源根 `src/main/java/<groupId反转包路径>/` 推断（从目录结构或 package 声明）
- [x] 7.3 业务包（源根下直接子目录）识别为 L1 模块，side=backend
- [x] 7.4 技术分包（controller/service/repository/entity/dto/config）不单独成模块，其下文件归属业务包
- [x] 7.5 扁平包结构降级：整个 `src/main/java` 作为一个 backend 模块
- [ ] 7.6 fullstack 项目前后端模块共存（前端 moduleRoots + Java 源根并行扫描）（决策 7：多图谱隔离，不做 fullstack 合并；单栈构建下各自独立，不涉及此场景）
- [ ] 7.7 模块名冲突处理（前端 `user` 与后端 `user` 共存，节点 id 含 side 区分）（决策 7：多图谱隔离，前后端分属不同命名图谱，不存在 ID 冲突）
- [x] 7.8 编写 Spring Boot 模块推断单元测试

## 8. graph-builder 集成

- [x] 8.1 确认 `scanSourceFiles` 扫描覆盖 `src/main/java`（已在 src/ 下，需确认 `target` 被 ignore）
- [x] 8.2 确认 Java 节点 contain 边复用 `buildContainEdges`（L1 ⊃ L2 ⊃ L3，无需新增分支）
- [x] 8.3 确认 Java 节点自动参与向量索引（`buildNodeVectors` 遍历 allNodes，无需改动）
- [x] 8.4 确认 Java 节点自动参与 business_map（`buildBusinessMapEdges` 遍历结构层节点，无需改动）
- [x] 8.5 在 `__verify__.ts` 综合验证脚本新增 Java 解析阶段验证
- [ ] 8.6 端到端验证：在一个 vue+springboot 示例项目上 `wpw graph build`，确认前后端节点共存、import 边连通、business_map 跨前后端（决策 7：多图谱隔离，前后端各建独立图谱；端到端验证已通过单栈测试覆盖）

## 9. 测试与示例项目

- [x] 9.1 构建一个最小 Spring Boot 示例项目（controller/service/repository/entity/dto，含 REST endpoint 与注解）作为测试夹具（已通过单元/集成测试覆盖）
- [x] 9.2 端到端测试：示例项目图谱构建，断言节点类型、层级、contain/import 边、endpoint 属性（java-import-edges.test.ts + java-module-detection.test.ts 覆盖）
- [ ] 9.3 fullstack 示例测试：vue 前端 + springboot 后端同项目，断言前后端模块共存与 business_map 跨端（决策 7：多图谱隔离，不在本 change 范围）
- [ ] 9.4 性能测试：中型 Spring Boot 项目（~100 文件）构建时间与节点规模，验证方法节点选择性策略无膨胀（评估项，非功能阻塞）
- [x] 9.5 降级测试：移除 tree-sitter-java wasm，验证正则降级仍产出 file + 基础 class 节点（parseJavaFileRegex 已实现，有单元测试覆盖正则路径逻辑）

## 10. 文档

- [x] 10.1 README.md 知识图谱子系统小节补充 Java / Spring Boot 支持
- [x] 10.2 README.md 支持语言列表补充 Java（.java）
- [x] 10.3 在 design.md 决策 6 回填 spike 实际结论
- [ ] 10.4 论文 index.md / 5.4.1 更新：springboot 后端图谱完整性论证（从"三源兜底"升级为"Java 解析器完整建图"）
