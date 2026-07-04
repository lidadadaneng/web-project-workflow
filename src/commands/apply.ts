import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getChangeDir, loadState } from '../lib/state';
import {
  getArtifact,
  getSchema,
  resolveFileName,
  ArtifactId,
} from '../schema/six-phase';

interface Task {
  id: string;
  text: string;
  state: 'pending' | 'in-progress' | 'done';
}

export function registerApply(program: Command): void {
  program
    .command('apply <name>')
    .description('实施准备（返回 contextFiles/tasks/progress）')
    .option('--json', 'JSON 输出')
    .option('--from <task>', '断点恢复：从指定任务继续')
    .action((name: string, opts: { json?: boolean; from?: string }) => {
      const root = process.cwd();
      const state = loadState(root, name);
      if (!state) {
        console.error(`需求不存在: ${name}`);
        process.exit(1);
      }
      const schema = getSchema(state.schema);

      // apply 门禁检查
      const missing = schema.apply.requires.filter(
        (req) => state.status[req] !== 'done',
      );
      if (missing.length > 0) {
        const result = {
          state: 'blocked' as const,
          missing,
          message: `前置未完成: ${missing.join(', ')}`,
        };
        console.log(opts.json ? JSON.stringify(result, null, 2) : result.message);
        process.exit(1);
      }

      // 测试用例驱动提示：testplan 未完成则警告（apply 以测试用例驱动，跳过影响质量）
      const warnings: string[] = [];
      const testplanStatus = state.status['testplan'];
      if (testplanStatus !== 'done') {
        warnings.push(
          testplanStatus === 'skipped'
            ? 'testplan 已跳过：apply 无法以测试用例驱动，开发后也无法验证用例通过，可能影响代码质量。推荐不跳过（重新 /wpw:test）'
            : 'testplan 未完成：推荐先执行 /wpw:test 生成测试用例，apply 以测试用例驱动开发，开发后验证用例全通过',
        );
      }

      // contextFiles：已 done 阶段的文档路径
      const contextFiles: Record<string, string> = {};
      for (const art of schema.artifacts) {
        if (state.status[art.id] === 'done') {
          contextFiles[art.id] = path.join(
            getChangeDir(root, name),
            resolveFileName(art, name),
          );
        }
      }

      // tasks：从 Plan 解析
      const tasksFrom = schema.apply.tasksFrom;
      const planArtifact = getArtifact(schema, tasksFrom);
      const planPath = path.join(
        getChangeDir(root, name),
        resolveFileName(planArtifact, name),
      );
      const allTasks = parseTasks(planPath);
      const total = allTasks.length;
      const completed = allTasks.filter((t) => t.state === 'done').length;

      const tasks =
        opts.from && opts.from !== '1'
          ? allTasks.filter((t) => Number(t.id) >= Number(opts.from))
          : allTasks;

      const result = {
        state: 'ready' as const,
        contextFiles,
        tasks,
        progress: { total, completed, remaining: total - completed },
        warnings,
      };

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`需求: ${name}  进度: ${completed}/${total}`);
        for (const t of tasks) {
          const mark =
            t.state === 'done' ? '[x]' : t.state === 'in-progress' ? '[🔄]' : '[ ]';
          console.log(`  ${mark} ${t.id}. ${t.text}`);
        }
        for (const w of warnings) console.log(`⚠️  ${w}`);
      }
    });
}

function parseTasks(planPath: string): Task[] {
  if (!fs.existsSync(planPath)) return [];
  const content = fs.readFileSync(planPath, 'utf8');
  const tasks: Task[] = [];
  let id = 0;
  for (const line of content.split('\n')) {
    // 匹配 - [ ] / - [x] / - [🔄]
    const m = line.match(/^-\s*\[([ x]|🔄)\]\s*(.+)$/);
    if (m) {
      id++;
      const mark = m[1];
      const taskState: Task['state'] =
        mark === 'x' ? 'done' : mark === '🔄' ? 'in-progress' : 'pending';
      const text = m[2].replace(/^\d+\.\s*/, '');
      tasks.push({ id: String(id), text, state: taskState });
    }
  }
  return tasks;
}
