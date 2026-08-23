# 论文图表生成 Skill

## 适用范围

本规则用于本论文及后续论文图表的设计、生成、插入和验收。默认产出包括：

- 可编辑的 Visio 源文件（`.vsdx`）；
- 与论文编排兼容的 PNG 预览图；
- Markdown、LaTeX 或 DOCX 中的正式插图及图注；
- 本目录下可复现的生成脚本。

## 标准 SOP

### 1. 读取上下文

先读取目标章节、图表清单、相邻图表说明和论文模板。明确该图回答的唯一问题、输入输出关系、层级关系和需要保留的专业术语。总图只表达总体结构，局部算法、字段定义和详细流程留给后续图表。

### 2. 确定图意和版式

- 论文总体架构优先采用分层架构图、流程闭环图或数据流图。
- 先画外部层级边界，再放层标题、模块和箭头。
- 同一层的元素应组成一个视觉组，整体水平居中。
- 层标题与虚线框顶部保持统一间距，建议以同一基线或同一相对偏移量放置。
- 说明文字不得贴边、压线或落在模块框上；说明文字与块元素之间保留明确空隙。
- 所有边界、模块和箭头应保留足够的安全边距，避免第一块元素与外框形成重合双线。

### 3. 配色与字体

- 学位论文架构图默认使用白底、黑灰细线和灰色虚线边界。
- 非必要不使用彩色填充；若必须强调，仅使用一种低饱和强调色，并保持论文整体一致。
- 中文默认使用宋体或论文模板指定字体，英文字体与中文风格保持协调。
- 文字优先保证清晰可读。若放不下，依次采用：扩大模块、缩短标签、减少换行、适当缩小字号；不得通过过度压缩或贴边解决。
- 重要图谱、核心模型和关键路径应比普通说明文字更醒目，但不能制造文字重叠。

### 4. Visio 生成

使用 Visio COM 自动化时：

- 页面尺寸先确定，再创建图形；生成脚本必须显式设置页面宽高。
- 使用 `CellsU($name).FormulaU` 访问 Visio 单元格，兼容 PowerShell 7 的 COM 参数化属性。
- 使用 Windows PowerShell 5.1 执行 Visio 脚本，避免不同 PowerShell 版本在中文无 BOM 脚本上的解析差异。
- 设置 `$visio.Visible = $false` 和 `$visio.AlertResponse = 7`，避免保存或关闭时弹出隐藏对话框。
- 页面、文档和 Visio 应用对象在结束时按页面 -> 文档 -> 应用的顺序释放；最后执行垃圾回收，确认没有残留 `VISIO.EXE`。
- 不使用无效的页面单元格名称；例如页面对象不设置 `PageLineColor` 和 `PageLineWeight`。
- 文本框和模块框必须分别控制字号、宽度和高度。文字字号放大时同步检查内部换行和相邻元素。

### 5. 论文插入

- Markdown：在正文对应段落后插入相对路径图片，并保留可编辑源文件说明。
- LaTeX：将 PNG 复制到模板 `images` 目录，使用 `figure` 环境、`\centering`、合适的 `width`、`\caption` 和 `\label`。
- DOCX：优先使用行内图片，不使用浮动锚定；图片单独成段居中，图注紧跟图片后并居中。
- 图片内不重复放置论文图题；图题统一由论文编排系统生成。
- 图注名称、编号和正文引用必须一致，不能同时保留“成稿时绘制”等占位说明。

### 6. 验收

生成后必须完成以下检查：

1. 打开或解析 `.vsdx`，确认文件存在且可读取；
2. 导出 PNG 并进行 100% 视觉检查；
3. 检查文字是否裁切、重叠、换行过多或字号不清晰；
4. 检查虚线框标题距离是否统一，元素是否居中，箭头是否指向正确；
5. 检查论文正文中的图片、图注、编号和引用；
6. DOCX 必须使用文档渲染器导出页面 PNG 后检查；LaTeX 必须编译或至少检查图片路径和 `figure` 结构；
7. 最终目录只保留正式源文件、预览图、生成脚本和本规则，不保留测试图或临时 Visio 文件。

## 本次踩过的坑

### Visio COM 与 PowerShell

- Windows PowerShell 5.1 读取无 BOM 的 UTF-8 中文脚本时可能出现“字符串未结束”等假解析错误；脚本应写入 UTF-8 BOM，或使用明确的 Windows PowerShell 宿主。
- PowerShell 7 中 `$shape.CellsU.Item($name)` 对某些 COM 参数化属性会失败，应使用 `$shape.CellsU($name)`。
- Visio 保存后若仍持有页面或形状 COM 引用，`Document.Close()` 可能长时间阻塞；必须先释放页面引用，再关闭文档和应用。
- 隐藏 Visio 在 `SaveAs` 或 `Export` 时可能等待对话框；设置 `AlertResponse` 并检查是否残留 `VISIO.EXE`。

### 版式与文字

- 仅放大字号会导致长标签自动换行并与说明文字重叠；应同时缩短核心标签或扩大模块宽度。
- 左侧层级标签宽度不足时，三字标签会被拆成三行；应扩大文本框宽度并控制字号。
- 第一块模块过于靠近虚线框左边界时，模块边线和外框线会视觉重合；保留至少一个箭头或半个模块高度的安全间距。
- 层标题不能按内容临时摆放，应统一相对于各自虚线框顶部的偏移。
- 图内标题会与论文外部图注重复；论文正式插图不在图片内部绘制图题。
- 说明文字必须与模块留出空白，不能把说明文字放到模块底边或箭头线上。

## 当前实现

### 图 3-1 方法总体框架

- 生成脚本：`F:\project\web-project-workflow\scripts\generate-chapter3-architecture.ps1`
- Visio 源文件：`F:\project\web-project-workflow\论文\图表\图3-1-方法总体框架.vsdx`
- PNG 预览：`F:\project\web-project-workflow\论文\图表\图3-1-方法总体框架.png`
- 图 3-2 脚本：`F:\project\web-project-workflow\scripts\generate-chapter3-figure32.ps1`
- 图 3-2 Visio：`F:\project\web-project-workflow\论文\图表\图3-2-六阶段流程约束架构.vsdx`
- 图 3-2 PNG：`F:\project\web-project-workflow\论文\图表\图3-2-六阶段流程约束架构.png`
- 位置：第 3.1.1 节 / LaTeX `fig3-1-context-engineering-framework.png`

### 图 3-2 六阶段流程约束架构

- **最终版**（三层分区式，已插入论文）：
  - Visio 源文件：`F:\project\web-project-workflow\论文\图表\图3-2-六阶段流程约束架构.vsdx`
  - PNG 预览：`F:\project\web-project-workflow\论文\图表\图3-2-六阶段流程约束架构.png`
  - 生成脚本：`F:\project\web-project-workflow\scripts\generate-chapter3-figure32.ps1`
  - 结构：三层分区（系统控制与门禁 / 六阶段流程主链 / 制品沉淀与知识反馈），主链 BRD→PRD→（Explore 可选·拍板门禁）→Design→Plan→Test→Apply，通过"制品与上下文"竖线连接下层阶段制品 / 上下文生成 / 代码交付 / 需求归档，再由归档反馈虚线回流 Apply 阶段。
  - 位置：第 3.2.3 节末尾
  - LaTeX 文件：`images/fig3-2-context-constrained-workflow.png`（英文文件名，避免 XeLaTeX 中文路径问题）
- 早期备选版（每阶段挂三段式契约格，偏具象重复，弃用）：
  - `generate-ch3-fig2-process-framework.ps1` / `图3-2-六阶段流程约束架构.vsdx` / `图3-2-六阶段流程约束架构.png`

### 通用约定

后续生成图表时，先阅读本文件，再复用现有脚本中的 COM 初始化、文本样式、虚线框、模块框、椭圆和箭头辅助函数，并按本 SOP 完成生成和视觉验收。脚本以 UTF-8 BOM 保存，避免 Windows PowerShell 5.1 中文解析出错。

**插入三轨道方式**：
- **md**：在正文对应段落后插入 `![图3-x 图名](图表/图3-x-图名.png)` 紧跟一行图注说明。
- **docx**：找到 `u图标题` 样式的占位段，`insert_paragraph_before` 加居中图片（`width=Inches(6.0)`，保留 `u图标题` 段改正式图题。
- **LaTeX**：`build_latex.py` 的 `emit_blocks` 已支持 `![alt](path)` 图片语法自动生成 `figure` 环境（`0.95\textwidth`，图片 PNG 复制到 `images/` 目录，文件名即 label。
