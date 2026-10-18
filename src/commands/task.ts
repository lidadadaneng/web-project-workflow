import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getChangeDir, loadState, setProgress } from '../lib/state';
import { getArtifact, getSchema, resolveFileName } from '../schema/six-phase';
import { markTaskInPlan, PLAN_TASK_STATES, type PlanTaskState } from '../lib/artifact';

const VALID_STATES = PLAN_TASK_STATES;
type TaskState = PlanTaskState;

export function registerTask(program: Command): void {
  program
    .command('task <name>')
    .description('任务标记')
    .option('--mark <id>', '任务编号')
    .option('--state <state>', '任务状态：pending | in-progress | done')
    .action((name: string, opts: { mark?: string; state?: string }) => {
      if (!opts.mark || !opts.state) {
        console.error('需要 --mark <id> --state <state>');
        process.exit(1);
      }
      if (!VALID_STATES.includes(opts.state as TaskState)) {
        console.error(`无效状态: ${opts.state}，合法值: ${VALID_STATES.join(', ')}`);
        process.exit(1);
      }
      const newState = opts.state as TaskState;
      const root = process.cwd();
      const state = loadState(root, name);
      if (!state) {
        console.error(`需求不存在: ${name}`);
        process.exit(1);
      }
      const schema = getSchema(state.schema);
      const planArtifact = getArtifact(schema, schema.apply.tasksFrom);
      const planPath = path.join(
        getChangeDir(root, name),
        resolveFileName(planArtifact, name),
      );
      if (!fs.existsSync(planPath)) {
        console.error(`Plan 文件不存在: ${planPath}`);
        process.exit(1);
      }
      const { content, total, completed } = markTaskInPlan(planPath, opts.mark, newState);
      fs.writeFileSync(planPath, content, 'utf8');
      setProgress(root, name, total, completed);
      console.log(`已标记任务 ${opts.mark} = ${newState}（${completed}/${total}）`);
    });
}
