import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { ensureConfig } from '../lib/config';

export function registerInit(program: Command): void {
  program
    .command('init [path]')
    .description('初始化项目：生成 workflow.config.yaml + 目录 + 释放 AI 层')
    .action((target?: string) => {
      const root = target ? path.resolve(target) : process.cwd();

      // 1. 生成/更新 config（已存在则只补全路径字段）
      const config = ensureConfig(root);

      // 2. 创建工作区目录
      fs.mkdirSync(path.join(root, 'wpw', 'active'), { recursive: true });
      fs.mkdirSync(path.join(root, 'wpw', 'archived'), { recursive: true });
      fs.mkdirSync(path.join(root, 'docs', 'knowledge'), { recursive: true });

      // 3. 释放 AI 层（SKILL.md + commands/wpw + hooks）到 .claude/
      const released = releaseAiLayer(root);

      console.log(`已初始化 wpw 项目: ${root}`);
      console.log(`  project.type: ${config.project?.type ?? 'auto'}`);
      console.log(`  目录: wpw/active, wpw/archived, docs/knowledge`);
      console.log(
        released
          ? `  AI 层: .claude/skills/wpw-workflow/, .claude/commands/wpw/, .claude/skills/wpw-workflow/hooks/`
          : `  AI 层: (未找到 ai-layer 源，跳过)`,
      );
    });
}

function releaseAiLayer(root: string): boolean {
  const srcCandidates = [
    path.join(__dirname, '..', 'ai-layer'), // dist/ai-layer
    path.join(__dirname, '..', '..', 'ai-layer'), // 包根/ai-layer
  ];
  const src = srcCandidates.find((p) => fs.existsSync(p));
  if (!src) return false;
  const dest = path.join(root, '.claude');
  copyDir(src, dest);
  return true;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile() && entry.name !== '.gitkeep') fs.copyFileSync(s, d);
  }
}
