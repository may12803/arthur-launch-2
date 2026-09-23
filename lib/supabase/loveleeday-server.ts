import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

function loveleedayUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL must be set");
  return url;
}

function loveleedayKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_PUBLISHABLE_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY (or _PUBLISHABLE_KEY) must be set");
  return key;
}

/**
 * Server client for the CLIENT PORTAL (/client/*), scoped to the separate
 * `loveleeday` Supabase project — never the `arthur` admin project. Read-only:
 * safe in Server Components, where mutating cookies throws. Session refresh
 * writes are silently dropped; use getLoveleedayRouteClient() in Route
 * Handlers/Server Actions that need to persist a session.
 */
export async function getLoveleedayServer() {
  const cookieStore = await cookies();
  return createServerClient(loveleedayUrl(), loveleedayKey(), {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  });
}

/**
 * Writable server client for Route Handlers and Server Actions only — both
 * support mutating cookies via next/headers `cookies()`. Used by anything
 * under /client that needs to establish or refresh a loveleeday-project
 * Supabase Auth session (sign-in, sign-up, accept-invite, invite creation).
 */
export async function getLoveleedayRouteClient() {
  const cookieStore = await cookies();
  return createServerClient(loveleedayUrl(), loveleedayKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet: CookieToSet[]) => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
