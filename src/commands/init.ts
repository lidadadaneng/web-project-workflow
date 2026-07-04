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

      // 2. 创建工作区目录（知识库统一纳入 wpw/，不再单独保留 docs/）
      fs.mkdirSync(path.join(root, 'wpw', 'active'), { recursive: true });
      fs.mkdirSync(path.join(root, 'wpw', 'archived'), { recursive: true });
      fs.mkdirSync(path.join(root, 'wpw', 'knowledge', 'experiences'), { recursive: true });

      // 3. 释放 AI 层（SKILL.md + commands/wpw + hooks）到 .claude/
      const released = releaseAiLayer(root);

      // 4. 释放联动 Skill 快照（brainstorming/code-reviewer/Humanizer-zh）到 .claude/skills/
      releaseLinkedSkills(root);

      console.log(`已初始化 wpw 项目: ${root}`);
      console.log(`  project.type: ${config.project?.type ?? 'auto'}`);
      console.log(`  目录: wpw/active, wpw/archived, wpw/knowledge`);
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

/**
 * 释放打包的联动 Skill 快照（ai-layer/linked-skills/*）到 .claude/skills/。
 * 快照由维护者 `npm run update-skills` 抓取；若不存在，提示用户跑 `wpw skills update` 实时拉取。
 */
function releaseLinkedSkills(root: string): void {
  const srcCandidates = [
    path.join(__dirname, '..', 'ai-layer', 'linked-skills'), // dist/ai-layer/linked-skills
    path.join(__dirname, '..', '..', 'ai-layer', 'linked-skills'), // 包根/ai-layer/linked-skills
  ];
  const src = srcCandidates.find((p) => fs.existsSync(p));
  const dest = path.join(root, '.claude', 'skills');
  if (!src) {
    console.log('  联动 Skill: (未找到打包快照，运行 `wpw skills update` 实时拉取最新版)');
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
      count++;
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d); // manifest 等
    }
  }
  console.log(`  联动 Skill: ${count} 个已释放到 .claude/skills/（wpw skills update 可更新到最新）`);
}
