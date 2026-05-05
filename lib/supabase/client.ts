import { createBrowserClient } from "@supabase/ssr";

// Lazy-init so module load doesn't crash when NEXT_PUBLIC_SUPABASE_URL/KEY
// are unset on Fly. Page renders; first .from()/.auth/.rpc() throws if env missing.
type AnyClient = ReturnType<typeof createBrowserClient>;

let _client: AnyClient | null = null;

function getClient(): AnyClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  _client = createBrowserClient(url, key);
  return _client;
}

// Proxy preserves `supabase.from(...)` call sites without code changes.
export const supabase: AnyClient = new Proxy({} as AnyClient, {
  get(_target, prop) {
    const c = getClient() as unknown as Record<string | symbol, unknown>;
    const value = c[prop as string | symbol];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(c) : value;
  },
});
