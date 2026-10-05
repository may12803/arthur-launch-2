import { HttpError } from './types.ts';
import type { FetchLike } from './types.ts';

export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(value);
  return Number.isNaN(when) ? null : Math.max(0, when - now);
}

export async function requestJson<T = any>(fetch: FetchLike, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    throw new HttpError(res.status, `HTTP ${res.status} from ${new URL(url).host}`, parseRetryAfter(res.headers.get('retry-after')), text.slice(0, 500));
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(res.status, `non-JSON response from ${new URL(url).host}`, null, text.slice(0, 200));
  }
}

export function formBody(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.set(k, v);
  return u.toString();
}

export function basicAuth(user: string, pass: string): string {
  return 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
}
