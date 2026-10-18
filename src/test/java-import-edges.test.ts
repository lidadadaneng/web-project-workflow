import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { buildGraph } from '../graph/builders/graph-builder';
import { EDGE_TYPE_IMPORT } from '../graph/types';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-java-import-test-'));
}

function writeFile(dir: string, relPath: string, content: string): void {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test('Java import edges: 单类型 import 建立文件间 import 边', async () => {
  const tmpDir = makeTempDir();
  try {
    // 写 pom.xml 触发 backend-java 项目类型
    writeFile(tmpDir, 'pom.xml', '<project></project>');

    writeFile(tmpDir, 'src/main/java/com/example/order/Order.java', `
package com.example.order;
public class Order {}
`);

    writeFile(tmpDir, 'src/main/java/com/example/user/UserService.java', `
package com.example.user;
import com.example.order.Order;
public class UserService {}
`);

    const result = await buildGraph(tmpDir);
    const importEdges = result.data.edges.filter((e) => e.type === EDGE_TYPE_IMPORT);

    // 应至少有一条 import 边
    assert.ok(importEdges.length >= 1, '应有 import 边');

    // 验证 import 边：UserService → Order
    const userFile = result.data.nodes.find(
      (n) => n.type === 'file' && n.name === 'UserService.java',
    );
    const orderFile = result.data.nodes.find(
      (n) => n.type === 'file' && n.name === 'Order.java',
    );
    assert.ok(userFile, 'UserService 文件节点应存在');
    assert.ok(orderFile, 'Order 文件节点应存在');

    const hasEdge = importEdges.some(
      (e) => e.from === userFile!.id && e.to === orderFile!.id,
    );
    assert.ok(hasEdge, 'UserService 应 import Order');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Java import edges: 通配 import (.*) 连接整个包', async () => {
  const tmpDir = makeTempDir();
  try {
    writeFile(tmpDir, 'pom.xml', '<project></project>');

    writeFile(tmpDir, 'src/main/java/com/example/order/Order.java', `
package com.example.order;
public class Order {}
`);
    writeFile(tmpDir, 'src/main/java/com/example/order/OrderItem.java', `
package com.example.order;
public class OrderItem {}
`);

    writeFile(tmpDir, 'src/main/java/com/example/user/UserService.java', `
package com.example.user;
import com.example.order.*;
public class UserService {}
`);

    const result = await buildGraph(tmpDir);
    const importEdges = result.data.edges.filter((e) => e.type === EDGE_TYPE_IMPORT);

    const userFile = result.data.nodes.find(
      (n) => n.type === 'file' && n.name === 'UserService.java',
    );
    const orderFile = result.data.nodes.find(
      (n) => n.type === 'file' && n.name === 'Order.java',
    );
    const orderItemFile = result.data.nodes.find(
      (n) => n.type === 'file' && n.name === 'OrderItem.java',
    );

    assert.ok(userFile && orderFile && orderItemFile);

    // UserService 应 import 两个文件
    const userImports = importEdges.filter((e) => e.from === userFile!.id);
    assert.ok(
      userImports.some((e) => e.to === orderFile!.id),
      '应 import Order',
    );
    assert.ok(
      userImports.some((e) => e.to === orderItemFile!.id),
      '应 import OrderItem',
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Java import edges: 静态 import 跳过', async () => {
  const tmpDir = makeTempDir();
  try {
    writeFile(tmpDir, 'pom.xml', '<project></project>');

    writeFile(tmpDir, 'src/main/java/com/example/Constants.java', `
package com.example;
public class Constants {
    public static final int MAX = 100;
}
`);

    writeFile(tmpDir, 'src/main/java/com/example/user/UserService.java', `
package com.example.user;
import static com.example.Constants.MAX;
public class UserService {}
`);

    const result = await buildGraph(tmpDir);
    const importEdges = result.data.edges.filter((e) => e.type === EDGE_TYPE_IMPORT);

    const userFile = result.data.nodes.find(
      (n) => n.type === 'file' && n.name === 'UserService.java',
    );
    assert.ok(userFile);

    // 静态 import 不应建立边
    const userImports = importEdges.filter((e) => e.from === userFile!.id);
    assert.equal(userImports.length, 0, '静态 import 不应建立边');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Java import edges: 目标文件不存在时静默跳过（JDK/第三方库）', async () => {
  const tmpDir = makeTempDir();
  try {
    writeFile(tmpDir, 'pom.xml', '<project></project>');

    writeFile(tmpDir, 'src/main/java/com/example/user/UserService.java', `
package com.example.user;
import java.util.List;
import java.util.Map;
public class UserService {}
`);

    const result = await buildGraph(tmpDir);
    const importEdges = result.data.edges.filter((e) => e.type === EDGE_TYPE_IMPORT);

    // JDK 类型找不到目标文件，不应报错，也不应有边
    assert.equal(importEdges.length, 0, 'JDK 类型 import 应静默跳过');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
