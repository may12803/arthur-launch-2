import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const db = getSupabaseAdmin();

  // Fetch last 200 audit actions, join email subject + rule name manually
  const { data: actions, error } = await db
    .from("arthur_inbox_actions")
    .select(`
      id,
      email_id,
      rule_id,
      action,
      actor,
      classification,
      reasoning,
      reverted,
      reverted_at,
      created_at,
      arthur_inbox_emails!email_id(from_email, subject, auto_action),
      arthur_inbox_rules!rule_id(name)
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ actions: actions ?? [] });
}
