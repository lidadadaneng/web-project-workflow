import { Command } from 'commander';
import * as path from 'path';
import { fetchLinkedSkills, loadLinkedSkillsManifest, MANIFEST_NAME } from '../lib/linked-skills';

export function registerSkills(program: Command): void {
  const skills = program
    .command('skills')
    .description('联动 Skill 管理（brainstorming / code-reviewer / Humanizer-zh）');

  skills
    .command('update')
    .description('从 GitHub 拉取最新联动 Skill 到当前项目 .claude/skills/')
    .action(async () => {
      const destDir = path.join(process.cwd(), '.claude', 'skills');
      // dist/commands -> 包根（linked-skills.json 所在）
      const configDir = path.join(__dirname, '..', '..');
      let manifest;
      try {
        manifest = await fetchLinkedSkills({ destDir, configDir });
      } catch (e) {
        console.error('抓取失败：', (e as Error).message);
        process.exit(1);
      }
      console.log(
        `已更新 ${manifest.skills.length} 个联动 Skill → ${path.relative(process.cwd(), destDir)}/`,
      );
      for (const s of manifest.skills) {
        console.log(`  ${s.installAs.padEnd(20)} ← ${s.repo}@${s.ref} (${s.commit.slice(0, 7)})`);
      }
      console.log('\n提示：wpw init 释放的是打包快照；本命令直接拉各源仓库默认分支最新版。');
    });

  skills
    .command('list')
    .description('列出已安装联动 Skill 的来源与版本')
    .action(() => {
      const manifestPath = path.join(process.cwd(), '.claude', 'skills', MANIFEST_NAME);
      const manifest = loadLinkedSkillsManifest(manifestPath);
      if (!manifest || manifest.skills.length === 0) {
        console.log('未找到联动 Skill 安装记录。先运行 wpw init 或 wpw skills update。');
        return;
      }
      console.log('已安装联动 Skill：');
      for (const s of manifest.skills) {
        console.log(
          `  ${s.installAs.padEnd(20)} ← ${s.repo}@${s.ref} (${s.commit.slice(0, 7)})  [${s.fetchedAt}]`,
        );
      }
    });
}
