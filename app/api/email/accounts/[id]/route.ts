import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deny = authGate(req);
  if (deny) return deny;

  const { id } = await params;
  const db = getSupabaseAdmin();

  // Fetch the row first to get grant_id
  const { data: acct, error: fetchErr } = await db
    .from("arthur_email_accounts")
    .select("grant_id")
    .eq("id", id)
    .single();

  if (fetchErr || !acct) {
    return NextResponse.json({ error: "account not found" }, { status: 404 });
  }

  // Soft-delete in DB
  const { error: updateErr } = await db
    .from("arthur_email_accounts")
    .update({ is_active: false })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Best-effort: revoke grant from Nylas (non-blocking)
  const nylasApiKey = process.env.NYLAS_API_KEY;
  if (nylasApiKey) {
    try {
      await fetch(`https://api.us.nylas.com/v3/grants/${acct.grant_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${nylasApiKey}` },
      });
    } catch (e) {
      console.warn("[email/accounts] Nylas grant revoke failed:", (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, id });
}
