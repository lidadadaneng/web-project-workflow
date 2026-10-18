import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { buildGraph } from '../graph/builders/graph-builder';
import { NODE_TYPE_MODULE, EDGE_TYPE_CONTAIN } from '../graph/types';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-java-mod-test-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test('Spring Boot 模块推断：业务包识别为 L1 模块', async () => {
  const tmpDir = makeTempDir();
  try {
    writeFile(tmpDir, 'pom.xml', '<project></project>');

    // user 业务包
    writeFile(tmpDir, 'src/main/java/com/example/user/UserController.java',
      'package com.example.user;\npublic class UserController {}');
    writeFile(tmpDir, 'src/main/java/com/example/user/UserService.java',
      'package com.example.user;\npublic class UserService {}');

    // order 业务包
    writeFile(tmpDir, 'src/main/java/com/example/order/OrderController.java',
      'package com.example.order;\npublic class OrderController {}');

    const result = await buildGraph(tmpDir);
    const modules = result.data.nodes.filter((n) => n.type === NODE_TYPE_MODULE);

    // 应有 user 和 order 两个业务模块
    const moduleNames = modules.map((m) => m.name);
    assert.ok(moduleNames.includes('user'), '应包含 user 模块');
    assert.ok(moduleNames.includes('order'), '应包含 order 模块');

    // 模块 side 应为 backend
    const userMod = modules.find((m) => m.name === 'user');
    assert.equal(userMod?.attrs.side, 'backend');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Spring Boot 模块推断：技术分包不单独成模块', async () => {
  const tmpDir = makeTempDir();
  try {
    writeFile(tmpDir, 'pom.xml', '<project></project>');

    // user 包下的技术分层子目录不应成模块
    writeFile(tmpDir, 'src/main/java/com/example/user/controller/UserController.java',
      'package com.example.user.controller;\npublic class UserController {}');
    writeFile(tmpDir, 'src/main/java/com/example/user/service/UserService.java',
      'package com.example.user.service;\npublic class UserService {}');
    writeFile(tmpDir, 'src/main/java/com/example/user/repository/UserRepository.java',
      'package com.example.user.repository;\npublic interface UserRepository {}');
    writeFile(tmpDir, 'src/main/java/com/example/user/entity/User.java',
      'package com.example.user.entity;\npublic class User {}');
    writeFile(tmpDir, 'src/main/java/com/example/user/dto/UserDTO.java',
      'package com.example.user.dto;\npublic class UserDTO {}');

    const result = await buildGraph(tmpDir);
    const modules = result.data.nodes.filter((n) => n.type === NODE_TYPE_MODULE);
    const moduleNames = modules.map((m) => m.name);

    // 只有 user 是模块，controller/service/repository/entity/dto 都不是
    assert.ok(moduleNames.includes('user'), '应包含 user 模块');
    assert.ok(!moduleNames.includes('controller'), 'controller 不应成模块');
    assert.ok(!moduleNames.includes('service'), 'service 不应成模块');
    assert.ok(!moduleNames.includes('repository'), 'repository 不应成模块');
    assert.ok(!moduleNames.includes('entity'), 'entity 不应成模块');
    assert.ok(!moduleNames.includes('dto'), 'dto 不应成模块');

    // controller/service 下的文件应归属 user 模块
    const containEdges = result.data.edges.filter((e) => e.type === EDGE_TYPE_CONTAIN);
    const userMod = modules.find((m) => m.name === 'user');
    const controllerFile = result.data.nodes.find(
      (n) => n.type === 'file' && n.name === 'UserController.java',
    );
    assert.ok(userMod && controllerFile);

    // user 模块 contain UserController 文件
    const hasContain = containEdges.some(
      (e) => e.from === userMod!.id && e.to === controllerFile!.id,
    );
    assert.ok(hasContain, 'user 模块应 contain UserController');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Spring Boot 模块推断：扁平包结构降级为单个 backend 模块', async () => {
  const tmpDir = makeTempDir();
  try {
    writeFile(tmpDir, 'pom.xml', '<project></project>');

    // 扁平结构：所有类直接在 com.example 下
    writeFile(tmpDir, 'src/main/java/com/example/UserService.java',
      'package com.example;\npublic class UserService {}');
    writeFile(tmpDir, 'src/main/java/com/example/OrderService.java',
      'package com.example;\npublic class OrderService {}');

    const result = await buildGraph(tmpDir);
    const modules = result.data.nodes.filter((n) => n.type === NODE_TYPE_MODULE);

    // 扁平包结构降级：至少有一个 backend 模块
    const backendModules = modules.filter((m) => m.attrs.side === 'backend');
    assert.ok(backendModules.length >= 1, '应有至少一个 backend 模块');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
