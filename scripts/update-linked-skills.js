#!/usr/bin/env node
/**
 * 维护者脚本：抓取联动 Skill 最新版到 ai-layer/linked-skills/（打包快照）。
 * 由 `npm run update-skills` 调用。
 * 用户侧实时更新请用 `wpw skills update`（直接拉到当前项目 .claude/skills/）。
 */
const path = require('path');
const { fetchLinkedSkills } = require('../dist/lib/linked-skills');

const repoRoot = path.join(__dirname, '..');
const destDir = path.join(repoRoot, 'ai-layer', 'linked-skills');

(async () => {
  try {
    console.log('抓取联动 Skill 到打包快照 ...');
    const manifest = await fetchLinkedSkills({ destDir, configDir: repoRoot });
    console.log(`\n已更新 ${manifest.skills.length} 个联动 Skill → ${path.relative(repoRoot, destDir)}/`);
    for (const s of manifest.skills) {
      console.log(`  ${s.installAs.padEnd(20)} ← ${s.repo}@${s.ref} (${s.commit.slice(0, 7)})  [${s.fetchedAt}]`);
    }
  } catch (e) {
    console.error('抓取失败：', e.message);
    process.exit(1);
  }
})();
