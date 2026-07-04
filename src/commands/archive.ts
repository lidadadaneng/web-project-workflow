import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getChangeDir, getArchivedDir } from '../lib/state';

export function registerArchive(program: Command): void {
  program
    .command('archive <name>')
    .description('归档需求到 wpw/archived/YYYY-MM/')
    .action((name: string) => {
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
      console.log(`已归档: ${name} → ${path.relative(root, dest)}`);
    });
}
