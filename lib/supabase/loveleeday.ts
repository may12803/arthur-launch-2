import { createBrowserClient } from "@supabase/ssr";

// Browser client for the CLIENT PORTAL only (/client/*). Points at the
// separate `loveleeday` Supabase project (client tenants/deliverables) —
// NOT the `arthur` project used by lib/supabase/client.ts for Daniel's own
// admin/MFA session. Kept as a distinct module (distinct project URL, so
// @supabase/ssr's cookie storage key is automatically namespaced apart from
// the admin session's `sb-<arthur-ref>-auth-token` cookie) so the two auth
// systems can never collide or be confused for one another.
//
// Lazy-init so module load doesn't crash when the Loveleeday env vars are
// unset (e.g. local dev without the vault sourced). Page renders; first
// .auth/.from()/.rpc() call throws if env is missing.
type AnyClient = ReturnType<typeof createBrowserClient>;

let _client: AnyClient | null = null;

function getClient(): AnyClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  // Prefer the classic anon key (what createBrowserClient expects); fall
  // back to the newer publishable key if that's the only one configured.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL and NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY (or _PUBLISHABLE_KEY) must be set"
    );
  }
  _client = createBrowserClient(url, key);
  return _client;
}

// Proxy preserves `loveleeday.from(...)` / `.auth` call sites without
// forcing every call site to invoke a getter function.
export const loveleeday: AnyClient = new Proxy({} as AnyClient, {
  get(_target, prop) {
    const c = getClient() as unknown as Record<string | symbol, unknown>;
    const value = c[prop as string | symbol];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(c) : value;
  },
});
