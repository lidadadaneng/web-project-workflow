/**
 * viz 本地服务（零依赖，只用 Node 内置 http）。
 *
 * 职责：
 *   - 提供 /api/* 接口（真实读写工作区，见 routes.ts）
 *   - 可选托管前端构建产物（viz/dist），非 /api 路径回落 index.html（SPA）
 *
 * 刻意不引 express 等依赖：这个服务只在本地跑，内置 http 足够，
 * 也避免给 CLI 增加体积。
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';
import { createHandlers, type Route, type VizRequest, type VizResponse } from './routes';

export interface VizServerOptions {
  /** 工作区根目录 */
  root: string;
  /** 默认图谱名 */
  graph?: string;
  /** 前端产物目录（不传则只提供 API） */
  uiDir?: string;
}

export interface VizServerHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

function matchRoute(routes: Route[], method: string, pathname: string): {
  route: Route;
  params: Record<string, string>;
} | null {
  for (const route of routes) {
    if (route.method !== method) continue;
    const routeParts = route.pattern.split('/');
    const pathParts = pathname.split('/');
    if (routeParts.length !== pathParts.length) continue;

    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < routeParts.length; i++) {
      const rp = routeParts[i];
      if (rp.startsWith(':')) params[rp.slice(1)] = decodeURIComponent(pathParts[i]);
      else if (rp !== pathParts[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('请求体不是合法 JSON');
  }
}

function serveStatic(
  uiDir: string,
  pathname: string,
  res: http.ServerResponse,
): void {
  const rel = pathname.replace(/^\/+/, '');
  let file = path.join(uiDir, rel);
  // 防目录穿越
  if (!file.startsWith(uiDir)) {
    res.writeHead(403).end('forbidden');
    return;
  }

  if (!rel || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(uiDir, 'index.html'); // SPA 回落
  }
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('前端产物不存在（先执行 viz 的 npm run build，或用 --ui 指定目录）');
    return;
  }

  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

export function createVizServer(options: VizServerOptions): http.Server {
  const root = path.resolve(options.root);
  const uiDir = options.uiDir ? path.resolve(options.uiDir) : undefined;
  const routes = createHandlers(root, options.graph ?? 'default');

  const server = http.createServer(async (req, res) => {
    // 本地工具：放开 CORS，方便 Vite dev server (5173) 直连
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = url.pathname;

    if (!pathname.startsWith('/api/')) {
      // 形如 /apichanges 的路径是拼错的接口调用，绝不能让它落到前端回落里去拿 index.html——
      // 那会以 200 + HTML 静默成功，前端只会在 JSON.parse 时才报错，极难排查。
      if (pathname.startsWith('/api') && uiDir) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            error: `接口路径拼写有误: ${pathname}（应为 /api/... ，注意 /api 后的斜杠）`,
          }),
        );
        return;
      }
      if (uiDir) serveStatic(uiDir, pathname, res);
      else res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('wpw viz 仅 API 模式（未指定 --ui）');
      return;
    }

    const matched = matchRoute(routes, req.method ?? 'GET', pathname);
    if (!matched) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `未知接口: ${req.method} ${pathname}` }));
      return;
    }

    const sse = () => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      return {
        send(event: string, data: unknown) {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        },
        end() {
          res.end();
        },
      };
    };

    const vizRes: VizResponse = {
      json(data, status = 200) {
        if (res.headersSent) return;
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
      },
      text(data, status = 200) {
        if (res.headersSent) return;
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(data);
      },
      sse,
    };

    const vizReq: VizRequest = {
      method: req.method ?? 'GET',
      params: matched.params,
      query: Object.fromEntries(url.searchParams.entries()),
      body: {},
      root,
    };

    try {
      vizReq.body = await readBody(req);
      await matched.route.handler(vizReq, vizRes);
    } catch (e) {
      const message = (e as Error).message;
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: message }));
      } else {
        res.end();
      }
    }
  });

  return server;
}

/** 启动服务，port 传 0 时由系统分配空闲端口 */
export function startVizServer(
  options: VizServerOptions & { port: number; host?: string },
): Promise<VizServerHandle> {
  const server = createVizServer(options);
  const host = options.host ?? '127.0.0.1';

  return new Promise((resolve, reject) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`端口 ${options.port} 已被占用，换个端口试试（--port）`));
      } else {
        reject(err);
      }
    });

    server.listen(options.port, host, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : options.port;
      resolve({
        url: `http://${host}:${port}`,
        port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}