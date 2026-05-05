import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

interface ConnectPageBody {
  page_id:           string;
  name:              string;
  page_access_token: string;
  business_id?:      string;
}

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  let body: ConnectPageBody;

  try {
    body = await req.json() as ConnectPageBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { page_id, name, page_access_token, business_id } = body;

  if (!page_id || !name || !page_access_token) {
    return NextResponse.json(
      { error: "page_id, name, and page_access_token are required" },
      { status: 400 }
    );
  }

  // Verify the token is valid by hitting the Graph API
  const verifyRes = await fetch(
    `https://graph.facebook.com/v19.0/me?access_token=${page_access_token}`
  );
  if (!verifyRes.ok) {
    const err = await verifyRes.text();
    return NextResponse.json(
      { error: `Meta token invalid: ${err.slice(0, 200)}` },
      { status: 400 }
    );
  }

  const db = getSupabaseAdmin();

  const { data, error } = await db
    .from("arthur_meta_pages")
    .upsert(
      {
        page_id,
        page_name:         name,
        page_access_token,
        business_id:       business_id ?? null,
        connected_at:      new Date().toISOString(),
      },
      { onConflict: "page_id" }
    )
    .select("id, page_id, page_name, connected_at")
    .single();

  if (error) {
    console.error("[meta/connect-page] insert error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, page: data });
}
