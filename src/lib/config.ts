/**
 * workflow.config.yaml 读写。
 *
 * 项目级配置：project.type、模板覆盖（commands.<cmd>.output）。
 * 已存在时只更新路径字段，保留用户自定义配置。
 */
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface CommandConfig {
  input?: string[];
  output?: string[];
}

export interface WorkflowConfig {
  version: string;
  project: {
    name?: string;
    type?: string;
  };
  inputSkillRoot?: string;
  outputTemplateRoot?: string;
  commands?: Record<string, CommandConfig>;
}

const DEFAULT_CONFIG: WorkflowConfig = {
  version: '1.0.0',
  project: {
    name: '',
    type: 'auto',
  },
};

export function getConfigPath(root: string): string {
  return path.join(root, 'workflow.config.yaml');
}

export function loadConfig(root: string): WorkflowConfig {
  const p = getConfigPath(root);
  if (!fs.existsSync(p)) return { ...DEFAULT_CONFIG };
  const raw = yaml.load(fs.readFileSync(p, 'utf8')) as Partial<WorkflowConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    project: { ...DEFAULT_CONFIG.project, ...(raw.project || {}) },
  };
}

export function saveConfig(root: string, config: WorkflowConfig): void {
  const content = yaml.dump(config, { lineWidth: 120 });
  fs.writeFileSync(getConfigPath(root), content, 'utf8');
}

/**
 * 确保配置存在：已存在则只补全缺失的路径字段，保留用户自定义；
 * 不存在则生成默认配置。
 */
export function ensureConfig(root: string): WorkflowConfig {
  const existing = loadConfig(root);
  const updated: WorkflowConfig = {
    ...existing,
    inputSkillRoot: existing.inputSkillRoot ?? '.claude/skills/modules',
    outputTemplateRoot:
      existing.outputTemplateRoot ?? '.claude/skills/wpw-workflow/templates',
  };
  saveConfig(root, updated);
  return updated;
}

export function getProjectType(root: string): string {
  const config = loadConfig(root);
  return config.project?.type ?? 'auto';
}

/** 获取某命令的 output 模板配置（非空则覆盖默认） */
export function getCommandOutput(
  root: string,
  command: string,
): string[] | undefined {
  const config = loadConfig(root);
  return config.commands?.[command]?.output;
}
