## Context

当前图谱系统对 Vue + Pinia 生态有深度的语义解析支持，但对其他广泛使用的前端技术栈覆盖不足。Vuex（Vue 2 生态）、Redux / Redux Toolkit（React 生态）、微信小程序、uni-app 等项目目前只能做语言级（JS/TS）的浅层解析，缺少状态管理语义、页面路由关系、组件引用关系等高价值图谱结构。

见 proposal.md 中的 Why 和 What Changes 部分。

## Goals / Non-Goals

**Goals:**
- 新增 4 套解析器（Vuex / Redux / 微信小程序 / uni-app），覆盖主流前端生态
- 新增节点类型纳入统一的 C/L1/L2/L3 层级体系，不引入新层级
- 新增边类型（navigate、use-component、bind-event、bind-data）扩展关系维度
- 保持现有构建流程架构不变，通过 source-parser 分发机制接入
- 自动嗅探 + 手动配置双模式，零配置即可识别项目类型
- 所有新增节点类型自动参与向量索引、语义检索、上下文生成

**Non-Goals:**
- 不引入新的 tree-sitter WASM 依赖（WXML 用正则/字符串解析首版）
- 不实现 wxss / scss / css 样式解析
- 不实现小程序自定义组件的 props 类型推导（只识别存在性）
- 不实现 Redux 的完整类型推断（只做结构识别，不做类型流分析）
- 不实现跨平台代码的语义等价性判断（条件编译只标记 platform 属性）
- 不修改 C 层能力解析和 business_map 算法（新节点自动参与现有流程）

## Decisions

### 决策 1：状态管理解析器复用 Pinia 的"增强解析"模式

**决定：** Vuex 和 Redux 解析器采用与 `pinia-parser.ts` 相同的架构模式——在 `source-parser.ts` 的主解析流程完成后，通过内容特征检测触发增强解析，解析结果（store/slice 节点 + 子元素节点）并入 ParseResult。

**理由：**
- 与现有 Pinia 解析架构一致，学习成本和维护成本低
- 状态管理代码本身也是 JS/TS 代码，主解析已经提取了函数/类，增强解析只做语义归类和补充
- 失败时可优雅降级（不影响基础解析结果）

**备选方案：** 做成独立的 parser 直接在 source-parser 的 switch 中分发。缺点是状态管理文件和普通 JS/TS 文件后缀相同，需要额外的文件识别层。

### 决策 2：微信小程序 WXML 采用正则解析而非 tree-sitter

**决定：** 首版 WXML 解析使用正则表达式 + 字符串扫描实现，不引入 tree-sitter-wxml WASM 依赖。

**理由：**
- WXML 语法相对简单（类 XML 结构 + {{ }} 绑定 + 指令），正则足以覆盖主要场景
- 引入新的 tree-sitter 语法包会增加包体积和启动时间
- 需求的核心是识别组件引用和事件绑定，不需要完整的 AST

**备选方案：** tree-sitter-wxml。如果后续需要更精确的模板结构分析，可以再升级。

### 决策 3：uni-app 采用"Vue 解析 + 后处理增强"模式

**决定：** uni-app 解析不在 source-parser 层面新增文件类型，而是：
1. 复用现有 Vue 解析器处理 `.vue` 文件
2. 通过独立的 `uniapp-parser.ts` 解析 `pages.json` / `manifest.json` 生成页面节点
3. 在 Vue 解析结果上叠加 uni-app 语义标记（生命周期、条件编译、uni API）

**理由：**
- uni-app 的核心语言就是 Vue，SFC 解析完全复用
- 增量主要在配置文件解析和语义标记，不是新语言
- 与 Vue 解析器解耦，Vue 解析器升级时不影响 uni-app 逻辑

### 决策 4：节点类型命名规范

**决定：** 新增节点类型统一采用 `前缀-实体名` 的命名规范：
- Vuex: `vuex-store`、`vuex-state`、`vuex-mutation`、`vuex-action`、`vuex-getter`
- Redux: `redux-slice`、`redux-state`、`redux-reducer`、`redux-action`、`redux-selector`
- 小程序: `mp-app`、`mp-page`、`mp-component`、`mp-method`、`mp-lifecycle`、`mp-data`、`mp-property`
- uni-app: `uni-page`

**理由：**
- 与现有 `pinia-store`、`pinia-action` 等命名风格一致
- 前缀表明所属技术生态，查询时可通过前缀模糊匹配
- 实体名保持语义清晰

### 决策 5：新增边类型

**决定：** 新增 4 种边类型：
- `navigate` — 页面跳转（源页面 → 目标页面），属性含 method（跳转方式）
- `use-component` — 组件引用（父页面/组件 → 子组件）
- `bind-event` — 事件绑定（模板 → 处理函数）
- `bind-data` — 数据绑定（模板 → data/property）

**理由：**
- 这些是小程序和 uni-app 图谱中最有价值的关系信息
- `navigate` 边使页面路由图可查询，对上下文生成中的"影响范围分析"很重要
- `use-component` 边补充了现有 import 边不能覆盖的模板组件引用关系

### 决策 6：配置设计

**决定：** 在 `graph.build` 配置下新增两个字段：
```yaml
graph:
  build:
    stateManagers: [pinia]      # 状态管理解析器，默认仅 pinia（向后兼容）
    frameworks: []              # 框架扩展，默认空数组（自动嗅探）
```

自动嗅探逻辑：
- 检测到 Vuex / Redux 特征 → 自动启用对应解析器
- 检测到小程序 / uni-app 项目 → 自动启用对应框架解析器
- 用户可手动指定以覆盖自动嗅探结果

**理由：**
- 默认值保持向后兼容（只开 Pinia）
- 自动嗅探降低使用门槛
- 手动配置提供精确控制

## Risks / Trade-offs

### 风险 1：Vuex / Redux 识别误报
[风险] 普通 JS/TS 文件中的对象或函数可能被误判为 Vuex/Redux 结构 → **缓解措施**：采用"目录特征 + 内容特征"双重校验（与 Pinia 的 isPiniaStoreFile 策略一致），降低误报率；解析失败时输出 warning 但不中断构建。

### 风险 2：WXML 正则解析的准确性
[风险] 复杂模板（嵌套、自定义指令、动态组件名）可能解析不完整 → **缓解措施**：首版聚焦核心信息（组件引用、事件绑定、数据绑定），复杂情况降级为部分识别，不报错；后续按需迭代升级到 tree-sitter。

### 风险 3：小程序 JS 中 Page()/Component() 调用的准确识别
[风险] 混淆的代码或非常规写法可能导致 Page/Component 识别失败 → **缓解措施**：先用 AST 查找调用表达式，再用正则兜底；识别失败的文件仍作为普通 file 节点存在。

### 风险 4：navigate 边的目标页面解析准确性
[风险] 跳转 URL 可能是变量（`wx.navigateTo({ url: someVar })`），无法静态解析 → **缓解措施**：只处理字符串字面量的 URL，变量 URL 跳过并计数；在统计输出中显示解析覆盖率。

### 风险 5：uni-app 条件编译的解析粒度
[风险] 条件编译块可能跨函数、跨组件，标记粒度难以精确 → **缓解措施**：首版只做文件级和函数级的 platform 标记，基于 `#ifdef` / `#endif` 的行范围识别函数所属平台。

### 权衡：解析深度 vs 实现复杂度
小程序 WXML 的解析深度（是否解析循环/条件渲染/模板引用）与实现复杂度正相关。首版聚焦组件引用和事件绑定，跳过 `wx:for`、`wx:if` 等指令的语义分析，这些在后续版本按需增强。

### 权衡：自动嗅探 vs 显式配置
自动嗅探方便但可能误判；显式配置准确但需要用户手动设置。采用"自动嗅探 + 配置可覆盖"的模式，兼顾便利和可控。

## Migration Plan

- **零破坏性变更**：所有新增内容都是增量的，现有节点类型和边类型不受影响
- 默认配置保持 `stateManagers: [pinia]`，Pinia 用户行为不变
- 小程序和 uni-app 解析仅在自动嗅探或显式配置时启用，默认不影响普通项目
- Schema 版本小版本号升级（如 3.1.0），因为是向后兼容的新增节点类型
- 用户升级后重新执行 `wpw graph build` 即可获得新节点

## Open Questions

1. **uni-app 的条件编译是否需要深入到 template 层？** 目前方案只处理 script 层的条件编译。WXML/模板层的 `<!-- #ifdef MP-WEIXIN -->` 也很常见，但解析复杂度更高。
2. **微信小程序的分包加载关系是否需要建模？** 即主包 → 分包的依赖边。对理解项目结构有价值，但实现成本不高。
3. **Redux 的 thunk / saga 中间件是否需要识别？** 异步 action 的识别对理解业务流程有帮助，但模式多样，复杂度较高。
4. **Vuex 的辅助函数（mapState / mapGetters / mapMutations / mapActions）是否全部支持？** 目前方案中包含 mapActions 和 mapMutations，mapState/mapGetters 只做节点引用识别还是建立具体的边？
