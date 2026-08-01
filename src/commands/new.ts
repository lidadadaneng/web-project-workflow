import { Command } from 'commander';
import {
  getChangeDir,
  initState,
  loadState,
  saveState,
  changeNameExists,
} from '../lib/state';
import { getProjectType } from '../lib/config';

export function registerNew(program: Command): void {
  program
    .command('new <name>')
    .description('创建新需求（生成 .wpw.yaml + 目录，幂等）')
    .option('--schema <name>', '使用的 schema', 'wpw-six-phase')
    .action((name: string, opts: { schema: string }) => {
      const root = process.cwd();

      // 全局重名检查（active + archived）
      // 需求名是全局唯一标识，归档后也不能重名
      const activeExisting = loadState(root, name);
      if (activeExisting) {
        console.log(`需求已存在: ${name}（幂等跳过）`);
        return;
      }
      if (changeNameExists(root, name)) {
        console.error(`错误：需求名 "${name}" 已存在（已归档）。`);
        console.error('需求名全局唯一（包括已归档需求）。');
        console.error('请使用其他名称，或考虑用 -v2、-redesign 等后缀区分迭代版本。');
        process.exit(1);
      }

      const projectType = getProjectType(root);
      const state = initState(name, projectType, opts.schema);
      saveState(root, state);
      console.log(`已创建需求: ${name}`);
      console.log(`  目录: ${getChangeDir(root, name)}`);
    });
}
