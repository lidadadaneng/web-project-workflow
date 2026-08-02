/**
 * TypeScript / JavaScript 源码解析器
 *
 * 基于 web-tree-sitter 解析 TS/JS 文件，提取：
 * - 文件节点（L2）
 * - 元素节点（L3）：函数、类、接口、常量
 * - import 信息（用于生成 import 边）
 */
import * as path from 'path';
import type { GraphNode } from '../types';
import {
  NODE_TYPE_FUNCTION,
  NODE_TYPE_CLASS,
  NODE_TYPE_INTERFACE,
  NODE_TYPE_CONSTANT,
  NODE_TYPE_COMPONENT,
} from '../types';
import { generateNodeId } from '../builders/node-builder';
import { setParserLanguage } from './tree-sitter-loader';

/** 解析结果 */
export interface ParseResult {
  /** 文件节点 */
  fileNode: GraphNode;
  /** 元素节点列表（L3） */
  elements: GraphNode[];
  /** Pinia store 节点列表（L2，可选） */
  piniaStores?: GraphNode[];
  /** import 目标（相对路径或模块名），用于生成 import 边 */
  imports: string[];
}

/** 解析 TypeScript / TSX / JavaScript / JSX 文件 */
export async function parseTypeScriptFile(
  filePath: string,
  root: string,
  source: string,
  language: 'typescript' | 'tsx' | 'javascript',
): Promise<ParseResult> {
  const parser = await setParserLanguage(language);
  const tree = parser.parse(source);
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath);

  const elements: GraphNode[] = [];
  const imports: string[] = [];

  // 遍历顶层节点
  const rootNode = tree.rootNode;
  const cursor = rootNode.walk();

  traverseTopLevel(rootNode, source, relPath, elements, imports);

  // 判断是否为 React 组件文件（tsx/jsx 且有组件定义）
  const isComponentFile =
    (filePath.endsWith('.tsx') || filePath.endsWith('.jsx')) &&
    elements.some((e) => e.type === NODE_TYPE_FUNCTION && isComponentName(e.name));

  // 文件节点
  const fileNode: GraphNode = {
    id: generateNodeId('file', [relPath]),
    level: 'L3',
    type: 'file',
    name: fileName,
    attrs: {
      filePath: relPath,
      language,
      fileHash: quickHash(source),
      description: isComponentFile ? 'React 组件文件' : undefined,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 元素节点继承所属文件路径（供语义检索 embedding 富化与词汇加权区分同名义函数）
  const fileBaseName = path.basename(fileName, path.extname(fileName));
  for (const el of elements) {
    el.attrs.filePath = relPath;
    // 顶层元素的 parentName 设为文件名（去重名歧义）；类方法等已在提取时设置了 parentName
    if (!el.attrs.parentName) {
      el.attrs.parentName = fileBaseName;
    }
  }

  return { fileNode, elements, imports };
}

// ==================== 顶层节点遍历 ====================

function traverseTopLevel(
  node: any,
  source: string,
  filePath: string,
  elements: GraphNode[],
  imports: string[],
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;

    switch (child.type) {
      case 'import_statement':
        extractImport(child, source, imports);
        break;

      case 'function_declaration':
        elements.push(extractFunction(child, source, filePath, null));
        break;

      case 'class_declaration':
        elements.push(extractClass(child, source, filePath));
        break;

      case 'interface_declaration':
        elements.push(extractInterface(child, source, filePath));
        break;

      case 'type_alias_declaration':
        // type 别名也提取，归入 interface 类型
        elements.push(extractTypeAlias(child, source, filePath));
        break;

      case 'lexical_declaration':
      case 'variable_declaration':
        extractConstants(child, source, filePath, elements);
        break;

      case 'export_statement':
      case 'export_declaration':
        // 导出语句，递归处理里面的声明
        extractExport(child, source, filePath, elements, imports);
        break;

      case 'internal_module': // namespace
      case 'module':
        // 命名空间/模块声明，跳过内部细节
        break;

      default:
        // 其他顶层节点忽略
        break;
    }
  }
}

// ==================== 导入提取 ====================

function extractImport(node: any, source: string, imports: string[]): void {
  // 找 import_source（字符串字面量）
  const sourceNode = node.childForFieldName('source');
  if (sourceNode) {
    const moduleName = sourceNode.text.slice(1, -1); // 去掉引号
    imports.push(moduleName);
  }
}

// ==================== 函数提取 ====================

function extractFunction(
  node: any,
  source: string,
  filePath: string,
  parentName: string | null,
): GraphNode {
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? '<anonymous>';

  // 参数
  const params: Array<{ name: string; type?: string }> = [];
  const paramsNode = node.childForFieldName('parameters');
  if (paramsNode) {
    for (let i = 0; i < paramsNode.namedChildCount; i++) {
      const param = paramsNode.namedChild(i);
      if (!param) continue;
      const paramName = param.childForFieldName('name')?.text ?? param.text;
      let paramType = param.childForFieldName('type')?.text;
      // type_annotation 节点文本包含冒号前缀（如 ": string"），需要去掉
      if (paramType) {
        paramType = paramType.replace(/^:\s*/, '').trim();
      }
      if (paramName && paramName !== '...') {
        params.push({ name: paramName, type: paramType });
      }
    }
  }

  // 返回类型
  let returnType = node.childForFieldName('return_type')?.text;
  if (returnType) {
    returnType = returnType.replace(/^:\s*/, '').trim();
  }

  // 签名
  const signature = buildFunctionSignature(name, params, returnType);

  // JSDoc 注释（前面的 comment 节点）
  const jsDoc = extractJsDoc(node, source);

  // 是否导出
  const isExported = isExportedNode(node);

  // 行号（0 索引 + 1 变成行号）
  const lineStart = node.startPosition.row + 1;
  const lineEnd = node.endPosition.row + 1;

  const fullName = parentName ? `${parentName}.${name}` : name;

  return {
    id: generateNodeId('elem', [filePath, signature, 'function']),
    level: 'L3',
    type: isComponentName(name) ? NODE_TYPE_COMPONENT : NODE_TYPE_FUNCTION,
    name: fullName,
    attrs: {
      signature,
      params,
      returnType,
      parentName: parentName ?? undefined,
      isExported,
      jsDoc: jsDoc ?? undefined,
      lineStart,
      lineEnd,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ==================== 类提取 ====================

function extractClass(node: any, source: string, filePath: string): GraphNode {
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? '<AnonymousClass>';

  // 继承
  const heritageNode = node.childForFieldName('heritage_clause');
  const annotations: string[] = [];
  if (heritageNode) {
    // 提取 extends 的类名
    for (let i = 0; i < heritageNode.namedChildCount; i++) {
      const h = heritageNode.namedChild(i);
      if (h?.type === 'extends_clause') {
        const typeNode = h.namedChild(0);
        if (typeNode) annotations.push(`extends ${typeNode.text}`);
      }
      if (h?.type === 'implements_clause') {
        for (let j = 0; j < h.namedChildCount; j++) {
          const impl = h.namedChild(j);
          if (impl) annotations.push(`implements ${impl.text}`);
        }
      }
    }
  }

  // 装饰器
  const decorators = extractDecorators(node);
  annotations.push(...decorators.map((d) => `@${d}`));

  // JSDoc
  const jsDoc = extractJsDoc(node, source);

  // 行号
  const lineStart = node.startPosition.row + 1;
  const lineEnd = node.endPosition.row + 1;

  const isExported = isExportedNode(node);

  // 类内成员：方法
  const methods: string[] = [];
  const bodyNode = node.childForFieldName('body');
  if (bodyNode) {
    for (let i = 0; i < bodyNode.namedChildCount; i++) {
      const member = bodyNode.namedChild(i);
      if (!member) continue;
      if (
        member.type === 'method_definition' ||
        member.type === 'public_field_definition'
      ) {
        const mName = member.childForFieldName('name')?.text;
        if (mName) methods.push(mName);
      }
    }
  }

  const signature = buildClassSignature(name, annotations, methods);

  return {
    id: generateNodeId('elem', [filePath, name, 'class']),
    level: 'L3',
    type: NODE_TYPE_CLASS,
    name,
    attrs: {
      signature,
      annotations,
      parentName: undefined,
      isExported,
      jsDoc: jsDoc ?? undefined,
      lineStart,
      lineEnd,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ==================== 接口提取 ====================

function extractInterface(node: any, source: string, filePath: string): GraphNode {
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? '<AnonymousInterface>';

  // extends
  const extendsNode = node.childForFieldName('extends');
  const annotations: string[] = [];
  if (extendsNode) {
    for (let i = 0; i < extendsNode.namedChildCount; i++) {
      const ext = extendsNode.namedChild(i);
      if (ext) annotations.push(`extends ${ext.text}`);
    }
  }

  // 装饰器
  const decorators = extractDecorators(node);
  annotations.push(...decorators.map((d) => `@${d}`));

  // JSDoc
  const jsDoc = extractJsDoc(node, source);

  const lineStart = node.startPosition.row + 1;
  const lineEnd = node.endPosition.row + 1;
  const isExported = isExportedNode(node);

  const signature = `interface ${name}${annotations.length ? ' ' + annotations.join(' ') : ''}`;

  return {
    id: generateNodeId('elem', [filePath, name, 'interface']),
    level: 'L3',
    type: NODE_TYPE_INTERFACE,
    name,
    attrs: {
      signature,
      annotations,
      isExported,
      jsDoc: jsDoc ?? undefined,
      lineStart,
      lineEnd,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ==================== type 别名提取 ====================

function extractTypeAlias(node: any, source: string, filePath: string): GraphNode {
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? '<AnonymousType>';

  const jsDoc = extractJsDoc(node, source);
  const lineStart = node.startPosition.row + 1;
  const lineEnd = node.endPosition.row + 1;
  const isExported = isExportedNode(node);

  const signature = `type ${name}`;

  return {
    id: generateNodeId('elem', [filePath, name, 'type']),
    level: 'L3',
    type: NODE_TYPE_INTERFACE,
    name,
    attrs: {
      signature,
      isExported,
      jsDoc: jsDoc ?? undefined,
      lineStart,
      lineEnd,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ==================== 常量提取 ====================

function extractConstants(
  node: any,
  source: string,
  filePath: string,
  elements: GraphNode[],
): void {
  // 只提取顶层 const 声明
  if (node.type !== 'lexical_declaration') return;

  const kind = node.child(0)?.text; // const / let / var
  if (kind !== 'const') return; // 只提取 const，let/var 是变量不是常量

  const declaratorNode = node.childForFieldName('declarator');
  if (!declaratorNode) return;

  const nameNode = declaratorNode.childForFieldName('name');
  const name = nameNode?.text;
  if (!name || !isConstantName(name)) return;

  const jsDoc = extractJsDoc(node, source);
  const lineStart = node.startPosition.row + 1;
  const lineEnd = node.endPosition.row + 1;
  const isExported = isExportedNode(node);

  const signature = `const ${name}`;

  elements.push({
    id: generateNodeId('elem', [filePath, name, 'const']),
    level: 'L3',
    type: NODE_TYPE_CONSTANT,
    name,
    attrs: {
      signature,
      isExported,
      jsDoc: jsDoc ?? undefined,
      lineStart,
      lineEnd,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

// ==================== Export 语句处理 ====================

function extractExport(
  node: any,
  source: string,
  filePath: string,
  elements: GraphNode[],
  imports: string[],
): void {
  // export { ... }
  const decl = node.childForFieldName('declaration');
  if (decl) {
    // 内联声明：export function foo() {}
    switch (decl.type) {
      case 'function_declaration':
        elements.push(extractFunction(decl, source, filePath, null));
        break;
      case 'class_declaration':
        elements.push(extractClass(decl, source, filePath));
        break;
      case 'interface_declaration':
        elements.push(extractInterface(decl, source, filePath));
        break;
      case 'type_alias_declaration':
        elements.push(extractTypeAlias(decl, source, filePath));
        break;
      case 'lexical_declaration':
        extractConstants(decl, source, filePath, elements);
        break;
    }
    return;
  }

  // export from '...'
  const sourceNode = node.childForFieldName('source');
  if (sourceNode) {
    const moduleName = sourceNode.text.slice(1, -1);
    imports.push(moduleName);
  }
}

// ==================== 辅助函数 ====================

/** 构建函数字符串签名 */
function buildFunctionSignature(
  name: string,
  params: Array<{ name: string; type?: string }>,
  returnType?: string,
): string {
  const paramStr = params
    .map((p) => (p.type ? `${p.name}: ${p.type}` : p.name))
    .join(', ');
  return `${name}(${paramStr})${returnType ? `: ${returnType}` : ''}`;
}

/** 构建类签名 */
function buildClassSignature(
  name: string,
  annotations: string[],
  methods: string[],
): string {
  const annoStr = annotations.length ? ' ' + annotations.join(' ') : '';
  const methodStr = methods.length ? ` { ${methods.slice(0, 10).join(', ')}${methods.length > 10 ? ', ...' : ''} }` : '';
  return `class ${name}${annoStr}${methodStr}`;
}

/** 提取 JSDoc 注释（节点前面的 comment 块） */
function extractJsDoc(node: any, source: string): string | null {
  // 找当前节点前面的兄弟节点（注释）
  let sibling = node.previousNamedSibling;
  // tree-sitter 里注释可能不算 named child，用 sibling 遍历
  const nodeStartIndex = node.startIndex;
  const beforeText = source.slice(Math.max(0, nodeStartIndex - 500), nodeStartIndex);

  // 匹配 /** ... */ 形式的 JSDoc
  const match = beforeText.match(/\/\*\*[\s\S]*?\*\/\s*$/);
  if (match) {
    // 清理一下格式
    return match[0]
      .replace(/^\/\*\*\s*/, '')
      .replace(/\s*\*\/$/, '')
      .replace(/^\s*\*\s?/gm, '')
      .trim()
      .slice(0, 500); // 限制长度
  }

  return null;
}

/** 提取装饰器 */
function extractDecorators(node: any): string[] {
  const decorators: string[] = [];
  const decoratorNode = node.childForFieldName('decorators');
  if (decoratorNode) {
    for (let i = 0; i < decoratorNode.namedChildCount; i++) {
      const d = decoratorNode.namedChild(i);
      if (d?.type === 'decorator') {
        const dName = d.childForFieldName('name')?.text ?? d.text.replace('@', '');
        decorators.push(dName);
      }
    }
  }
  return decorators;
}

/** 是否为导出节点 */
function isExportedNode(node: any): boolean {
  // 向上找 export 关键字或 export 父节点
  let current = node;
  while (current) {
    if (
      current.type === 'export_statement' ||
      current.type === 'export_declaration'
    ) {
      return true;
    }
    if (current.children) {
      for (const child of current.children) {
        if (child.type === 'export' || child.text === 'export') return true;
      }
    }
    current = current.parent;
    if (!current || current.type === 'program') break;
  }

  // 检查第一个子节点是不是 export
  const firstChild = node.child(0);
  if (firstChild?.text === 'export') return true;

  return false;
}

/** 判断是否为 React 组件名（首字母大写） */
function isComponentName(name: string): boolean {
  return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

/** 判断是否为常量名（全大写+下划线） */
function isConstantName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

/** 快速哈希（用于文件指纹） */
function quickHash(str: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}
