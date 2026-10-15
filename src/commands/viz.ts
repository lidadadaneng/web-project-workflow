import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getActiveDir, getArchivedDir, listChanges } from '../lib/state';
import { listGraphSummaries } from '../viz/store';
import { startVizServer } from '../viz/server';

/**
 * 解析前端产物目录。
 *
 * 顺序：显式 --ui → 仓库内的 viz/dist（开发态）→ 包内 viz-ui（发布态）
 */
function resolveUiDir(explicit?: string): string | undefined {
  if (explicit) {
    const p = path.resolve(explicit);
    return fs.existsSync(p) ? p : undefined;
  }
  const candidates = [
    path.join(__dirname, '..', '..', 'viz', 'dist'), // <repo>/dist/commands → <repo>/viz/dist
    path.join(__dirname, '..', 'viz-ui'), // 包内随发版携带
  ];
  return candidates.find((p) => fs.existsSync(path.join(p, 'index.html')));
}

export function registerViz(program: Command): void {
  program
    .command('viz')
    .description('启动可视化控制台（真实读写工作区：提供 /api，并可托管前端产物）')
    .option('--root <dir>', '工作区根目录（默认当前目录）')
    .option('-p, --port <n>', '监听端口', '7788')
    .option('--host <host>', '监听地址', '127.0.0.1')
    .option('-g, --graph <name>', '默认图谱名', 'default')
    .option('--ui <dir>', '前端产物目录（不传则自动探测 viz/dist）')
    .action(async (opts: {
      root?: string;
      port: string;
      host: string;
      graph: string;
      ui?: string;
    }) => {
      const root = path.resolve(opts.root ?? process.cwd());

      if (!fs.existsSync(root)) {
        console.error(`工作区不存在: ${root}`);
        process.exit(1);
      }
      if (!fs.existsSync(path.join(root, 'wpw'))) {
        console.warn(`[警告] ${root} 下没有 wpw/ 目录，可能尚未执行 wpw init。`);
      }

      const uiDir = resolveUiDir(opts.ui);
      const handle = await startVizServer({
        root,
        graph: opts.graph,
        uiDir,
        port: Number(opts.port),
        host: opts.host,
      });

      const changes = listChanges(root);
      const graphs = listGraphSummaries(root);

      console.log(`wpw viz 已启动`);
      console.log(`  工作区: ${root}`);
      console.log(`  接口:   ${handle.url}/api/meta`);
      console.log(`  需求:   ${changes.length} 个活跃${fs.existsSync(getArchivedDir(root)) ? '（归档目录已就绪）' : ''}`);
      if (changes.length === 0) {
        console.log(`         暂无可视需求——可在控制台「工作流看板」直接新建，或执行 wpw new <名称>`);
      }
      console.log(
        `  图谱:   ${graphs.length ? graphs.map((g) => `${g.name}(${g.totalNodes} 节点)`).join(', ') : '未构建（执行 wpw graph build）'}`,
      );
      if (uiDir) {
        console.log(`  控制台: ${handle.url}  （前端产物: ${uiDir}）`);
      } else {
        console.log(`  控制台: 未找到前端产物，仅提供 API`);
        console.log(`         开发态请在 viz/ 下执行 npm run dev（Vite 已配置代理到本服务）`);
        console.log(`         或以 --ui <viz/dist> 指定构建产物`);
      }
      console.log(`  按 Ctrl+C 退出`);

      const shutdown = () => {
        handle.close().then(() => process.exit(0));
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
}