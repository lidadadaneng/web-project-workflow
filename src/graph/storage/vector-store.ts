/**
 * 向量索引存储（二进制文件格式）
 *
 * 文件格式：
 *   头部 (32 bytes)：
 *     magic:         4 bytes  "VEC\0"
 *     version:       4 bytes  uint32, 版本号
 *     dimensions:    4 bytes  uint32, 向量维度
 *     count:         4 bytes  uint32, 向量总数
 *     reserved:     16 bytes  保留
 *   向量数据区：
 *     count × dimensions × 4 bytes  (float32, 连续存储)
 *
 * 向量下标从 0 开始，与 VectorMapping.indexToNodeId 一一对应。
 */
import * as fs from 'fs';
import * as path from 'path';

const MAGIC = Buffer.from('VEC\0');
const VERSION = 1;
const HEADER_SIZE = 32;

export interface VectorStore {
  /** 加载所有向量 */
  load(): Float32Array | null;
  /** 保存向量 */
  save(vectors: Float32Array, dimensions: number): void;
  /** 判断索引是否存在 */
  exists(): boolean;
  /** 获取向量维度 */
  getDimensions(): number | null;
  /** 获取向量数量 */
  getCount(): number | null;
  /** 删除索引文件 */
  destroy(): void;
}

export class BinaryVectorStore implements VectorStore {
  private indexPath: string;

  constructor(wpfDir: string) {
    const indexDir = path.join(wpfDir, 'index');
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true });
    }
    this.indexPath = path.join(indexDir, 'vector.index');
  }

  exists(): boolean {
    return fs.existsSync(this.indexPath);
  }

  getDimensions(): number | null {
    const header = this.readHeader();
    return header?.dimensions ?? null;
  }

  getCount(): number | null {
    const header = this.readHeader();
    return header?.count ?? null;
  }

  load(): Float32Array | null {
    const header = this.readHeader();
    if (!header) return null;

    const { dimensions, count } = header;
    const totalFloats = dimensions * count;

    const fd = fs.openSync(this.indexPath, 'r');
    try {
      const buffer = Buffer.alloc(totalFloats * 4);
      fs.readSync(fd, buffer, 0, totalFloats * 4, HEADER_SIZE);
      return new Float32Array(buffer.buffer, buffer.byteOffset, totalFloats);
    } finally {
      fs.closeSync(fd);
    }
  }

  save(vectors: Float32Array, dimensions: number): void {
    const count = vectors.length / dimensions;
    if (!Number.isInteger(count)) {
      throw new Error(`向量长度 ${vectors.length} 不能被维度 ${dimensions} 整除`);
    }

    const totalBytes = HEADER_SIZE + vectors.length * 4;
    const buffer = Buffer.alloc(totalBytes);

    // 写头部
    MAGIC.copy(buffer, 0);
    buffer.writeUInt32LE(VERSION, 4);
    buffer.writeUInt32LE(dimensions, 8);
    buffer.writeUInt32LE(count, 12);
    // 16 bytes reserved 保持零

    // 写向量数据
    const dataBuf = Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength);
    dataBuf.copy(buffer, HEADER_SIZE);

    // 原子写入
    const tmpPath = this.indexPath + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, this.indexPath);
  }

  destroy(): void {
    if (fs.existsSync(this.indexPath)) {
      fs.unlinkSync(this.indexPath);
    }
  }

  private readHeader(): { dimensions: number; count: number; version: number } | null {
    if (!this.exists()) return null;

    const fd = fs.openSync(this.indexPath, 'r');
    try {
      const headerBuf = Buffer.alloc(HEADER_SIZE);
      const bytesRead = fs.readSync(fd, headerBuf, 0, HEADER_SIZE, 0);
      if (bytesRead < HEADER_SIZE) return null;

      // 校验 magic
      if (!headerBuf.slice(0, 4).equals(MAGIC)) {
        console.warn('[vector-store] 向量索引文件 magic 不匹配');
        return null;
      }

      const version = headerBuf.readUInt32LE(4);
      const dimensions = headerBuf.readUInt32LE(8);
      const count = headerBuf.readUInt32LE(12);

      return { version, dimensions, count };
    } finally {
      fs.closeSync(fd);
    }
  }
}
