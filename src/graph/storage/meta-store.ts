/**
 * 图谱元数据存储（meta.json）
 *
 * 存储构建时间、节点边总数、文件哈希快照、配置版本等信息。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { GraphMeta } from '../types';

const META_FILE = 'meta.json';

// 2.0.0: 需求节点 ID 生成规则变更（path-based → name-based），为破坏性变更
const SCHEMA_VERSION = '2.0.0';

export interface MetaStore {
  /** 读取元数据 */
  load(): GraphMeta | null;
  /** 保存元数据（原子写入） */
  save(meta: GraphMeta): void;
  /** 判断是否存在 */
  exists(): boolean;
  /** 删除元数据 */
  destroy(): void;
}

export class JsonMetaStore implements MetaStore {
  private metaPath: string;

  constructor(private wpfDir: string) {
    this.metaPath = path.join(wpfDir, META_FILE);
  }

  exists(): boolean {
    return fs.existsSync(this.metaPath);
  }

  load(): GraphMeta | null {
    if (!this.exists()) return null;

    try {
      const content = fs.readFileSync(this.metaPath, 'utf-8');
      const obj = JSON.parse(content);
      return obj as GraphMeta;
    } catch (e) {
      console.warn('[meta-store] 读取 meta.json 失败:', e);
      return null;
    }
  }

  save(meta: GraphMeta): void {
    if (!fs.existsSync(this.wpfDir)) {
      fs.mkdirSync(this.wpfDir, { recursive: true });
    }

    const content = JSON.stringify(meta, null, 2);
    const tmpPath = this.metaPath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, this.metaPath);
  }

  destroy(): void {
    if (fs.existsSync(this.metaPath)) {
      fs.unlinkSync(this.metaPath);
    }
  }
}

/** 创建空的元数据对象 */
export function createEmptyMeta(): GraphMeta {
  return {
    schemaVersion: SCHEMA_VERSION,
    builtAt: 0,
    totalNodes: 0,
    totalEdges: 0,
    totalVectors: 0,
    fileHashes: {},
    configVersion: '',
  };
}

export { SCHEMA_VERSION };
