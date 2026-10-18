/**
 * 多图谱构建集成测试
 *
 * 测试内容：
 * - 从子目录构建命名图谱
 * - 不同子目录独立嗅探项目类型
 * - 多次 build 产出多图谱共存
 * - 各图谱统计独立
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildGraph } from '../graph/builders/graph-builder';
import { listGraphs } from '../graph/storage/graph-manager';
import { graphExists } from '../graph/storage/graph-path';
import { JsonMetaStore } from '../graph/storage/meta-store';
import { JsonlGraphStore } from '../graph/storage/graph-store';
import { loadGraphConfig } from '../graph/config';

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-multi-build-'));
}

function createFrontendProject(root: string) {
  const src = path.join(root, 'frontend', 'src');
  fs.mkdirSync(path.join(src, 'modules', 'user'), { recursive: true });
  fs.mkdirSync(path.join(src, 'modules', 'order'), { recursive: true });
  fs.mkdirSync(path.join(src, 'utils'), { recursive: true });

  // package.json with vue dependency
  fs.writeFileSync(
    path.join(root, 'frontend', 'package.json'),
    JSON.stringify({
      name: 'frontend-app',
      dependencies: { vue: '^3.0.0' },
      devDependencies: { pinia: '^2.0.0' },
    }),
  );

  // user module
  fs.writeFileSync(
    path.join(src, 'modules', 'user', 'index.ts'),
    `
import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({ name: '' }),
  actions: {
    setName(name: string) { this.name = name; },
  },
});

export function getUserInfo() {
  return { name: 'test' };
}
`,
  );

  // order module
  fs.writeFileSync(
    path.join(src, 'modules', 'order', 'index.ts'),
    `
export function createOrder() {
  return { id: '123' };
}

export function getOrderList() {
  return [];
}
`,
  );

  // utils
  fs.writeFileSync(
    path.join(src, 'utils', 'request.ts'),
    `
export function request(url: string) {
  return fetch(url);
}
`,
  );
}

function createBackendProject(root: string) {
  const src = path.join(root, 'backend', 'src', 'main', 'java', 'com', 'example');
  fs.mkdirSync(path.join(src, 'user'), { recursive: true });
  fs.mkdirSync(path.join(src, 'order'), { recursive: true });

  // pom.xml
  fs.writeFileSync(
    path.join(root, 'backend', 'pom.xml'),
    `
<project>
  <groupId>com.example</groupId>
  <artifactId>backend</artifactId>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
</project>
`,
  );

  // Java files (simple content - Java parsing is in another change)
  fs.writeFileSync(
    path.join(src, 'user', 'UserController.java'),
    `
package com.example.user;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {
    @GetMapping("/{id}")
    public String getUser(@PathVariable Long id) {
        return "user";
    }
}
`,
  );

  fs.writeFileSync(
    path.join(src, 'order', 'OrderController.java'),
    `
package com.example.order;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
public class OrderController {
    @PostMapping
    public String createOrder() {
        return "order";
    }
}
`,
  );
}

describe('多图谱构建 - 子目录构建', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    createFrontendProject(tmpDir);
    createBackendProject(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('前端子目录构建前端图谱', async () => {
    const result = await buildGraph(tmpDir, {
      stack: 'frontend-vue',
      scanRoot: 'frontend',
    });

    expect(result.meta.graphName).toBe('frontend-vue');
    expect(result.meta.scanRoot).toBe('frontend');
    expect(result.meta.projectType).toBe('frontend-h5');
    expect(result.meta.totalNodes).toBeGreaterThan(0);
    expect(result.stats.nodesByLevel.L2).toBeGreaterThan(0);

    // 验证文件存储在正确路径
    expect(graphExists(tmpDir, 'frontend-vue')).toBe(true);
  });

  it('后端子目录构建后端图谱', async () => {
    const result = await buildGraph(tmpDir, {
      stack: 'backend-springboot',
      scanRoot: 'backend',
    });

    expect(result.meta.graphName).toBe('backend-springboot');
    expect(result.meta.scanRoot).toBe('backend');
    // Note: backend-java detection works via pom.xml
    expect(result.meta.projectType).toBe('backend-java');
    expect(result.meta.totalNodes).toBeGreaterThan(0);

    expect(graphExists(tmpDir, 'backend-springboot')).toBe(true);
  });

  it('多次 build 产出多图谱共存', async () => {
    const feResult = await buildGraph(tmpDir, {
      stack: 'frontend-vue',
      scanRoot: 'frontend',
    });

    const beResult = await buildGraph(tmpDir, {
      stack: 'backend-springboot',
      scanRoot: 'backend',
    });

    // 两个图谱都存在
    expect(graphExists(tmpDir, 'frontend-vue')).toBe(true);
    expect(graphExists(tmpDir, 'backend-springboot')).toBe(true);

    // listGraphs 能列出两个
    const graphs = listGraphs(tmpDir);
    expect(graphs.length).toBe(2);
    const graphNames = graphs.map((g) => g.name).sort();
    expect(graphNames).toEqual(['backend-springboot', 'frontend-vue']);

    // 统计独立
    const feGraph = graphs.find((g) => g.name === 'frontend-vue')!;
    const beGraph = graphs.find((g) => g.name === 'backend-springboot')!;
    expect(feGraph.totalNodes).toBe(feResult.meta.totalNodes);
    expect(beGraph.totalNodes).toBe(beResult.meta.totalNodes);
    // 两端节点数不同
    expect(feGraph.totalNodes).not.toBe(beGraph.totalNodes);
  });

  it('同名 build 覆盖原有图谱', async () => {
    // 第一次构建
    const result1 = await buildGraph(tmpDir, {
      stack: 'test-graph',
      scanRoot: 'frontend',
    });
    const nodes1 = result1.meta.totalNodes;
    const builtAt1 = result1.meta.builtAt;

    // 等待一下确保时间戳不同
    await new Promise((r) => setTimeout(r, 10));

    // 第二次同名构建（覆盖）
    const result2 = await buildGraph(tmpDir, {
      stack: 'test-graph',
      scanRoot: 'frontend',
    });

    expect(result2.meta.builtAt).toBeGreaterThan(builtAt1);
    expect(result2.meta.totalNodes).toBe(nodes1); // 相同源码，节点数相同
    expect(graphExists(tmpDir, 'test-graph')).toBe(true);

    // listGraphs 只显示一个
    const graphs = listGraphs(tmpDir);
    expect(graphs.length).toBe(1);
  });

  it('无 scanRoot 时扫描工作根', async () => {
    const result = await buildGraph(tmpDir, { stack: 'full-graph' });
    expect(result.meta.graphName).toBe('full-graph');
    expect(result.meta.scanRoot).toBe('.');
    // 工作根同时有前后端，嗅探可能是 fullstack
    expect(result.meta.totalNodes).toBeGreaterThan(0);
  });

  it('非法图谱名抛出错误', async () => {
    await expect(buildGraph(tmpDir, { stack: 'Invalid Name' })).rejects.toThrow();
    await expect(buildGraph(tmpDir, { stack: '' })).rejects.toThrow();
    await expect(buildGraph(tmpDir, { stack: '-bad' })).rejects.toThrow();
  });

  it('default 图谱无 --name 时兼容旧行为', async () => {
    const result = await buildGraph(tmpDir); // 不传 options
    expect(result.meta.graphName).toBe('default');
    expect(result.meta.scanRoot).toBe('.');
    expect(graphExists(tmpDir, 'default')).toBe(true);
  });

  it('旧签名 buildGraph(root, callback) 仍可用', async () => {
    let progressCalled = false;
    const result = await buildGraph(tmpDir, () => {
      progressCalled = true;
    });
    expect(result.meta.graphName).toBe('default');
    expect(progressCalled).toBe(true);
  });
});
