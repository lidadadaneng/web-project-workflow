import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseSourceFile, isSupportedFile } from '../graph/parsers/source-parser';

// 临时目录
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wpw-java-test-'));
}

function writeFile(dir: string, relPath: string, content: string): string {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

// ==================== isSupportedFile ====================

test('isSupportedFile: .java 文件在 java 语言配置下被支持', () => {
  assert.ok(isSupportedFile('src/main/java/com/example/User.java', ['java']));
  assert.ok(isSupportedFile('User.java', ['java']));
});

test('isSupportedFile: .java 文件在无 java 配置时不被支持', () => {
  assert.ok(!isSupportedFile('User.java', ['typescript', 'javascript']));
});

test('isSupportedFile: java 与其他语言可共存', () => {
  assert.ok(isSupportedFile('User.java', ['typescript', 'java', 'vue']));
  assert.ok(isSupportedFile('app.ts', ['typescript', 'java', 'vue']));
});

// ==================== parseSourceFile 分发 ====================

test('parseSourceFile: .java 文件正确分发到 Java 解析器', async () => {
  const tmpDir = makeTempDir();
  try {
    const filePath = writeFile(
      tmpDir,
      'src/main/java/com/example/user/UserService.java',
      `
package com.example.user;

public class UserService {
    public User findById(Long id) {
        return null;
    }
}
`,
    );

    const result = await parseSourceFile(filePath, tmpDir);

    assert.equal(result.fileNode.type, 'file');
    assert.equal(result.fileNode.attrs.language, 'java');
    assert.ok(result.elements.some((e) => e.type === 'class' && e.name === 'UserService'));
    assert.ok(result.elements.some((e) => e.type === 'function' && e.name.endsWith('.findById')));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('parseSourceFile: Java 与 TS 文件互不干扰', async () => {
  const tmpDir = makeTempDir();
  try {
    const javaPath = writeFile(
      tmpDir,
      'src/main/java/com/example/UserService.java',
      'public class UserService {}',
    );
    const tsPath = writeFile(
      tmpDir,
      'src/utils/helper.ts',
      'export function help() { return 1; }',
    );

    const javaResult = await parseSourceFile(javaPath, tmpDir);
    const tsResult = await parseSourceFile(tsPath, tmpDir);

    assert.equal(javaResult.fileNode.attrs.language, 'java');
    assert.equal(tsResult.fileNode.attrs.language, 'typescript');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
