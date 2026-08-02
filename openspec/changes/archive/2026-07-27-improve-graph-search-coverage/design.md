## Context

当前 `wpw graph` 的知识图谱检索在三个方面存在明显体验短板：

1. **中文检索质量差**：虽然已有 `CN_EN_MAP` 词典和 `lexBoost` 机制，但只是把中文查询翻译成英文去匹配节点名。由于节点向量完全基于英文标识符生成，中文查询在语义向量空间中找不到匹配，导致 `context` 命令下中文只能靠 name-match 捞到 1-2 个锚点，无法展开完整依赖链。英文 "register" 能展开 30 节点，中文 "注册" 只有 3 节点。

2. **重名函数无区分**：前端项目中大量页面都有 `onSubmit`、`validateField`、`handleConfirm` 等同名函数，搜索时三个结果分数一样，用户无法判断哪个属于哪个页面。L4 函数节点缺少文件上下文信息。

3. **Pinia actions 未索引**：`auth.js` 的 `register`/`login`/`logout` 等业务核心 action 完全没有进入图谱。Pinia store 是 Vue 项目中业务逻辑的核心承载层，缺失这一层导致业务需求 → 代码 的映射链断了一环。

## Goals / Non-Goals

**Goals:**
- 中文查询的 `context` 子图规模达到英文查询的 50% 以上
- 所有 L4 函数节点携带 `filePath` + `parentName`，搜索结果可去歧义
- Pinia store 的 actions/getters/state 纳入图谱并建立调用边
- 改动对现有功能向后兼容，英文检索质量不下降

**Non-Goals:**
- 不引入付费云 Embedding API（保持本地模型优先）
- 不做完整的中英文双语 Embedding 模型替换（成本过高），走"增强向量输入 + 词汇匹配扩展"的轻量路线
- 不实现 Setup store 的精细化类型推导（首版基于返回对象名的启发式识别即可）
- 不处理 Vuex / Redux 等其他状态管理（只做 Pinia）

## Decisions

### 决策 1：中文检索增强走「向量输入融合 + 词典扩充」路线，不替换 Embedding 模型

**选择**：不引入新的双语 Embedding 模型，而是通过两条轻量路径提升中文效果：
- **向量输入扩展**：生成节点向量时，输入文本从单纯的节点名扩展为 `filePath + parentName + nodeName + comment/jsDoc` 的拼接串。这样英文标识符周围的中文注释（JSDoc、行内注释）会被编码进向量，中文查询就能在语义空间中找到对应节点。
- **词典扩充 + 注释匹配**：扩充 `CN_EN_MAP` 到 100+ 词条；`lexBoost` 增加对节点注释/JSDoc/中文别名的匹配（权重 +0.08）。

**为什么不换双语模型**：
- 本地加载双语模型（如 bge-m3）体积更大、速度更慢，可能突破 300ms 性能预算
- 现有模型已经能用，通过输入侧融合中文信息成本更低
- 如果后续效果仍不达标，再考虑模型升级

**备选方案**：直接替换为 bge-m3 或其他多语言 embedding 模型。风险：模型体积 1-2GB，首次下载体验差，推理速度可能不达标。

### 决策 2：函数节点去歧义通过新增 `filePath`/`parentName` 属性实现

**选择**：在 `GraphNode` 类型上增加可选字段 `filePath` 和 `parentName`，解析时采集填充。展示时格式化为 `parentName/nodeName`（如 `RegisterView/onSubmit`）。排序时，`lexBoost` 的 parentName 匹配已能区分重名函数（见 semantic-search spec）。

**为什么不改节点唯一标识**：
- 节点 id 仍用 `filePath#symbolName`，不破坏现有边和索引
- 只是增加属性用于展示和排序，兼容所有现有查询

### 决策 3：Pinia 解析独立为一个 parser 模块，挂在 TS/JS parser 之后

**选择**：新增 `src/graph/parsers/pinia-parser.ts`，输入是已解析的 AST（或源码字符串 + 已提取的顶层声明），输出 pinia-store / pinia-action / pinia-getter / pinia-state 节点和内部 contain 边。
- 识别 `defineStore` 调用（Options API 风格：第二个参数是对象；Setup API 风格：第二个参数是函数）
- 对于 Options API，遍历 state 返回对象、actions 对象、getters 对象的键
- 对于 Setup API，从函数返回对象中提取键，根据变量定义处的包装函数（ref/reactive/computed）启发式判断类型

调用时机：在 TS/JS parser 提取完普通函数后，pinia-parser 再扫描一遍，识别到 store 时：
- 把属于 store action/getter 的函数从普通 L4 节点中「提升」为 pinia-action/pinia-getter 节点（避免重复）
- store 本身作为 L3 pinia-store 节点

组件 → action 调用边的建立：在现有 import 边构建流程后增加一步，扫描组件中 `xxxStore.someAction()` 的调用模式，匹配已索引的 pinia-action 节点建立 `calls` 边。

**备选方案**：在 Vue parser 中直接处理 store 调用。缺点是耦合度高，TS 文件中的 store 调用会漏掉。独立模块更清晰。

### 决策 4：向量输入文本格式

每个节点的 embedding 输入文本格式统一为：
```
<层级> <类型> <父节点名> <节点名> <文件路径> <注释/描述>
```
示例：
- `L4 pinia-action useAuthStore login src/stores/auth.js 用户登录认证，校验凭证并更新token`
- `L4 function RegisterView onSubmit src/views/RegisterView.vue 提交注册表单`

这样：
- 中文 JSDoc/注释直接编码进向量 → 中文查询能命中
- filePath / parentName 也参与向量 → 路径语义也能匹配
- 不改变向量维度和模型

## Risks / Trade-offs

| 风险 | 缓解措施 |
|---|---|
| 向量输入变长 → embedding 质量下降或耗时增加 | 控制文本长度（节点名 + 父名 + 路径 + 首行注释，总字符 ≤ 200）；长注释截断 |
| Pinia Setup 风格解析不准确（无法可靠判断返回值类型） | 首版启发式识别（看变量定义处是否用了 ref/reactive/computed），不确定的归为 state；后续可优化 |
| 扩充词典后 lexBoost 噪音增大（误匹配变多） | 注释匹配权重仅 +0.08，低于名称匹配；finalScore 仍有 1.0 上限；可通过评估用例校准 |
| 向量重建成本（全量重新 embedding） | 图谱全量构建时一次性生成；已存在的向量索引标记版本号，格式变更时触发重建 |
| 组件中 store 调用识别不全（解构、重命名等复杂模式） | 首版只覆盖 `storeName.actionName()` 直接调用模式；mapActions 支持；其余场景后续迭代 |

## Migration Plan

1. **节点类型扩展**：在 `graph/types.ts` 中新增 `pinia-store`/`pinia-action`/`pinia-getter`/`pinia-state` 类型，新增 `filePath`、`parentName` 可选字段——向后兼容，不影响旧数据加载。
2. **解析器扩展**：新增 pinia-parser，扩展 TS/Vue parser 的属性采集——不改变现有节点 id 格式。
3. **向量索引重建**：向量索引的 meta.json 增加 `schemaVersion` 字段，格式变更后版本号 +1，构建时检测到旧版本自动全量重建。
4. **词典扩充**：`CN_EN_MAP` 是纯数据变更，无迁移成本。
5. **回滚策略**：所有改动均可通过回退代码 + 重新 `wpw graph build` 恢复旧版图谱。

## Open Questions

1. **中文检索效果的量化标准**：50% 子图规模是粗略目标，是否需要建立一组标准评估用例（如 mapping-eval 的 ground-truth 形式）来衡量改进效果？
2. **Pinia store 调用识别的范围**：是否需要覆盖 TS 业务层文件中对 store 的调用（不止组件），还是首版只做组件层？
3. **词典扩充的来源**：手工维护 100 条 vs. 从项目代码的注释/JSDoc 中自动提取中英对照词对，哪种更高效？
