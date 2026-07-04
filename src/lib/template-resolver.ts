/**
 * 模板路径解析。
 *
 * 优先级（高 → 低）：
 *   1. workflow.config.yaml 的 commands.<cmd>.output（非空）→ 用指定模板
 *   2. project.type 默认模板（Fe / Server / fullstack 两套）
 *   3. project.type=auto → 嗅探文件决定
 *
 * 模板查找位置兼容开发期（src/templates）与发布期（包内 src/templates）。
 */
import * as fs from 'fs';
import * as path from 'path';
import { ArtifactId } from '../schema/six-phase';
import { getCommandOutput, loadConfig } from './config';
import {
  isBackend,
  isFrontend,
  ProjectType,
  resolveProjectType,
} from './project-type';

const PHASE_TO_CMD: Record<ArtifactId, string> = {
  brd: 'brd',
  prd: 'prd',
  explore: 'explore',
  design: 'design',
  plan: 'plan',
  testplan: 'test',
};

function templateRoots(): string[] {
  return [
    path.join(__dirname, '..', 'templates'), // 开发期 src/templates 或 dist/templates
    path.join(__dirname, '..', '..', 'src', 'templates'), // 编译期 包/src/templates
  ];
}

function findTemplate(name: string): string | null {
  for (const root of templateRoots()) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function defaultTemplateNames(id: ArtifactId, type: ProjectType): string[] {
  if (id === 'brd') return ['BRD.md'];
  if (id === 'prd') return ['PRD.md'];
  if (id === 'explore') return ['Explore.md'];

  const suffix = isFrontend(type) ? 'Fe' : isBackend(type) ? 'Server' : null;

  // fullstack 或 auto（嗅探失败）：返回 Fe + Server 两套，由 AI/用户选择
  if (id === 'design') {
    if (suffix) return [`Design-${suffix}.md`];
    return ['Design-Fe.md', 'Design-Server.md'];
  }
  if (id === 'plan') {
    if (suffix) return [`Plan-${suffix}.md`];
    return ['Plan-Fe.md', 'Plan-Server.md'];
  }
  if (id === 'testplan') {
    if (suffix) return [`Test-${suffix}.md`];
    return ['Test-Fe.md', 'Test-Server.md'];
  }
  return [];
}

export function resolveTemplates(root: string, id: ArtifactId): string[] {
  const config = loadConfig(root);
  const cmd = PHASE_TO_CMD[id];

  // 1. config commands.<cmd>.output 非空 → 用指定模板
  const output = getCommandOutput(root, cmd);
  if (output && output.length > 0) {
    const found = output
      .map((n) => findTemplate(n))
      .filter(Boolean) as string[];
    if (found.length > 0) return found;
  }

  // 2. project.type 默认模板（auto 则嗅探）
  const type = resolveProjectType(root, config.project?.type);
  const names = defaultTemplateNames(id, type);
  const found = names
    .map((n) => findTemplate(n))
    .filter(Boolean) as string[];
  if (found.length > 0) return found;

  return [];
}
