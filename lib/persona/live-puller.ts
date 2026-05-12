// Live persona puller — dashboard fetches latest persona from Supabase
// arthur_persona_live table at request time, with 60s in-memory cache.
// Falls back to bundled persona (lib/persona/arthur-system-prompt.ts) when
// Supabase row is missing or stale > 24h.
//
// Pair: ~/arthur/lib/integration/persona-pusher.js (local mtime watcher,
// launchd job com.arthur.persona-pusher) writes new persona content here.
// This module reads it.
//
// Together: persona edits on Daniel's Mac → mtime change → pusher → Supabase
// → puller → dashboard live response. <60s end-to-end. NO REDEPLOY NEEDED.

import { createClient } from "@supabase/supabase-js";

interface CachedPersona {
  content: string;
  fetchedAt: number;
  charCount: number;
  pushedAt: string;
}

let _cache: CachedPersona | null = null;
const CACHE_TTL_MS = 60_000;       // 60s
const STALE_FALLBACK_MS = 24 * 3600_000;  // 24h max staleness before fallback

let _supa: ReturnType<typeof createClient> | null = null;
function getSupa() {
  if (_supa) return _supa;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://ycqhiysewapmuuywdlyi.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supa = createClient(url, key, { auth: { persistSession: false } });
  return _supa;
}

export async function fetchLivePersona(): Promise<string | null> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) return _cache.content;
  const supa = getSupa();
  if (!supa) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supa as any).from("arthur_persona_live").select("content, char_count, pushed_at").eq("id", "current").maybeSingle();
    if (error || !data) return _cache?.content || null;  // use stale cache if available
    const row = data as { content: string; char_count: number; pushed_at: string };
    const pushedMs = new Date(row.pushed_at).getTime();
    if (Date.now() - pushedMs > STALE_FALLBACK_MS) return null;  // too stale → bundled fallback
    _cache = {
      content: row.content,
      fetchedAt: Date.now(),
      charCount: row.char_count,
      pushedAt: row.pushed_at,
    };
    return _cache.content;
  } catch {
    return _cache?.content || null;
  }
}

export function cacheStats() {
  return _cache ? {
    cached: true,
    chars: _cache.charCount,
    fetchedAt: new Date(_cache.fetchedAt).toISOString(),
    pushedAt: _cache.pushedAt,
    ageSec: Math.floor((Date.now() - _cache.fetchedAt) / 1000),
  } : { cached: false };
}
