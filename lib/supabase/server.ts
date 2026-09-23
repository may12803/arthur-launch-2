import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Read-only server client — safe in Server Components, where mutating
// cookies throws. Session refresh writes are silently dropped; callers that
// need to persist a session (Route Handlers, Server Actions) must use
// getSupabaseRouteClient() below instead.
export async function getSupabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

// Writable server client for use in Route Handlers and Server Actions only —
// both support mutating cookies via next/headers `cookies()`. Used by
// /api/login to establish the Supabase Auth (AAL1) session that
// supabase.auth.mfa.* needs, and by the MFA challenge/enroll flows if they
// ever move server-side.
export async function getSupabaseRouteClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: CookieToSet[]) => {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    }
  );
}
