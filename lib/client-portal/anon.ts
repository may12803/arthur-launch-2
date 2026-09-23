import { createClient } from "@supabase/supabase-js";

// A session-less client for the public share routes: the recipient has no
// account. It can reach only share_preview / share_issue_code / share_redeem,
// and the latter two also require LOVELEEDAY_SHARE_SECRET, held by this server.
export function loveleedayAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY;
  if (!url || !key) throw new Error("LOVELEEDAY Supabase env is not set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function shareSecret(): string {
  const s = process.env.LOVELEEDAY_SHARE_SECRET;
  if (!s || s.length < 32) throw new Error("LOVELEEDAY_SHARE_SECRET is not set");
  return s;
}
