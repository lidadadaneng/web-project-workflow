import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getChangeDir, getArchivedDir } from '../lib/state';

export function registerArchive(program: Command): void {
  program
    .command('archive <name>')
    .description('归档需求到 wpw/archived/YYYY-MM/，并同步更新知识图谱（C 层能力 spec 变更自动检测）')
    .option('--no-graph', '跳过归档后的知识图谱更新')
    .action(async (name: string, opts: { graph?: boolean }) => {
      const root = process.cwd();
      const src = getChangeDir(root, name);
      if (!fs.existsSync(src)) {
        console.error(`需求不存在: ${name}`);
        process.exit(1);
      }
      const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
      const destDir = path.join(getArchivedDir(root), ym);
      const dest = path.join(destDir, name);
      fs.mkdirSync(destDir, { recursive: true });
      fs.renameSync(src, dest);
      console.log(`已归档: ${name} -> ${path.relative(root, dest)}`);

      // 归档后同步更新知识图谱，自动检测 wpw/specs/ 中的能力 spec 变更
      if (opts.graph !== false) {
        const graphDir = path.join(root, 'wpw', 'knowledge', 'graph');
        if (fs.existsSync(path.join(graphDir, 'graph.jsonl'))) {
          console.log('正在更新知识图谱...');
          try {
            const { updateGraph } = await import('../graph/builders/graph-builder');
            const result = await updateGraph(root);
            if (result) {
              console.log(
                `  图谱已更新: ${result.data.nodes.length} 节点, ${result.data.edges.length} 边`,
              );
            } else {
              console.log('  图谱已是最新');
            }
          } catch (e) {
            console.warn(`  图谱更新失败（不影响归档）: ${(e as Error).message}`);
          }
        } else {
          console.log('  知识图谱未构建，跳过更新（如需构建请执行 wpw graph build）');
        }
      }
    });
}
