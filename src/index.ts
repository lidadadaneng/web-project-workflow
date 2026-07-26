#!/usr/bin/env node
/**
 * wpw - Web Project Workflow CLI
 *
 * AI-driven six-phase development workflow CLI.
 *确定性逻辑由本 CLI 承载，AI 层（Skill + /wpw:xxx 命令）调用本 CLI 完成状态/依赖/路径操作。
 */
import { program } from 'commander';
import { registerCommands } from './commands';
import packageJson from '../package.json';

registerCommands(program);

program
  .name('wpw')
  .description('Web Project Workflow - AI-driven six-phase development workflow CLI')
  .version(packageJson.version);

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(err.message);
  process.exit(1);
});
