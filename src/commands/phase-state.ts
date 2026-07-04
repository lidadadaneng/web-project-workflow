import { Command } from 'commander';
import { setDecision, setStatus } from '../lib/state';
import { ArtifactId, getArtifact, sixPhaseSchema } from '../schema/six-phase';

function parseArtifact(phase: string): ArtifactId {
  const validIds = sixPhaseSchema.artifacts.map((a) => a.id);
  if (!validIds.includes(phase as ArtifactId)) {
    throw new Error(`未知阶段: ${phase}，合法值: ${validIds.join(', ')}`);
  }
  return phase as ArtifactId;
}

function requireChange(opts: { change?: string }): string {
  if (!opts.change) {
    console.error('缺少 -c, --change <name> 参数');
    process.exit(1);
  }
  return opts.change;
}

export function registerDone(program: Command): void {
  program
    .command('done <phase>')
    .description('标记阶段完成')
    .option('-c, --change <name>', '需求名')
    .action((phase: string, opts: { change?: string }) => {
      try {
        const id = parseArtifact(phase);
        const name = requireChange(opts);
        setStatus(process.cwd(), name, id, 'done');
        console.log(`已标记 ${name}.${id} = done`);
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
    });
}

export function registerSkip(program: Command): void {
  program
    .command('skip <phase>')
    .description('标记阶段跳过（仅 skippable 阶段如 explore）')
    .option('-c, --change <name>', '需求名')
    .action((phase: string, opts: { change?: string }) => {
      try {
        const id = parseArtifact(phase);
        const name = requireChange(opts);
        const artifact = getArtifact(sixPhaseSchema, id);
        if (!artifact.skippable) {
          console.error(
            `阶段 ${id} 不可跳过（仅 skippable 阶段可跳过，如 explore）`,
          );
          process.exit(1);
        }
        setStatus(process.cwd(), name, id, 'skipped');
        console.log(`已标记 ${name}.${id} = skipped`);
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
    });
}

export function registerDecision(program: Command): void {
  program
    .command('decision <phase>')
    .description('记录拍板决策')
    .option('-c, --change <name>', '需求名')
    .option('--option <choice>', '采纳的方案')
    .action((phase: string, opts: { change?: string; option?: string }) => {
      try {
        const id = parseArtifact(phase);
        const name = requireChange(opts);
        if (!opts.option) {
          console.error('缺少 --option <choice> 参数');
          process.exit(1);
        }
        setDecision(process.cwd(), name, id, opts.option);
        console.log(`已记录 ${name}.${id} 决策: ${opts.option}`);
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
    });
}
