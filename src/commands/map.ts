import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { getProjectType } from '../lib/config';
import { resolveProjectType } from '../lib/project-type';

interface KnowledgeGraph {
  projectType: string;
  tech: string[];
  entrypoints: string[];
  dirs: string[];
  apis: string[];
}

export function registerMap(program: Command): void {
  program
    .command('map')
    .description('扫描项目结构，生成知识图谱骨架')
    .option('--json', 'JSON 输出')
    .action((opts: { json?: boolean }) => {
      const root = process.cwd();
      const type = resolveProjectType(root, getProjectType(root));
      const graph = scanProject(root, type);
      if (opts.json) {
        console.log(JSON.stringify(graph, null, 2));
      } else {
        console.log(`项目类型: ${type}`);
        console.log(`技术栈: ${graph.tech.join(', ') || '(未识别)'}`);
        console.log(`入口文件: ${graph.entrypoints.join(', ') || '(未识别)'}`);
        console.log(`顶层目录: ${graph.dirs.join(', ')}`);
      }
    });
}

function scanProject(root: string, type: string): KnowledgeGraph {
  const graph: KnowledgeGraph = {
    projectType: type,
    tech: [],
    entrypoints: [],
    dirs: [],
    apis: [],
  };

  if (fs.existsSync(path.join(root, 'package.json'))) {
    graph.tech.push('Node.js');
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const known = [
        'vue',
        'react',
        'next',
        'nuxt',
        'express',
        'koa',
        'nest',
        'fastify',
        'typescript',
        'commander',
      ];
      for (const k of known) if (k in deps) graph.tech.push(k);
      if (pkg.main) graph.entrypoints.push(pkg.main);
      if (pkg.bin && typeof pkg.bin === 'object') {
        for (const v of Object.values(pkg.bin)) graph.entrypoints.push(String(v));
      }
    } catch {
      // ignore
    }
  }
  if (fs.existsSync(path.join(root, 'pom.xml'))) graph.tech.push('Java/Maven');
  if (fs.existsSync(path.join(root, 'go.mod'))) graph.tech.push('Go');
  if (
    fs.existsSync(path.join(root, 'requirements.txt')) ||
    fs.existsSync(path.join(root, 'pyproject.toml'))
  ) {
    graph.tech.push('Python');
  }

  graph.dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        !e.name.startsWith('.') &&
        e.name !== 'node_modules' &&
        e.name !== 'dist',
    )
    .map((e) => e.name);

  return graph;
}
