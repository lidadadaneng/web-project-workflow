import { Command } from 'commander';
import { getChangeDir, initState, loadState, saveState } from '../lib/state';
import { getProjectType } from '../lib/config';

export function registerNew(program: Command): void {
  program
    .command('new <name>')
    .description('创建新需求（生成 .wpw.yaml + 目录，幂等）')
    .option('--schema <name>', '使用的 schema', 'wpw-six-phase')
    .action((name: string, opts: { schema: string }) => {
      const root = process.cwd();
      const existing = loadState(root, name);
      if (existing) {
        console.log(`需求已存在: ${name}（幂等跳过）`);
        return;
      }
      const projectType = getProjectType(root);
      const state = initState(name, projectType, opts.schema);
      saveState(root, state);
      console.log(`已创建需求: ${name}`);
      console.log(`  目录: ${getChangeDir(root, name)}`);
    });
}
