/**
 * 边的扩展字段持久化测试
 *
 * 这几类字段（跳转方式 / 事件名 / 绑定路径 / 共享能力名）只存在于边对象上，
 * 是那条边唯一的解释来源。若 save/load 不带上它们，重载后边还在、依据却没了：
 *   - navigate 边不知道用 navigateTo 还是 switchTab；
 *   - bind-event 边不知道绑的是哪个事件；
 *   - sibling 边不知道两个文件凭什么算是「同能力」。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { JsonlGraphStore } from '../graph/storage/graph-store';
import type { GraphData } from '../graph/types';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-edge-fields-'));
}

function mkNode(id: string, filePath: string): GraphData['nodes'][number] {
  return { id, level: 'L2', type: 'file', name: filePath, attrs: { filePath }, createdAt: 0, updatedAt: 0 };
}

test('边的扩展字段落盘后能原样读回', () => {
  const dir = makeTmpDir();
  try {
    const store = new JsonlGraphStore(dir);
    const data: GraphData = {
      nodes: [mkNode('a', 'a.vue'), mkNode('b', 'b.vue')],
      edges: [
        {
          id: 'e1', from: 'a', to: 'b', type: 'navigate', weight: 0.9, source: 'structure',
          method: 'navigateTo', eventName: 'tap', bindPath: 'src',
        },
        { id: 'e2', from: 'a', to: 'b', type: 'sibling', weight: 0.4, source: 'semantic', capability: 'cart' },
      ],
    };

    store.save(data);
    const loaded = store.load();

    const nav = loaded.edges.find((e) => e.type === 'navigate');
    assert.equal(nav?.method, 'navigateTo');
    assert.equal(nav?.eventName, 'tap');
    assert.equal(nav?.bindPath, 'src');

    const sib = loaded.edges.find((e) => e.type === 'sibling');
    assert.equal(sib?.capability, 'cart');
    assert.equal(sib?.weight, 0.4);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('没有扩展字段的边不被写入空字段（保持旧文件形状）', () => {
  const dir = makeTmpDir();
  try {
    const store = new JsonlGraphStore(dir);
    store.save({
      nodes: [mkNode('a', 'a.vue'), mkNode('b', 'b.vue')],
      edges: [{ id: 'e1', from: 'a', to: 'b', type: 'import', weight: 0.75, source: 'structure' }],
    });

    const line = fs.readFileSync(path.join(dir, 'graph.jsonl'), 'utf8')
      .split('\n').find((l) => l.includes('"import"'))!;
    assert.equal(line.includes('method'), false);
    assert.equal(line.includes('capability'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});