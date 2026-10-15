/**
 * OpenAI 兼容大模型客户端（服务端代理）。
 *
 * 为什么走服务端而不是浏览器直连：
 *   1. 浏览器直连第三方 API 会被 CORS 挡掉；
 *   2. 「图谱增强」需要在请求前先跑一遍上下文管线，这活儿在服务端做最自然；
 *   3. API Key 仍然只存在浏览器 localStorage，每次请求随 body 带上来，
 *      服务端只用于转发、绝不落盘（与 ApiConfig 页的承诺一致）。
 *
 * 用量则落盘：每次调用把 usage 追加到 <root>/.wpw-console/usage.jsonl，
 * 这是「Token 统计」页唯一的数据来源——真实但会随使用逐步累积。
 */
import * as fs from 'fs';
import * as path from 'path';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
}

export interface UsageEntry {
  ts: number;
  change?: string;
  phase?: string;
  model: string;
  input: number;
  output: number;
}

const USAGE_DIR = path.join('.wpw-console');
const USAGE_FILE = 'usage.jsonl';

function chatEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
}

function modelsEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/models`;
}

/**
 * 流式对话。每收到一段增量文本就回调 onDelta，返回累计用量。
 *
 * 部分兼容实现只在最后一个 chunk 里给 usage，所以既收 `stream_options.include_usage`
 * 的 usage，也在缺省时按字符数粗估兜底。
 */
export async function streamChat(
  cfg: LlmConfig,
  messages: ChatMessage[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
): Promise<Usage> {
  const res = await fetch(chatEndpoint(cfg.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`大模型接口返回 ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`);
  }

  let usage: Usage | null = null;
  let text = '';
  let buffer = '';

  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 以空行分隔事件；只处理完整的行
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let chunk: any;
      try {
        chunk = JSON.parse(payload);
      } catch {
        continue;
      }

      const delta: string | undefined = chunk?.choices?.[0]?.delta?.content;
      if (delta) {
        text += delta;
        onDelta(delta);
      }
      if (chunk?.usage) {
        usage = {
          promptTokens: chunk.usage.prompt_tokens ?? 0,
          completionTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }
  }

  // 兼容实现不给 usage 时按字符数粗估（中文约 1 字 ≈ 1 token）
  if (!usage) {
    usage = {
      promptTokens: Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 2),
      completionTokens: Math.ceil(text.length / 2),
    };
  }
  return usage;
}

/**
 * 真实连通性探测：优先打 /models（便宜），失败则退化为一次最小 chat 调用。
 */
export async function probeLlm(cfg: LlmConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(modelsEndpoint(cfg.baseUrl), {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
    });
    if (res.ok) {
      return { ok: true, message: '连接成功（/models 可用）' };
    }
  } catch {
    // 落到下面的 chat 探测
  }

  try {
    const res = await fetch(chatEndpoint(cfg.baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
      }),
    });
    if (res.ok) return { ok: true, message: '连接成功（chat 探测可用）' };
    const detail = await res.text().catch(() => '');
    return { ok: false, message: `连接失败 ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}` };
  } catch (e) {
    return { ok: false, message: `连接失败：${(e as Error).message}` };
  }
}

// ==================== 用量记录 ====================

function usagePath(root: string): string {
  return path.join(root, USAGE_DIR, USAGE_FILE);
}

/** 追加一条用量记录；写失败不抛错（统计是辅助能力，不能拖垮对话） */
export function appendUsage(root: string, entry: UsageEntry): void {
  try {
    fs.mkdirSync(path.join(root, USAGE_DIR), { recursive: true });
    fs.appendFileSync(usagePath(root), JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    console.warn(`[viz] 写入用量日志失败: ${(e as Error).message}`);
  }
}

export function readUsage(root: string): UsageEntry[] {
  const p = usagePath(root);
  if (!fs.existsSync(p)) return [];

  const entries: UsageEntry[] = [];
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as UsageEntry;
      if (typeof obj?.ts === 'number') entries.push(obj);
    } catch {
      // 跳过损坏行
    }
  }
  return entries.sort((a, b) => a.ts - b.ts);
}

export interface TokenStats {
  byChange: { name: string; input: number; output: number }[];
  byPhase: { phase: string; input: number; output: number }[];
  byTime: { date: string; input: number; output: number }[];
}

/**
 * 把用量日志聚合成前端图表需要的三个维度。
 *
 * 只保留最近 14 天，避免长时间使用后 byTime 轴被拉得没法看。
 */
export function aggregateUsage(entries: UsageEntry[]): TokenStats {
  const byChange = new Map<string, { input: number; output: number }>();
  const byPhase = new Map<string, { input: number; output: number }>();
  const byTime = new Map<string, { input: number; output: number }>();

  for (const e of entries) {
    const change = e.change ?? '（未指定需求）';
    const phase = e.phase ?? '对话';
    const d = new Date(e.ts);
    const date = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    for (const [map, key] of [
      [byChange, change],
      [byPhase, phase],
      [byTime, date],
    ] as const) {
      const agg = map.get(key) ?? { input: 0, output: 0 };
      agg.input += e.input;
      agg.output += e.output;
      map.set(key, agg);
    }
  }

  const toList = (map: Map<string, { input: number; output: number }>, key: string) =>
    [...map.entries()].map(([k, v]) => ({ [key]: k, input: v.input, output: v.output }));

  return {
    byChange: toList(byChange, 'name') as TokenStats['byChange'],
    byPhase: toList(byPhase, 'phase') as TokenStats['byPhase'],
    byTime: toList(byTime, 'date').slice(-14) as TokenStats['byTime'],
  };
}