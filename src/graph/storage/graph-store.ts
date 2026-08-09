/**
 * 图谱数据存储（JSONL 格式 + 内存索引）
 *
 * 存储格式：
 *   graph.jsonl - 每行一个 JSON 对象，type 区分 node/edge
 *   示例：
 *     {"type":"node","id":"req:abc123","level":"L1",...}
 *     {"type":"edge","id":"e1","from":"req:abc123","to":"mod:def456",...}
 *
 * 原子写入：先写临时文件，再用 rename 原子替换。
 */
import * as fs from 'fs';
import * as path from 'path';
import type {
  GraphData,
  GraphNode,
  GraphEdge,
  GraphIndex,
  NodeLevel,
  NodeType,
} from '../types';
import {
  EDGE_TYPE_CONTAIN,
  EDGE_TYPE_CALL,
  EDGE_TYPE_IMPORT,
  EDGE_TYPE_INHERIT,
  EDGE_TYPE_BUSINESS_MAP,
  DEFAULT_GRAPH_NAME,
} from '../types';
import { resolveGraphDir } from './graph-path';

/**
 * GraphStore 接口
 */
export interface GraphStore {
  /** 加载图谱数据到内存 */
  load(): GraphData;
  /** 保存图谱数据（原子写入） */
  save(data: GraphData): void;
  /** 判断图谱是否存在 */
  exists(): boolean;
  /** 删除图谱数据 */
  destroy(): void;
}

/**
 * 从 GraphData 构建内存索引
 *
 * 包含：nodeMap、出边表、入边表、按层级/类型分组
 */
export function buildGraphIndex(data: GraphData): GraphIndex {
  const nodeMap = new Map<string, GraphNode>();
  const outEdges = new Map<string, GraphEdge[]>();
  const inEdges = new Map<string, GraphEdge[]>();
  const nodesByLevel = new Map<NodeLevel, string[]>();
  const nodesByType = new Map<NodeType, string[]>();

  for (const node of data.nodes) {
    nodeMap.set(node.id, node);
    outEdges.set(node.id, []);
    inEdges.set(node.id, []);

    const levelArr = nodesByLevel.get(node.level) ?? [];
    levelArr.push(node.id);
    nodesByLevel.set(node.level, levelArr);

    const typeArr = nodesByType.get(node.type) ?? [];
    typeArr.push(node.id);
    nodesByType.set(node.type, typeArr);
  }

  for (const edge of data.edges) {
    const outArr = outEdges.get(edge.from);
    if (outArr) outArr.push(edge);
    const inArr = inEdges.get(edge.to);
    if (inArr) inArr.push(edge);
  }

  return { nodeMap, outEdges, inEdges, nodesByLevel, nodesByType };
}

/**
 * JSONL 格式的 GraphStore 实现
 *
 * 支持多图谱存储：图谱文件位于 wpw/knowledge/graph/<stack>/graph.jsonl
 * 构造函数可接受图谱目录绝对路径，或通过 (root, stack) 解析。
 */
export class JsonlGraphStore implements GraphStore {
  private graphPath: string;

  constructor(graphDir: string);
  constructor(root: string, stack: string);
  constructor(rootOrDir: string, stack?: string) {
    if (stack !== undefined) {
      // (root, stack) 形式
      const graphDir = resolveGraphDir(rootOrDir, stack || DEFAULT_GRAPH_NAME);
      this.graphPath = path.join(graphDir, 'graph.jsonl');
    } else {
      // 直接传图谱目录（向后兼容）
      this.graphPath = path.join(rootOrDir, 'graph.jsonl');
    }
  }

  exists(): boolean {
    return fs.existsSync(this.graphPath);
  }

  load(): GraphData {
    if (!this.exists()) {
      return { nodes: [], edges: [] };
    }

    const content = fs.readFileSync(this.graphPath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'node' || obj._kind === 'node') {
          // 从 JSONL 行还原节点
          const node: GraphNode = {
            id: obj.id,
            level: obj.level,
            type: obj.nodeType ?? obj.type,
            name: obj.name,
            attrs: obj.attrs ?? {},
            createdAt: obj.createdAt ?? Date.now(),
            updatedAt: obj.updatedAt ?? Date.now(),
          };
          // 兼容：type 字段在 JSONL 中可能存为 nodeType 避免和边的 type 混淆
          if (!obj.nodeType && obj.type && obj.level) {
            // 如果是节点但 type 字段存的是节点类型，直接用
            node.type = obj.type;
          }
          nodes.push(node);
        } else if (obj._kind === 'edge' || isEdgeType(obj.type)) {
          // 从 JSONL 行还原边
          edges.push({
            id: obj.id,
            from: obj.from,
            to: obj.to,
            type: obj.type,
            weight: obj.weight,
            source: obj.source ?? 'structure',
          });
        }
      } catch (e) {
        // 跳过解析失败的行
        console.warn(`[graph-store] 跳过无法解析的行: ${line.slice(0, 80)}`);
      }
    }

    return { nodes, edges };
  }

  save(data: GraphData): void {
    // 确保目录存在
    const dir = path.dirname(this.graphPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 生成 JSONL 内容
    const lines: string[] = [];

    for (const node of data.nodes) {
      lines.push(
        JSON.stringify({
          _kind: 'node',
          id: node.id,
          level: node.level,
          type: node.type,
          name: node.name,
          attrs: node.attrs,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        }),
      );
    }

    for (const edge of data.edges) {
      lines.push(
        JSON.stringify({
          _kind: 'edge',
          id: edge.id,
          from: edge.from,
          to: edge.to,
          type: edge.type,
          weight: edge.weight,
          source: edge.source,
        }),
      );
    }

    const content = lines.join('\n') + '\n';

    // 原子写入：先写临时文件，再 rename
    const tmpPath = this.graphPath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, this.graphPath);
  }

  destroy(): void {
    if (fs.existsSync(this.graphPath)) {
      fs.unlinkSync(this.graphPath);
    }
  }
}

/** 判断字符串是否为边类型 */
function isEdgeType(t: string): boolean {
  return (
    t === EDGE_TYPE_CONTAIN ||
    t === EDGE_TYPE_CALL ||
    t === EDGE_TYPE_IMPORT ||
    t === EDGE_TYPE_INHERIT ||
    t === EDGE_TYPE_BUSINESS_MAP
  );
}
