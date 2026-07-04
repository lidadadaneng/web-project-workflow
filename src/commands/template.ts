import { Command } from 'commander';
import { resolveTemplates } from '../lib/template-resolver';
import { ArtifactId, sixPhaseSchema } from '../schema/six-phase';

export function registerTemplate(program: Command): void {
  program
    .command('template <phase>')
    .description('获取模板路径')
    .option('-c, --change <name>', '需求名（可选，模板路径不依赖需求）')
    .option('--json', 'JSON 输出')
    .action((phase: string, opts: { change?: string; json?: boolean }) => {
      const root = process.cwd();
      const validIds = sixPhaseSchema.artifacts.map((a) => a.id);
      if (!validIds.includes(phase as ArtifactId)) {
        console.error(`未知阶段: ${phase}，合法值: ${validIds.join(', ')}`);
        process.exit(1);
      }

      try {
        const paths = resolveTemplates(root, phase as ArtifactId);
        if (opts.json) {
          console.log(JSON.stringify({ phase, templates: paths }, null, 2));
        } else {
          if (paths.length === 0) {
            console.error(`未找到阶段 ${phase} 的模板`);
            process.exit(1);
          }
          for (const p of paths) console.log(p);
        }
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
    });
}
