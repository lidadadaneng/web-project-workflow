import { Command } from 'commander';
import { listChanges, loadState, ChangeState } from '../lib/state';

export function registerList(program: Command): void {
  program
    .command('list')
    .description('列出所有需求')
    .option('--json', 'JSON 输出')
    .action((opts: { json?: boolean }) => {
      const root = process.cwd();
      const changes = listChanges(root);
      if (opts.json) {
        const items = changes
          .map((c) => loadState(root, c))
          .filter(Boolean) as ChangeState[];
        console.log(JSON.stringify(items, null, 2));
        return;
      }
      if (changes.length === 0) {
        console.log('无活跃需求');
        return;
      }
      for (const c of changes) {
        const s = loadState(root, c);
        if (s) {
          const ids = Object.keys(s.status);
          const done = ids.filter(
            (id) => s.status[id as keyof typeof s.status] === 'done',
          ).length;
          console.log(`${c}  [${done}/${ids.length} 阶段完成]`);
        }
      }
    });
}
