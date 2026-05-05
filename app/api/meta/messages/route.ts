import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const pageId = searchParams.get("page_id");

  const db = getSupabaseAdmin();

  let query = db
    .from("arthur_meta_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (pageId) {
    query = query.eq("page_id", pageId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? [] });
}
