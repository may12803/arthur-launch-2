import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-side reads and writes.
 *
 * `cache: "no-store"` is load-bearing, not hygiene. Next.js App Router patches global fetch and
 * caches it, and supabase-js issues its queries through that same fetch — so a row read once at
 * boot is served from cache for the life of the machine. On 2026-09-21 that turned a repaired
 * Google refresh token into a ghost: the new token was in the table and exchanged cleanly from a
 * laptop, while the deployed app kept replaying the revoked one from cache and reporting
 * invalid_grant. Only a machine restart cleared it. Credentials and state that change underneath
 * a long-lived process must never be cached.
 */
export function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
    }
  );
}
