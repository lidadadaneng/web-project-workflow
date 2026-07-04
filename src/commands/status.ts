import { Command } from 'commander';
import { listChanges, loadState, ChangeState } from '../lib/state';

export function registerStatus(program: Command): void {
  program
    .command('status [name]')
    .description('查看需求状态')
    .option('-c, --change <name>', '需求名')
    .option('--json', 'JSON 输出')
    .action(
      (name: string | undefined, opts: { change?: string; json?: boolean }) => {
        const root = process.cwd();
        const target = opts.change || name;

        if (!target) {
          const changes = listChanges(root);
          if (changes.length === 0) {
            console.log('无活跃需求');
            return;
          }
          if (opts.json) {
            const items = changes
              .map((c) => loadState(root, c))
              .filter(Boolean) as ChangeState[];
            console.log(JSON.stringify(items, null, 2));
          } else {
            for (const c of changes) {
              const s = loadState(root, c);
              if (s) console.log(`${c}  ${summarize(s)}`);
            }
          }
          return;
        }

        const state = loadState(root, target);
        if (!state) {
          console.error(`需求不存在: ${target}`);
          process.exit(1);
        }
        if (opts.json) {
          console.log(JSON.stringify(state, null, 2));
        } else {
          printStatus(state);
        }
      },
    );
}

function summarize(s: ChangeState): string {
  const ids = Object.keys(s.status);
  const done = ids.filter((id) => s.status[id as keyof typeof s.status] === 'done').length;
  return `[${done}/${ids.length} 阶段完成]`;
}

function printStatus(s: ChangeState): void {
  console.log(`需求: ${s.name}  (schema: ${s.schema})`);
  console.log('阶段:');
  for (const [id, status] of Object.entries(s.status)) {
    console.log(`  ${id.padEnd(10)} ${status}`);
  }
  if (s.decisions.explore?.chosenOption) {
    console.log(`决策: explore = ${s.decisions.explore.chosenOption}`);
  }
  console.log(`进度: ${s.progress.completedTasks}/${s.progress.totalTasks}`);
}
