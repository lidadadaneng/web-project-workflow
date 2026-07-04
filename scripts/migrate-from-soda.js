#!/usr/bin/env node
/**
 * 迁移脚本：docs/features/active/ → wpw/active/
 *
 * - ARD-{需求}.md → PRD-{需求}.md
 * - Test-{需求}.md → TestPlan-{需求}.md
 * - 根据已存在文档生成 .wpw.yaml（存在的标记 done，未存在标记 pending）
 * - Explore 阶段对老需求标记 skipped（原 soda 无此阶段）
 */
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcDir = path.join(root, 'docs', 'features', 'active');
const destDir = path.join(root, 'wpw', 'active');

if (!fs.existsSync(srcDir)) {
  console.error('未找到 docs/features/active/，无需迁移');
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });

let migrated = 0;
for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const name = entry.name;
  const srcReq = path.join(srcDir, name);
  const destReq = path.join(destDir, name);
  fs.mkdirSync(destReq, { recursive: true });

  const status = {
    brd: 'pending',
    prd: 'pending',
    explore: 'skipped', // 老 soda 无 Explore，默认跳过
    design: 'pending',
    plan: 'pending',
    testplan: 'pending',
  };

  for (const file of fs.readdirSync(srcReq)) {
    let destFile = file;
    if (file.startsWith('ARD-')) destFile = file.replace('ARD-', 'PRD-');
    if (file.startsWith('Test-') && !file.startsWith('TestPlan-')) {
      destFile = file.replace('Test-', 'TestPlan-');
    }
    fs.copyFileSync(path.join(srcReq, file), path.join(destReq, destFile));

    if (file.startsWith('ARD-') || file.startsWith('PRD-')) status.prd = 'done';
    if (file.startsWith('BRD-')) status.brd = 'done';
    if (file.startsWith('Explore-')) status.explore = 'done';
    if (file.startsWith('Design-')) status.design = 'done';
    if (file.startsWith('Plan-')) status.plan = 'done';
    if (file.startsWith('TestPlan-') || file.startsWith('Test-')) status.testplan = 'done';
  }

  const yaml =
    `name: ${name}\n` +
    `createdAt: ${new Date().toISOString()}\n` +
    `schema: wpw-six-phase\n` +
    `status:\n` +
    `  brd: ${status.brd}\n` +
    `  prd: ${status.prd}\n` +
    `  explore: ${status.explore}\n` +
    `  design: ${status.design}\n` +
    `  plan: ${status.plan}\n` +
    `  testplan: ${status.testplan}\n` +
    `decisions: {}\n` +
    `progress:\n` +
    `  totalTasks: 0\n` +
    `  completedTasks: 0\n` +
    `config:\n` +
    `  projectType: auto\n`;
  fs.writeFileSync(path.join(destReq, '.wpw.yaml'), yaml);

  console.log(`已迁移: ${name}`);
  migrated++;
}

console.log(`\n迁移完成：${migrated} 个需求。请运行 wpw list 验证。`);
console.log('确认无误后可删除旧目录：rm -rf docs/features/');
