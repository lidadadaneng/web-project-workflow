## Purpose

Java / Spring Boot 源码的图谱索引能力。负责基于 tree-sitter-java 解析 `.java` 文件，提取类型（class / interface / enum）、方法、字段、注解节点，按选择性策略生成方法级 L3 节点，捕获 Spring 注解与 REST endpoint 元信息，为 Spring Boot 后端项目产出结构化知识图谱。

## ADDED Requirements

### Requirement: Java 文件解析
源码解析器 SHALL 支持 Java 文件（`.java`），使用 tree-sitter-java 解析，提取 class、interface、enum、method、field 等代码元素，生成对应的 L2 文件节点与 L3 元素节点。

#### Scenario: class 解析
- **WHEN** 解析 `.java` 文件，存在 `public class UserService { ... }` 声明
- **THEN** 生成 L3 级别的 class 节点（类型 `class`）
- **AND** 节点名 = 类名（如 `UserService`）
- **AND** 节点携带 `filePath` 属性
- **AND** `extends` 父类与 `implements` 接口纳入 `annotations` 属性

#### Scenario: interface 解析
- **WHEN** 解析 `.java` 文件，存在 `public interface UserService { ... }` 声明
- **THEN** 生成 L3 级别的 interface 节点（类型 `interface`）
- **AND** `extends` 的父接口纳入 `annotations` 属性

#### Scenario: enum 解析
- **WHEN** 解析 `.java` 文件，存在 `public enum OrderStatus { ... }` 声明
- **THEN** 生成 L3 级别的 enum 节点（类型 `class`，`annotations` 标注 `[enum]`）
- **AND** 枚举常量纳入节点签名

#### Scenario: record 解析
- **WHEN** 解析 `.java` 文件，存在 `public record Food(String name, double price) {}` 声明（Java 14+）
- **THEN** 生成 L3 级别的 record 节点（类型 `class`，`annotations` 标注 `[record]`）
- **AND** record 组件（`name`、`price`）纳入节点签名
- **AND** record 的访问器方法不单独生成 L3 节点（编译期合成，源码无定义）

#### Scenario: 文件节点生成
- **WHEN** 解析任意 `.java` 文件
- **THEN** 生成 L2 级别的 file 节点（类型 `file`）
- **AND** `attrs.language` 为 `java`
- **AND** `attrs.filePath` 为相对项目根的路径
- **AND** `attrs.fileHash` 为内容 SHA-256 前 16 位

#### Scenario: 无 Java 文件时不触发
- **WHEN** 项目不含任何 `.java` 文件
- **THEN** 不触发 Java 解析
- **AND** 现有前端解析行为不受影响

### Requirement: 方法级 L3 节点选择性生成
解析器 SHALL 对 Java 类的 public 方法、以及带 `@*Mapping` 注解（`@GetMapping` / `@PostMapping` / `@PutMapping` / `@DeleteMapping` / `@RequestMapping`）的方法生成独立 L3 节点（类型 `function`，`parentName` = 类名）。private / protected 方法仅收进类签名的 methods 列表，不生成 L3 节点。

#### Scenario: public 方法生成 L3 节点
- **WHEN** 类 `UserService` 含 `public User findById(Long id)` 方法
- **THEN** 生成 L3 级别的 function 节点
- **AND** 节点名 = `findById`，`parentName` = `UserService`
- **AND** 节点携带 `signature`、`params`、`returnType`、`filePath` 属性

#### Scenario: REST endpoint 方法生成 L3 节点
- **WHEN** 类 `FoodController` 含 `@GetMapping("/api/food") public List<Food> list()` 方法
- **THEN** 生成 L3 级别的 function 节点
- **AND** `attrs.annotations` 含 `GetMapping`
- **AND** `attrs.endpoint` 为 `{ method: 'GET', path: '/api/food' }`

#### Scenario: private 方法不生成 L3 节点
- **WHEN** 类含 `private void validate(Food food)` 方法
- **THEN** 不生成独立 L3 节点
- **AND** 方法名收进所属 class 节点的签名 methods 列表

#### Scenario: interface 默认方法与抽象方法
- **WHEN** interface 含 `default void log() { ... }` 或抽象方法 `User find(Long id);`
- **THEN** public 方法生成 L3 节点
- **AND** abstract 方法（interface 中无方法体）也生成 L3 节点

### Requirement: 字段与常量提取
解析器 SHALL 提取 Java 类的 `static final` 常量字段生成 L3 常量节点；普通实例字段不生成独立节点，仅作为类结构信息。

#### Scenario: 常量字段生成 L3 节点
- **WHEN** 类含 `public static final int MAX_SIZE = 100;`
- **THEN** 生成 L3 级别的 constant 节点
- **AND** 节点名 = `MAX_SIZE`

#### Scenario: 普通实例字段不生成节点
- **WHEN** 类含 `private String name;` 实例字段
- **THEN** 不生成独立 L3 节点
- **AND** 字段信息不纳入图谱（首版不建模字段级依赖）

### Requirement: Spring 注解捕获
解析器 SHALL 捕获 Java 声明上的 Spring 注解，纳入节点 `annotations` 属性；带 stereotype 注解的类 SHALL 在 `description` 属性标注角色。

#### Scenario: stereotype 注解捕获
- **WHEN** 类带 `@RestController` / `@Service` / `@Repository` / `@Component` / `@Configuration` / `@Entity` 注解
- **THEN** 注解名纳入 class 节点的 `annotations` 属性
- **AND** `description` 属性标注角色（如 `@RestController` -> "REST 控制器"，`@Service` -> "业务服务"，`@Entity` -> "JPA 实体"）

#### Scenario: 方法注解捕获
- **WHEN** 方法带 `@GetMapping` / `@PostMapping` / `@Scheduled` / `@EventListener` 等注解
- **THEN** 注解名纳入方法节点的 `annotations` 属性

#### Scenario: 字段注解捕获
- **WHEN** 字段带 `@Autowired` / `@Resource` / `@Id` / `@Column` 等注解
- **THEN** 注解名纳入所属类节点的结构信息（首版不建独立字段节点，注解仅记录）

### Requirement: REST endpoint 元信息提取
解析器 SHALL 从 `@*Mapping` 注解中提取 HTTP 方法与路径，存入方法节点的 `endpoint` 属性。

#### Scenario: 路径与方法提取
- **WHEN** 方法带 `@PostMapping("/api/food")`
- **THEN** 方法节点 `attrs.endpoint` 为 `{ method: 'POST', path: '/api/food' }`

#### Scenario: 类级 @RequestMapping 前缀
- **WHEN** 类带 `@RequestMapping("/api/food")`，方法带 `@GetMapping("/{id}")`
- **THEN** 方法 `attrs.endpoint.path` 拼接类级前缀为 `/api/food/{id}`

#### Scenario: 无路径注解的方法
- **WHEN** public 方法不带任何 `@*Mapping` 注解
- **THEN** 不生成 `endpoint` 属性
- **AND** 仍生成 L3 function 节点（因 public）

### Requirement: tree-sitter-java WASM 加载
tree-sitter-loader SHALL 支持加载 Java 语言包。语言包来源 SHALL 优先取 `tree-sitter-java` npm 包自带的 `tree-sitter-java.wasm`；若该包不带 wasm，SHALL fallback 到 `tree-sitter-wasms` 社区包；两者皆不可用时 SHALL 降级为正则解析并输出警告。

#### Scenario: 优先加载 tree-sitter-java 自带 wasm
- **WHEN** `tree-sitter-java` 包含 `tree-sitter-java.wasm`
- **THEN** loader 通过 `require.resolve('tree-sitter-java/tree-sitter-java.wasm')` 加载
- **AND** Java 文件按 AST 解析

#### Scenario: fallback 到 tree-sitter-wasms
- **WHEN** `tree-sitter-java` 不含 wasm，但 `tree-sitter-wasms` 已安装
- **THEN** loader 从 `tree-sitter-wasms` 加载 java wasm
- **AND** 解析行为与上一场景一致

#### Scenario: wasm 不可用时降级
- **WHEN** 两个 wasm 来源均不可用
- **THEN** 输出警告提示 Java AST 解析不可用
- **AND** 降级为正则解析（提取 class/interface/method 名，不提取签名细节）
- **AND** 仍生成 file 节点与基础 class 节点，保证文件级图谱完整

### Requirement: Java 节点参与向量与语义检索
Java 相关节点（file / class / interface / enum / method / constant）SHALL 参与向量索引构建与语义检索。method 节点的向量文本 SHALL 包含类名 + 方法名 + 签名 + Javadoc 注释（如有）。

#### Scenario: Java 节点生成向量
- **WHEN** 执行 `wpw graph build` 且 embedding 开启
- **THEN** Java 的 file / class / interface / method / constant 节点均生成向量
- **AND** 向量索引 mapping 包含这些节点 id

#### Scenario: 中文语义可命中 Java 方法
- **WHEN** 搜索"推荐美食"，存在 `FoodController.recommend` 方法且其 Javadoc 含"推荐"
- **THEN** 该方法节点出现在搜索结果中

#### Scenario: Java 节点参与 business_map
- **WHEN** 构建业务映射
- **THEN** Java 的 class / method / file 节点作为 business_map 候选目标
- **AND** 与前端节点同等参与 doc-extract / name-match / semantic / git-history 四源融合
