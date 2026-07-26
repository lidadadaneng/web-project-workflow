/**
 * Tree-sitter WASM 加载器
 *
 * 封装 web-tree-sitter 的初始化与语言包加载逻辑。
 * 懒加载：首次使用时才加载 WASM 模块与语言包。
 */
import type Parser from 'web-tree-sitter';

let parserInstance: Parser | null = null;
let tsModule: typeof Parser | null = null;
let languages: Record<string, Parser.Language> = {};
let loadingPromise: Promise<void> | null = null;

/**
 * 初始化 Tree-sitter（懒加载）
 *
 * 首次调用时加载 WASM 运行时，后续调用直接返回。
 */
export async function initTreeSitter(): Promise<typeof Parser> {
  if (tsModule) return tsModule;

  if (loadingPromise) {
    await loadingPromise;
    return tsModule!;
  }

  loadingPromise = (async () => {
    // 动态导入 web-tree-sitter
    const ParserMod = await import('web-tree-sitter');
    tsModule = ParserMod.default || ParserMod;

    // 初始化 WASM 运行时
    await tsModule.init();
  })();

  await loadingPromise;
  return tsModule!;
}

/**
 * 获取全局 Parser 实例（懒初始化）
 */
export async function getParser(): Promise<Parser> {
  if (parserInstance) return parserInstance;

  const ParserMod = await initTreeSitter();
  parserInstance = new ParserMod();
  return parserInstance;
}

/**
 * 加载语言包并返回 Language 实例
 *
 * @param lang 语言名（typescript / tsx / javascript）
 * @param wasmPath WASM 文件路径（可选，默认从 node_modules 查找）
 */
export async function loadLanguage(
  lang: 'typescript' | 'tsx' | 'javascript',
  wasmPath?: string,
): Promise<Parser.Language> {
  if (languages[lang]) return languages[lang];

  const ParserMod = await initTreeSitter();

  // web-tree-sitter 语言包的 WASM 文件通常在对应 npm 包中
  // 这里通过动态 require 的方式加载
  let wasm: Buffer | ArrayBuffer;

  if (wasmPath) {
    // 用户指定路径
    const fs = await import('fs');
    wasm = fs.readFileSync(wasmPath);
  } else {
    // 尝试从 npm 包加载
    try {
      const fs = await import('fs');
      switch (lang) {
        case 'typescript': {
          const tsPkg = require.resolve(
            'tree-sitter-typescript/tree-sitter-typescript.wasm',
          );
          wasm = fs.readFileSync(tsPkg);
          break;
        }
        case 'tsx': {
          const tsxPkg = require.resolve(
            'tree-sitter-typescript/tree-sitter-tsx.wasm',
          );
          wasm = fs.readFileSync(tsxPkg);
          break;
        }
        case 'javascript': {
          const jsPkg = require.resolve(
            'tree-sitter-javascript/tree-sitter-javascript.wasm',
          );
          wasm = fs.readFileSync(jsPkg);
          break;
        }
        default:
          throw new Error(`不支持的语言: ${lang}`);
      }
    } catch (e) {
      // 语言包未安装，抛出友好提示
      const pkgName = lang === 'tsx' ? 'tree-sitter-typescript' : `tree-sitter-${lang}`;
      throw new Error(
        `加载 ${lang} 语言包失败。请安装对应依赖：` +
          `\`npm i ${pkgName}\`。\n` +
          `原始错误: ${(e as Error).message}`,
      );
    }
  }

  const language = await ParserMod.Language.load(wasm);
  languages[lang] = language;
  return language;
}

/**
 * 设置 Parser 的语言
 */
export async function setParserLanguage(
  lang: 'typescript' | 'tsx' | 'javascript',
): Promise<Parser> {
  const parser = await getParser();
  const language = await loadLanguage(lang);
  parser.setLanguage(language);
  return parser;
}

/**
 * 清理资源（测试用）
 */
export function resetTreeSitter(): void {
  parserInstance = null;
  tsModule = null;
  languages = {};
  loadingPromise = null;
}
