import { Command } from 'commander';
import { checkArtifact } from '../lib/dependency';
import { ArtifactId, getSchema, sixPhaseSchema } from '../schema/six-phase';

export function registerCheck(program: Command): void {
  program
    .command('check <phase>')
    .description('依赖检查（校验前置阶段是否完成）')
    .option('-c, --change <name>', '需求名')
    .option('--json', 'JSON 输出')
    .action((phase: string, opts: { change?: string; json?: boolean }) => {
      const root = process.cwd();
      if (!opts.change) {
        console.error('缺少 --change <name> 参数');
        process.exit(1);
      }

      // 校验 phase 是否合法
      const validIds = sixPhaseSchema.artifacts.map((a) => a.id);
      if (!validIds.includes(phase as ArtifactId)) {
        console.error(`未知阶段: ${phase}，合法值: ${validIds.join(', ')}`);
        process.exit(1);
      }

      try {
        const result = checkArtifact(root, opts.change, phase as ArtifactId);
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                artifact: result.artifact,
                canProceed: result.canProceed,
                missing: result.missing,
                warnings: result.warnings,
              },
              null,
              2,
            ),
          );
        } else {
          console.log(`阶段: ${result.artifact}`);
          console.log(`可继续: ${result.canProceed ? '是' : '否'}`);
          if (result.missing.length > 0) {
            console.log(`缺失前置: ${result.missing.join(', ')}`);
          }
          if (result.warnings.length > 0) {
            console.log('警告:');
            for (const w of result.warnings) console.log(`  - ${w}`);
          }
        }
        process.exit(result.canProceed ? 0 : 1);
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
    });
}
