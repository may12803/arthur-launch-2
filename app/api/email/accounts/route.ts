import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const deny = authGate(_req);
  if (deny) return deny;
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("arthur_email_accounts")
    .select("id,email,provider,display_name,connected_at,last_synced_at,is_active,metadata,google_refresh_token")
    .eq("is_active", true)
    .order("connected_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Never leak the raw refresh token to the client — expose a boolean flag only
  const safe = (data ?? []).map(({ google_refresh_token, ...rest }) => ({
    ...rest,
    has_google_calendar: google_refresh_token != null && google_refresh_token !== "",
  }));

  return NextResponse.json(safe);
}
