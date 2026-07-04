/**
 * 项目类型嗅探。
 *
 * 当 workflow.config.yaml 的 project.type 为 auto 或缺失时，
 * 通过文件嗅探判断项目类型。
 */
import * as fs from 'fs';
import * as path from 'path';

export type ProjectType =
  | 'frontend-h5'
  | 'frontend-gattaran'
  | 'backend-java'
  | 'backend-go'
  | 'backend-node'
  | 'backend-python'
  | 'backend-php'
  | 'fullstack'
  | 'auto';

const FE_FRAMEWORKS = ['vue', 'react', 'nuxt', 'next', 'nuxtjs', '@vue/cli-service'];
const BE_FRAMEWORKS = ['express', 'koa', 'nest', 'fastify', '@nestjs/core'];

export function sniffProjectType(root: string): ProjectType {
  const has = (f: string) => fs.existsSync(path.join(root, f));

  if (has('pom.xml') || has('build.gradle')) return 'backend-java';
  if (has('go.mod')) return 'backend-go';

  if (has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
      const hasFe = FE_FRAMEWORKS.some((f) => f in deps);
      const hasBe = BE_FRAMEWORKS.some((f) => f in deps);
      if (hasFe && hasBe) return 'fullstack';
      if (hasFe) return 'frontend-h5';
      if (hasBe) return 'backend-node';
      return 'backend-node';
    } catch {
      return 'auto';
    }
  }

  if (
    has('requirements.txt') ||
    has('setup.py') ||
    has('pyproject.toml')
  ) {
    return 'backend-python';
  }
  if (has('composer.json')) return 'backend-php';

  return 'auto';
}

/**
 * 解析最终项目类型：配置非 auto 则用配置值，否则嗅探。
 * 一旦配置存在且 type 有效，禁止再次嗅探（与原 soda 规则一致）。
 */
export function resolveProjectType(
  root: string,
  configType?: string,
): ProjectType {
  if (configType && configType !== 'auto') {
    return configType as ProjectType;
  }
  return sniffProjectType(root);
}

/** 判断是否前端类型 */
export function isFrontend(type: ProjectType): boolean {
  return type === 'frontend-h5' || type === 'frontend-gattaran';
}

/** 判断是否后端类型 */
export function isBackend(type: ProjectType): boolean {
  return (
    type === 'backend-java' ||
    type === 'backend-go' ||
    type === 'backend-node' ||
    type === 'backend-python' ||
    type === 'backend-php'
  );
}
