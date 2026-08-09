import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseJavaFile } from '../graph/parsers/java-parser';

const ROOT = '/fake-project';

// ==================== Class 解析 ====================

test('parseJavaFile: 基本 class 提取', async () => {
  const source = `
package com.example.user;

/**
 * 用户服务
 */
public class UserService {
    public User findById(Long id) {
        return null;
    }

    private void validate(User user) {
    }
}
`;
  const result = await parseJavaFile(
    '/fake-project/src/main/java/com/example/user/UserService.java',
    ROOT,
    source,
  );

  assert.equal(result.fileNode.type, 'file');
  assert.equal(result.fileNode.attrs.language, 'java');

  // class 节点
  const classNode = result.elements.find((e) => e.type === 'class');
  assert.ok(classNode, '应生成 class 节点');
  assert.equal(classNode!.name, 'UserService');
  assert.equal(classNode!.level, 'L3');
  assert.ok(!classNode!.attrs.annotations?.includes('@Service'));
  assert.ok(classNode!.attrs.jsDoc?.includes('用户服务'));
});

test('parseJavaFile: public 方法生成 L3 function 节点', async () => {
  const source = `
public class UserService {
    public User findById(Long id) {
        return null;
    }
    private void validate(User user) {}
    protected void doInternal() {}
}
`;
  const result = await parseJavaFile(
    '/fake-project/src/main/java/com/example/user/UserService.java',
    ROOT,
    source,
  );

  const functions = result.elements.filter((e) => e.type === 'function');
  assert.equal(functions.length, 1, '只有 public 方法生成 L3 节点');
  assert.equal(functions[0].name, 'UserService.findById');
  assert.equal(functions[0].attrs.parentName, 'UserService');
});

// ==================== Interface 解析 ====================

test('parseJavaFile: interface 提取', async () => {
  const source = `
public interface UserRepository extends JpaRepository<User, Long> {
    User findByUsername(String username);
}
`;
  const result = await parseJavaFile(
    '/fake-project/src/main/java/com/example/user/UserRepository.java',
    ROOT,
    source,
  );

  const iface = result.elements.find((e) => e.type === 'interface');
  assert.ok(iface, '应生成 interface 节点');
  assert.equal(iface!.name, 'UserRepository');
  assert.ok(iface!.attrs.annotations?.some((a) => a.includes('extends')));
});

// ==================== Enum 解析 ====================

test('parseJavaFile: enum 提取', async () => {
  const source = `
public enum OrderStatus {
    PENDING,
    PAID,
    SHIPPED,
    DELIVERED,
    CANCELLED;
}
`;
  const result = await parseJavaFile(
    '/fake-project/src/main/java/com/example/order/OrderStatus.java',
    ROOT,
    source,
  );

  const enumNode = result.elements.find((e) => e.type === 'class' && e.attrs.annotations?.includes('[enum]'));
  assert.ok(enumNode, '应生成 enum 节点（class 类型 + [enum] 标注）');
  assert.equal(enumNode!.name, 'OrderStatus');
  assert.ok(enumNode!.attrs.signature?.includes('PENDING'));
});

// ==================== Record 解析 ====================

test('parseJavaFile: record 提取', async () => {
  const source = `
public record Food(String name, double price) {}
`;
  const result = await parseJavaFile(
    '/fake-project/src/main/java/com/example/food/Food.java',
    ROOT,
    source,
  );

  const recordNode = result.elements.find((e) => e.type === 'class' && e.attrs.annotations?.includes('[record]'));
  assert.ok(recordNode, '应生成 record 节点（class 类型 + [record] 标注）');
  assert.equal(recordNode!.name, 'Food');
});

// ==================== Spring 注解 ====================

test('parseJavaFile: Spring stereotype 注解捕获', async () => {
  const source = `
@RestController
@RequestMapping("/api/user")
public class UserController {
}
`;
  const result = await parseJavaFile(
    '/fake-project/src/main/java/com/example/user/UserController.java',
    ROOT,
    source,
  );

  const classNode = result.elements.find((e) => e.type === 'class');
  assert.ok(classNode);
  assert.ok(classNode!.attrs.annotations?.includes('@RestController'));
  assert.ok(classNode!.attrs.annotations?.includes('@RequestMapping'));
  assert.equal(classNode!.attrs.description, 'REST 控制器');
});

test('parseJavaFile: REST endpoint 元信息提取', async () => {
  const source = `
@RestController
@RequestMapping("/api/food")
public class FoodController {
    @GetMapping("/{id}")
    public Food getById(@PathVariable Long id) {
        return null;
    }

    @PostMapping
    public Food create(@RequestBody Food food) {
        return null;
    }
}
`;
  const result = await parseJavaFile(
    '/fake-project/src/main/java/com/example/food/FoodController.java',
    ROOT,
    source,
  );

  const functions = result.elements.filter((e) => e.type === 'function');
  assert.ok(functions.length >= 2);

  const getMethod = functions.find((f) => f.name.endsWith('.getById'));
  assert.ok(getMethod);
  assert.equal(getMethod!.attrs.endpoint?.method, 'GET');
  assert.equal(getMethod!.attrs.endpoint?.path, '/api/food/{id}');

  const createMethod = functions.find((f) => f.name.endsWith('.create'));
  assert.ok(createMethod);
  assert.equal(createMethod!.attrs.endpoint?.method, 'POST');
  assert.equal(createMethod!.attrs.endpoint?.path, '/api/food');
});

// ==================== 常量提取 ====================

test('parseJavaFile: static final 常量生成 L3 节点', async () => {
  const source = `
public class Constants {
    public static final int MAX_SIZE = 100;
    public static final String DEFAULT_NAME = "unknown";
    private String instanceField;
}
`;
  const result = await parseJavaFile(
    '/fake-project/src/main/java/com/example/Constants.java',
    ROOT,
    source,
  );

  const constants = result.elements.filter((e) => e.type === 'constant');
  assert.equal(constants.length, 2);
  assert.ok(constants.some((c) => c.name.endsWith('.MAX_SIZE')));
  assert.ok(constants.some((c) => c.name.endsWith('.DEFAULT_NAME')));
});

// ==================== Import 提取 ====================

test('parseJavaFile: import 提取（单类型 + 通配）', async () => {
  const source = `
package com.example.user;

import com.example.order.Order;
import com.example.order.*;
import java.util.List;
import static com.example.Constants.MAX;

public class UserService {}
`;
  const result = await parseJavaFile(
    '/fake-project/src/main/java/com/example/user/UserService.java',
    ROOT,
    source,
  );

  assert.ok(result.imports.includes('com.example.order.Order'));
  assert.ok(result.imports.includes('com.example.order.*'));
  assert.ok(result.imports.includes('java.util.List'));
  // 静态 import 应跳过
  assert.ok(!result.imports.some((i) => i.includes('Constants.MAX')));
  assert.ok(!result.imports.some((i) => i.startsWith('static')));
});

// ==================== Javadoc 提取 ====================

test('parseJavaFile: Javadoc 注释提取', async () => {
  const source = `
/**
 * 用户服务类
 * 处理用户相关业务逻辑
 */
public class UserService {
    /**
     * 根据ID查询用户
     * @param id 用户ID
     * @return 用户对象
     */
    public User findById(Long id) {
        return null;
    }
}
`;
  const result = await parseJavaFile(
    '/fake-project/src/main/java/com/example/user/UserService.java',
    ROOT,
    source,
  );

  const classNode = result.elements.find((e) => e.type === 'class');
  assert.ok(classNode?.attrs.jsDoc?.includes('用户服务类'));

  const method = result.elements.find((e) => e.type === 'function');
  assert.ok(method?.attrs.jsDoc?.includes('根据ID查询用户'));
});
