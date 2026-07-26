/**
 * JavaScript 源码解析器
 *
 * 复用 TypeScript 解析器逻辑，只是语言不同。
 * web-tree-sitter 的 JavaScript 语法解析结果结构与 TS 高度相似。
 */
import type { ParseResult } from './ts-parser';
import { parseTypeScriptFile as parseTs } from './ts-parser';
import { setParserLanguage } from './tree-sitter-loader';

/**
 * 解析 JavaScript 文件
 */
export async function parseJavaScriptFile(
  filePath: string,
  root: string,
  source: string,
): Promise<ParseResult> {
  // 切到 JavaScript 语言
  await setParserLanguage('javascript');

  // 复用 TS 解析逻辑（AST 结构类似）
  // 但调用前需要 parser 已经被设置为 javascript
  // 所以这里直接调用 parseTs 是不行的（它会设回 typescript）
  // 我们手动调用逻辑

  // 简单起见，直接复用解析逻辑，语言已经被设置为 javascript 了
  // 但 parseTs 内部会调用 setParserLanguage('typescript')，所以我们需要一个更底层的函数

  // 临时方案：直接用 parseTs 的逻辑，但语言参数传 javascript
  // 但 parseTs 里调用了 setParserLanguage(language)，所以传 javascript 即可
  return parseTs(filePath, root, source, 'javascript');
}
