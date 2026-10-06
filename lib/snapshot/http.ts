import { NextRequest, NextResponse } from 'next/server';
import { ApiError, asApiError, type Deps } from './service.ts';
import { getStore, validRunId } from './store.ts';
import { liveCatalog } from './catalog.ts';
import { SlidingWindow } from './limits.ts';
import { clientKeyFromHeaders } from './client-key.ts';
import { takeShared } from './shared-limit.ts';

const ALLOWED = new Set(['https://loveleedaystudios.com', 'https://www.loveleedaystudios.com']);
const DEV_ALLOWED = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const ok = ALLOWED.has(origin) || (process.env.NODE_ENV !== 'production' && DEV_ALLOWED.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'https://loveleedaystudios.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
    'Cache-Control': 'private, no-store',
    'X-Robots-Tag': 'noindex',
  };
}

export const preflight = (req: NextRequest) => new NextResponse(null, { status: 204, headers: corsHeaders(req) });

export function clientKey(req: NextRequest): string {
  return clientKeyFromHeaders((n) => req.headers.get(n));
}

export function deps(): Deps {
  return {
    store: getStore(),
    llm: process.env.CEREBRAS_API_KEY ? { apiKey: process.env.CEREBRAS_API_KEY } : undefined,
    catalog: () => liveCatalog(),
  };
}

export async function limited(req: NextRequest, limiter: SlidingWindow): Promise<NextResponse | null> {
  // Reads are cheap and high-volume: local window only. Uploads and runs also hit the shared counter.
  const key = clientKey(req);
  const r = limiter.name === 'read' ? limiter.take(key) : await takeShared(limiter, key);
  if (r.ok) return null;
  return NextResponse.json({ error: 'Too many requests. Try again later.', code: 'rate_limited' }, { status: 429, headers: { ...corsHeaders(req), 'Retry-After': String(r.retryAfterSec) } });
}

export function failure(req: NextRequest, e: unknown): NextResponse {
  const err = asApiError(e);
  if (err.status >= 500) console.log(`[snapshot] ${err.code}: ${e instanceof Error ? e.message : 'error'}`);
  const status = err.status >= 500 && /not configured/.test(e instanceof Error ? e.message : '') ? 503 : err.status;
  const message = status === 503 ? 'Snapshots are unavailable right now.' : err.message;
  return NextResponse.json({ error: message, code: err.code }, { status, headers: corsHeaders(req) });
}

export function checkId(id: string) {
  if (!validRunId(id)) throw new ApiError(404, 'This snapshot was not found or has expired.', 'not_found');
}
