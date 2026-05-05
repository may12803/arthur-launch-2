import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("arthur_system_manifest")
      .select("payload, pushed_at")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "manifest unavailable — writer may not have pushed yet" },
        { status: 503 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "no manifest row found — run manifest-writer.js to seed" },
        { status: 404 }
      );
    }

    const payload = data.payload as Record<string, unknown>;
    return NextResponse.json(
      { ...payload, pushed_at: data.pushed_at },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Arthur-Manifest": "1",
        },
      }
    );
  } catch (err) {
    console.error("[manifest] GET error:", err);
    return NextResponse.json(
      { error: "internal error reading manifest" },
      { status: 500 }
    );
  }
}
