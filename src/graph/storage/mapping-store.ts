/**
 * 向量-节点映射存储（JSON 格式）
 *
 * 存储向量下标与节点 ID 的对应关系。
 * 与二进制向量索引文件配合使用：下标 i 对应 indexToNodeId[i]。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { VectorMapping } from '../types';

export class VectorMappingStore {
  private mappingPath: string;

  constructor(wpfDir: string) {
    const indexDir = path.join(wpfDir, 'index');
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true });
    }
    this.mappingPath = path.join(indexDir, 'vector-mapping.json');
  }

  exists(): boolean {
    return fs.existsSync(this.mappingPath);
  }

  load(): VectorMapping | null {
    if (!this.exists()) return null;

    try {
      const raw = fs.readFileSync(this.mappingPath, 'utf-8');
      const data = JSON.parse(raw);

      const indexToNodeId: string[] = data.indexToNodeId ?? [];
      const nodeIdToIndex = new Map<string, number>();
      if (data.nodeIdToIndex) {
        for (const [id, idx] of Object.entries(data.nodeIdToIndex as Record<string, number>)) {
          nodeIdToIndex.set(id, idx);
        }
      } else {
        // 兼容：从 indexToNodeId 反向构建
        indexToNodeId.forEach((id, i) => nodeIdToIndex.set(id, i));
      }

      return { indexToNodeId, nodeIdToIndex };
    } catch (e) {
      console.warn('[mapping-store] 加载映射失败:', e);
      return null;
    }
  }

  save(mapping: VectorMapping): void {
    const data = {
      indexToNodeId: mapping.indexToNodeId,
      nodeIdToIndex: Object.fromEntries(mapping.nodeIdToIndex),
    };

    const tmpPath = this.mappingPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf-8');
    fs.renameSync(tmpPath, this.mappingPath);
  }

  destroy(): void {
    if (fs.existsSync(this.mappingPath)) {
      fs.unlinkSync(this.mappingPath);
    }
  }
}
