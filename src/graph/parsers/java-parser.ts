/**
 * Java 源码解析器
 *
 * 基于 web-tree-sitter + tree-sitter-java 解析 .java 文件，提取：
 * - 文件节点（L2）
 * - 元素节点（L3）：class / interface / enum / record / method / constant
 * - import 信息（用于生成 import 边）
 * - Spring 注解与 REST endpoint 元信息
 *
 * tree-sitter-java 字段名说明：
 *   class_declaration: name / body / superclass / interfaces (→ super_interfaces)
 *   method_declaration: name / parameters / body
 *   field_declaration: declarator (→ variable_declarator)
 *   modifiers: 不能通过 childForFieldName 访问，需按节点类型查找
 */
import * as path from 'path';
import type { GraphNode } from '../types';
import {
  NODE_TYPE_CLASS,
  NODE_TYPE_INTERFACE,
  NODE_TYPE_FUNCTION,
  NODE_TYPE_CONSTANT,
} from '../types';
import { generateNodeId } from '../builders/node-builder';
import { setParserLanguage } from './tree-sitter-loader';
import type { ParseResult } from './ts-parser';

// ==================== Spring 注解映射 ====================

const STEREOTYPE_ROLE_MAP: Record<string, string> = {
  RestController: 'REST 控制器',
  Controller: '控制器',
  Service: '业务服务',
  Repository: '数据访问层',
  Component: '组件',
  Configuration: '配置类',
  Entity: 'JPA 实体',
  Mapper: '数据映射器',
};

const MAPPING_METHOD_MAP: Record<string, string> = {
  GetMapping: 'GET',
  PostMapping: 'POST',
  PutMapping: 'PUT',
  DeleteMapping: 'DELETE',
  PatchMapping: 'PATCH',
  RequestMapping: 'GET',
};

// ==================== 主入口 ====================

export async function parseJavaFile(
  filePath: string,
  root: string,
  source: string,
): Promise<ParseResult> {
  let parser: any;
  try {
    parser = await setParserLanguage('java');
  } catch (e) {
    console.warn(
      `[java-parser] tree-sitter-java WASM 不可用，降级为正则解析: ${path.relative(root, filePath)}`,
    );
    return parseJavaFileRegex(filePath, root, source);
  }

  const tree = parser.parse(source);
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath);

  const elements: GraphNode[] = [];
  const imports: string[] = [];

  traverseTopLevel(tree.rootNode, source, relPath, elements, imports);

  const fileNode: GraphNode = {
    id: generateNodeId('file', [relPath]),
    level: 'L2',
    type: 'file',
    name: fileName,
    attrs: {
      filePath: relPath,
      language: 'java',
      fileHash: quickHash(source),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  for (const el of elements) {
    el.attrs.filePath = relPath;
  }

  return { fileNode, elements, imports };
}

// ==================== 顶层遍历 ====================

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
      case 'import_declaration':
        extractImport(child, imports);
        break;
      case 'class_declaration':
        elements.push(...extractTypeDecl(child, source, filePath, 'class'));
        break;
      case 'interface_declaration':
        elements.push(...extractTypeDecl(child, source, filePath, 'interface'));
        break;
      case 'enum_declaration':
        elements.push(...extractTypeDecl(child, source, filePath, 'enum'));
        break;
      case 'record_declaration':
        elements.push(...extractTypeDecl(child, source, filePath, 'record'));
        break;
      default:
        break;
    }
  }
}

// ==================== Import 提取 ====================

function extractImport(node: any, imports: string[]): void {
  // 检查是否为 static import
  const hasStatic = node.children?.some(
    (c: any) => c.type === 'static' || c.text === 'static',
  );
  if (hasStatic) return;

  // import 路径主体是 scoped_identifier
  const scopeNode = findNamedChildByType(node, 'scoped_identifier');
  if (!scopeNode) return;

  let importPath = scopeNode.text;

  // 通配 import：检查是否有 asterisk 节点（import com.example.*）
  const hasAsterisk = findNamedChildByType(node, 'asterisk');
  if (hasAsterisk) {
    importPath = importPath + '.*';
  }

  if (importPath) {
    imports.push(importPath);
  }
}

// ==================== 类型声明提取 ====================

function extractTypeDecl(
  node: any,
  source: string,
  filePath: string,
  kind: 'class' | 'interface' | 'enum' | 'record',
): GraphNode[] {
  // 名称：childForFieldName('name') → identifier 节点
  const nameNode = node.childForFieldName('name');
  const name = nameNode?.text ?? '<Anonymous>';

  // modifiers 节点（包含注解和访问修饰符）
  const modifierList = findNamedChildByType(node, 'modifiers');
  const decorators: string[] = [];
  if (modifierList) {
    for (let i = 0; i < modifierList.namedChildCount; i++) {
      const mod = modifierList.namedChild(i);
      if (!mod) continue;
      if (mod.type === 'marker_annotation' || mod.type === 'annotation') {
        const annoName = mod.childForFieldName('name')?.text ?? mod.text.replace('@', '');
        decorators.push(annoName);
      }
    }
  }

  const annotations: string[] = decorators.map((d) => `@${d}`);

  // extends / implements
  if (kind === 'class' || kind === 'record') {
    const superclassNode = node.childForFieldName('superclass');
    if (superclassNode) {
      // superclass 节点文本包含 "extends" 关键字，提取类型名
      const typeName = extractTypeNameFromSuperClass(superclassNode);
      if (typeName) annotations.push(`extends ${typeName}`);
    }
    const interfacesNode = node.childForFieldName('interfaces');
    if (interfacesNode) {
      for (let j = 0; j < interfacesNode.namedChildCount; j++) {
        const impl = interfacesNode.namedChild(j);
        if (impl) annotations.push(`implements ${impl.text}`);
      }
    }
  } else if (kind === 'interface') {
    // interface_declaration: extends_interfaces (named child type)
    const extendsNode = findNamedChildByType(node, 'extends_interfaces');
    if (extendsNode) {
      for (let j = 0; j < extendsNode.namedChildCount; j++) {
        const ext = extendsNode.namedChild(j);
        if (ext) annotations.push(`extends ${ext.text}`);
      }
    }
  }

  // Javadoc
  const jsDoc = extractJavaDoc(node, source);

  const lineStart = node.startPosition.row + 1;
  const lineEnd = node.endPosition.row + 1;

  const description = buildStereotypeDescription(decorators, kind);

  // 类级 @RequestMapping 路径
  const classReqMapping = decorators.includes('RequestMapping')
    ? extractRequestMappingPathFromModifiers(modifierList)
    : '';

  const enumConstants: string[] = [];
  const methodNodes: GraphNode[] = [];
  const constantNodes: GraphNode[] = [];
  const methodNames: string[] = [];

  // body 节点
  const bodyNode = node.childForFieldName('body');
  if (bodyNode) {
    for (let i = 0; i < bodyNode.namedChildCount; i++) {
      const member = bodyNode.namedChild(i);
      if (!member) continue;

      if (member.type === 'method_declaration' || member.type === 'constructor_declaration') {
        const isPublic = isPublicMember(member);
        const memberDecorators = extractMemberDecorators(member);
        const hasMapping = memberDecorators.some((d) => MAPPING_METHOD_MAP.hasOwnProperty(d));

        const mName =
          member.type === 'constructor_declaration'
            ? name
            : member.childForFieldName('name')?.text ?? '<init>';
        methodNames.push(mName);

        if (isPublic || hasMapping) {
          const methodNode = extractMethod(
            member,
            source,
            filePath,
            name,
            memberDecorators,
            classReqMapping,
          );
          if (methodNode) methodNodes.push(methodNode);
        }
      } else if (member.type === 'field_declaration') {
        const fieldDecorators = extractMemberDecorators(member);
        const isStaticFinal = isStaticFinalField(member);

        // 可能有多个 declarator
        const declarators = findNamedChildrenByType(member, 'variable_declarator');
        for (const decl of declarators) {
          const fieldName = decl.childForFieldName('name')?.text;
          if (fieldName && isStaticFinal && isConstantName(fieldName)) {
            constantNodes.push(
              extractConstant(member, decl, source, filePath, name, fieldName, fieldDecorators),
            );
          }
        }
      } else if (member.type === 'enum_constant') {
        const constName = member.childForFieldName('name')?.text ?? member.text;
        if (constName) enumConstants.push(constName);
      }
    }
  }

  // record 组件入签名（record 的 formal_parameters 是组件）
  if (kind === 'record') {
    const paramsNode = node.childForFieldName('parameters');
    if (paramsNode) {
      for (let i = 0; i < paramsNode.namedChildCount; i++) {
        const comp = paramsNode.namedChild(i);
        const compName = comp?.childForFieldName?.('name')?.text;
        if (compName) methodNames.push(compName);
      }
    }
  }

  let nodeType: typeof NODE_TYPE_CLASS | typeof NODE_TYPE_INTERFACE = NODE_TYPE_CLASS;
  if (kind === 'interface') nodeType = NODE_TYPE_INTERFACE;

  if (kind === 'enum') annotations.unshift('[enum]');
  if (kind === 'record') annotations.unshift('[record]');

  const signature = buildTypeSignature(name, kind, annotations, methodNames, enumConstants);

  const nodeIdKind = kind === 'interface' ? 'interface' : 'class';

  const typeNode: GraphNode = {
    id: generateNodeId('elem', [filePath, name, nodeIdKind]),
    level: 'L3',
    type: nodeType,
    name,
    attrs: {
      signature,
      annotations,
      parentName: undefined,
      isExported: true,
      jsDoc: jsDoc ?? undefined,
      description,
      lineStart,
      lineEnd,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return [typeNode, ...methodNodes, ...constantNodes];
}

// ==================== 方法提取 ====================

function extractMethod(
  node: any,
  source: string,
  filePath: string,
  parentName: string,
  decorators: string[],
  classReqMapping: string,
): GraphNode | null {
  const isConstructor = node.type === 'constructor_declaration';
  const name = isConstructor
    ? parentName
    : node.childForFieldName('name')?.text ?? '<init>';

  // 参数
  const params: Array<{ name: string; type?: string }> = [];
  const paramsNode = node.childForFieldName('parameters');
  if (paramsNode) {
    for (let i = 0; i < paramsNode.namedChildCount; i++) {
      const param = paramsNode.namedChild(i);
      if (!param || param.type !== 'formal_parameter') continue;
      const paramName = param.childForFieldName('name')?.text ?? '';
      // 类型：formal_parameter 的第一个 type 类节点
      let paramType = '';
      for (let j = 0; j < param.namedChildCount; j++) {
        const child = param.namedChild(j);
        if (child && child.type.endsWith('_type') && child.type !== 'formal_parameter') {
          paramType = child.text;
          break;
        }
      }
      if (paramName) {
        params.push({ name: paramName, type: paramType || undefined });
      }
    }
  }

  // 返回类型：找到在 name 之前的 type 类节点
  let returnType = '';
  if (isConstructor) {
    returnType = name;
  } else {
    const nameNode = node.childForFieldName('name');
    const nameIdx = nameNode?.startIndex ?? 0;
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (!child) continue;
      if (child.startIndex >= nameIdx) break;
      if (
        (child.type.endsWith('_type') || child.type === 'scoped_type_identifier') &&
        child.type !== 'formal_parameter' &&
        child.type !== 'modifiers'
      ) {
        returnType = child.text;
        break;
      }
    }
  }

  const annotations: string[] = decorators.map((d) => `@${d}`);
  const jsDoc = extractJavaDoc(node, source);
  const lineStart = node.startPosition.row + 1;
  const lineEnd = node.endPosition.row + 1;
  const signature = buildMethodSignature(name, params, returnType, annotations);

  // endpoint 元信息
  let endpoint: { method: string; path: string } | undefined;
  const mappingAnno = decorators.find((d) => MAPPING_METHOD_MAP.hasOwnProperty(d));
  if (mappingAnno) {
    const method = MAPPING_METHOD_MAP[mappingAnno];
    const modifierList = findNamedChildByType(node, 'modifiers');
    let methodPath = extractMappingPathFromModifiers(modifierList, mappingAnno);

    if (classReqMapping) {
      if (methodPath.startsWith('/')) {
        methodPath = classReqMapping + methodPath;
      } else if (methodPath) {
        methodPath = classReqMapping + '/' + methodPath;
      } else {
        methodPath = classReqMapping;
      }
    }
    if (methodPath && !methodPath.startsWith('/')) {
      methodPath = '/' + methodPath;
    }
    if (methodPath) {
      methodPath = methodPath.replace(/\/+/g, '/');
    }

    endpoint = { method, path: methodPath || '/' };
  }

  const fullName = `${parentName}.${name}`;

  return {
    id: generateNodeId('elem', [filePath, `${parentName}.${name}`, 'method']),
    level: 'L3',
    type: NODE_TYPE_FUNCTION,
    name: fullName,
    attrs: {
      signature,
      params,
      returnType: returnType || undefined,
      parentName,
      annotations,
      jsDoc: jsDoc ?? undefined,
      lineStart,
      lineEnd,
      endpoint,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ==================== 常量提取 ====================

function extractConstant(
  fieldNode: any,
  declaratorNode: any,
  source: string,
  filePath: string,
  parentName: string,
  name: string,
  decorators: string[],
): GraphNode {
  let type = '';
  const nameIdx = declaratorNode.startIndex;
  for (let i = 0; i < fieldNode.namedChildCount; i++) {
    const child = fieldNode.namedChild(i);
    if (!child) continue;
    if (child.startIndex >= nameIdx) break;
    if (child.type.endsWith('_type') && child.type !== 'variable_declarator') {
      type = child.text;
      break;
    }
  }

  const jsDoc = extractJavaDoc(fieldNode, source);
  const lineStart = fieldNode.startPosition.row + 1;
  const lineEnd = fieldNode.endPosition.row + 1;
  const annotations = decorators.map((d) => `@${d}`);
  const signature = `static final ${type || ''} ${name}`;

  return {
    id: generateNodeId('elem', [filePath, `${parentName}.${name}`, 'const']),
    level: 'L3',
    type: NODE_TYPE_CONSTANT,
    name: `${parentName}.${name}`,
    attrs: {
      signature,
      parentName,
      annotations: annotations.length ? annotations : undefined,
      jsDoc: jsDoc ?? undefined,
      lineStart,
      lineEnd,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ==================== 注解辅助函数 ====================

function extractMemberDecorators(node: any): string[] {
  const decorators: string[] = [];
  const modifierList = findNamedChildByType(node, 'modifiers');
  if (!modifierList) return decorators;

  for (let i = 0; i < modifierList.namedChildCount; i++) {
    const mod = modifierList.namedChild(i);
    if (!mod) continue;
    if (mod.type === 'marker_annotation' || mod.type === 'annotation') {
      const annoName = mod.childForFieldName('name')?.text ?? mod.text.replace('@', '');
      decorators.push(annoName);
    }
  }
  return decorators;
}

function isPublicMember(node: any): boolean {
  const modifierList = findNamedChildByType(node, 'modifiers');
  const modText = modifierList?.text ?? '';
  if (modText.includes('public')) return true;
  if (modText.includes('private') || modText.includes('protected')) return false;

  // 没有显式修饰符：接口方法默认 public
  let parent = node.parent;
  while (parent) {
    if (parent.type === 'interface_declaration') return true;
    parent = parent.parent;
  }
  return false;
}

function isStaticFinalField(node: any): boolean {
  const modifierList = findNamedChildByType(node, 'modifiers');
  const modText = modifierList?.text ?? '';
  return modText.includes('static') && modText.includes('final');
}

function extractRequestMappingPathFromModifiers(modifierList: any): string {
  return extractMappingPathFromModifiers(modifierList, 'RequestMapping');
}

function extractMappingPathFromModifiers(
  modifierList: any,
  mappingName: string,
): string {
  if (!modifierList) return '';
  for (let i = 0; i < modifierList.namedChildCount; i++) {
    const mod = modifierList.namedChild(i);
    if (!mod) continue;
    if (mod.type === 'marker_annotation' || mod.type === 'annotation') {
      const name = mod.childForFieldName('name')?.text;
      if (name === mappingName) {
        return extractAnnotationStringArg(mod);
      }
    }
  }
  return '';
}

function extractAnnotationStringArg(annotationNode: any): string {
  if (annotationNode.type === 'marker_annotation') return '';

  const argList = findNamedChildByType(annotationNode, 'annotation_argument_list');
  if (!argList) return '';

  for (let i = 0; i < argList.namedChildCount; i++) {
    const arg = argList.namedChild(i);
    if (!arg) continue;

    // element_value_pair（命名参数，如 path = "/api"）
    if (arg.type === 'element_value_pair') {
      const argName = arg.childForFieldName('name')?.text;
      if (argName === 'value' || argName === 'path') {
        // value 节点可能叫 annotation_value 或直接是 string_literal
        const valueNode =
          arg.childForFieldName('value') ?? findNamedChildByType(arg, 'string_literal');
        if (valueNode?.type === 'string_literal') {
          return stripQuotes(valueNode.text);
        }
        // 递归查找 string_literal
        const str = findStringLiteralRecursive(arg);
        if (str) return str;
      }
    }
    // 字符串字面量（位置参数）
    if (arg.type === 'string_literal') {
      return stripQuotes(arg.text);
    }
  }

  return '';
}

function findStringLiteralRecursive(node: any): string {
  if (!node) return '';
  if (node.type === 'string_literal') return stripQuotes(node.text);
  for (let i = 0; i < node.namedChildCount; i++) {
    const result = findStringLiteralRecursive(node.namedChild(i));
    if (result) return result;
  }
  return '';
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

/** 从 superclass 节点中提取类型名（去掉 "extends" 关键字） */
function extractTypeNameFromSuperClass(superclassNode: any): string {
  // superclass 节点文本形如 "extends BaseService"
  // 找到 type_identifier 或 scoped_type_identifier 子节点
  for (let i = 0; i < superclassNode.namedChildCount; i++) {
    const child = superclassNode.namedChild(i);
    if (child && (child.type.endsWith('_type') || child.type === 'scoped_type_identifier')) {
      return child.text;
    }
  }
  return superclassNode.text.replace(/^extends\s+/, '').trim();
}

/** 查找指定类型的第一个命名子节点 */
function findNamedChildByType(node: any, type: string): any {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === type) return child;
  }
  return null;
}

/** 查找指定类型的所有命名子节点 */
function findNamedChildrenByType(node: any, type: string): any[] {
  const results: any[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (child?.type === type) results.push(child);
  }
  return results;
}

// ==================== 辅助函数 ====================

function buildStereotypeDescription(
  decorators: string[],
  _kind: string,
): string | undefined {
  for (const d of decorators) {
    if (STEREOTYPE_ROLE_MAP[d]) return STEREOTYPE_ROLE_MAP[d];
  }
  return undefined;
}

function buildTypeSignature(
  name: string,
  kind: string,
  annotations: string[],
  methods: string[],
  enumConstants: string[],
): string {
  const annoStr = annotations.length ? ' ' + annotations.join(' ') : '';
  if (kind === 'enum' && enumConstants.length) {
    const constStr = ` { ${enumConstants.slice(0, 10).join(', ')}${enumConstants.length > 10 ? ', ...' : ''} }`;
    return `enum ${name}${annoStr}${constStr}`;
  }
  const methodStr = methods.length
    ? ` { ${methods.slice(0, 10).join(', ')}${methods.length > 10 ? ', ...' : ''} }`
    : '';
  return `${kind} ${name}${annoStr}${methodStr}`;
}

function buildMethodSignature(
  name: string,
  params: Array<{ name: string; type?: string }>,
  returnType?: string,
  annotations?: string[],
): string {
  const paramStr = params
    .map((p) => (p.type ? `${p.type} ${p.name}` : p.name))
    .join(', ');
  const annoStr = annotations?.length ? annotations.join(' ') + ' ' : '';
  return `${annoStr}${returnType ? returnType + ' ' : ''}${name}(${paramStr})`;
}

function extractJavaDoc(node: any, source: string): string | null {
  const nodeStartIndex = node.startIndex;
  const beforeText = source.slice(
    Math.max(0, nodeStartIndex - 1000),
    nodeStartIndex,
  );

  const match = beforeText.match(/\/\*\*[\s\S]*?\*\/\s*$/);
  if (match) {
    return match[0]
      .replace(/^\/\*\*\s*/, '')
      .replace(/\s*\*\/$/, '')
      .replace(/^\s*\*\s?/gm, '')
      .replace(/^\s*\/\*\*/, '')
      .trim()
      .slice(0, 500);
  }
  return null;
}

function isConstantName(name: string): boolean {
  return /^[A-Z][A-Z0-9_]*$/.test(name);
}

// ==================== 正则降级解析 ====================

function parseJavaFileRegex(
  filePath: string,
  root: string,
  source: string,
): ParseResult {
  const relPath = path.relative(root, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath);
  const elements: GraphNode[] = [];
  const imports: string[] = [];

  const importRegex = /^import\s+(?:static\s+)?([\w.*]+);/gm;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    if (match[0].includes(' static ')) continue;
    imports.push(match[1]);
  }

  const typeRegex = /(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?(class|interface|enum)\s+(\w+)/g;
  while ((match = typeRegex.exec(source)) !== null) {
    const kind = match[1];
    const name = match[2];
    const lineStart = source.slice(0, match.index).split('\n').length;

    let nodeType: typeof NODE_TYPE_CLASS | typeof NODE_TYPE_INTERFACE = NODE_TYPE_CLASS;
    const annotations: string[] = [];

    if (kind === 'interface') nodeType = NODE_TYPE_INTERFACE;
    if (kind === 'enum') annotations.unshift('[enum]');

    elements.push({
      id: generateNodeId('elem', [relPath, name, kind]),
      level: 'L3',
      type: nodeType,
      name,
      attrs: {
        signature: `${kind} ${name}`,
        annotations: annotations.length ? annotations : undefined,
        lineStart,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  const fileNode: GraphNode = {
    id: generateNodeId('file', [relPath]),
    level: 'L2',
    type: 'file',
    name: fileName,
    attrs: {
      filePath: relPath,
      language: 'java',
      fileHash: quickHash(source),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  for (const el of elements) {
    el.attrs.filePath = relPath;
  }

  return { fileNode, elements, imports };
}

function quickHash(str: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}
