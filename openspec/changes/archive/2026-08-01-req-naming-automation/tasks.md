## 1. CLI 层命名格式校验

- [x] 1.1 在 `src/lib/state.ts` 中实现 `validateChangeName(name)` 函数，校验 kebab-case 格式（小写字母+数字+短横线，首尾不能是短横线，不能有连续短横线，2-30 字符）
- [x] 1.2 在 `src/commands/new.ts` 中调用格式校验，不符合时输出错误提示并退出
- [x] 1.3 构建验证：TypeScript 编译通过

## 2. 需求节点中文 description 提取

- [x] 2.1 修改 `requirement-parser.ts` 的 `extractDocContent`，从 BRD 文档标题/一级标题提取中文简述
- [x] 2.2 将提取的中文描述存入 `attrs.description`（若提取失败则降级使用 name）
- [x] 2.3 验证：英文命名需求的节点 name 为英文、description 为中文

## 3. AI 层 BRD 命令重定义

- [x] 3.1 修改 `ai-layer/commands/wpw/brd.md`：命令签名从 `<需求名>` 改为 `<需求描述>`
- [x] 3.2 新增"需求命名生成"步骤：AI 根据描述生成英文 kebab-case 名称（命名规则、长度限制、domain-action 结构）
- [x] 3.3 新增"语义查重"步骤：调用 `wpw graph search` 检索 L1 节点，按阈值分级处理（>=0.85 报错终止，0.7~0.85 警告继续）
- [x] 3.4 冷启动处理：图谱不存在时跳过语义查重，只做精确查重

## 4. AI 层全局英文检索强制规范

- [x] 4.1 修改 `ai-layer/commands/wpw/map.md`：所有搜索示例改为英文检索词，新增"英文检索词为强制规范"的说明
- [x] 4.2 修改 `ai-layer/skills/wpw-workflow/SKILL.md`：所有 graph search/context 示例改为英文，新增"必须使用英文检索词"的强制规则条目
- [x] 4.3 修改 `ai-layer/commands/wpw/brd.md`：成本估算阶段调用 graph context 时使用英文关键词
- [x] 4.4 修改 `ai-layer/commands/wpw/explore.md`：探索阶段调用 graph context 时使用英文关键词
- [x] 4.5 修改 `ai-layer/commands/wpw/design.md`：设计阶段调用 graph context 时使用英文关键词
- [x] 4.6 修改 `ai-layer/commands/wpw/plan.md`：计划阶段调用 graph context 时使用英文关键词
- [x] 4.7 修改 `ai-layer/commands/wpw/apply.md`：编码阶段调用 graph context 时使用英文关键词
- [x] 4.8 修改 `ai-layer/commands/wpw/cr.md`：Code Review 阶段 graph context 使用英文（anchors 模式除外）

## 5. 验证与测试

- [x] 5.1 TypeScript 编译通过
- [x] 5.2 验证 kebab-case 校验：合法名通过、中文名/空格/大写均被拒绝
- [x] 5.3 验证英文命名需求节点：name 为英文，description 为中文
- [x] 5.4 验证描述提取：BRD 标题能正确提取为 description
- [x] 5.5 验证向后兼容：历史中文命名需求解析正常
