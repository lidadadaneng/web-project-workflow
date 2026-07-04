#!/usr/bin/env node
/**
 * dev:link —— 编译并全局链接 wpw（本地测试用，手动触发）。
 *
 * 与 `npm link` 的区别：显式先编译，名字清晰表达"开发/测试用链接"。
 * `prepare`（npm 生命周期）只在 install/pack/publish 时自动编译，不自动链接，
 * 避免 publish 时误链全局。
 */
const { execSync } = require('child_process');

console.log('→ 编译 dist/ ...');
execSync('npm run build', { stdio: 'inherit' });

console.log('→ 全局链接 wpw ...');
// --ignore-scripts：跳过 npm link 触发的 prepare（已显式编译，避免重复 build）
execSync('npm link --ignore-scripts', { stdio: 'inherit' });

console.log('✓ wpw 已编译并全局链接（wpw 可用）');
