import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("arthur_inbox_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

interface SettingsPatch {
  automation_enabled?: boolean;
  classification_enabled?: boolean;
  rules_enabled?: boolean;
  drafting_enabled?: boolean;
  rate_limit_per_hour?: number;
}

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  let body: SettingsPatch;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const allowed: (keyof SettingsPatch)[] = [
    "automation_enabled",
    "classification_enabled",
    "rules_enabled",
    "drafting_enabled",
    "rate_limit_per_hour",
  ];

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("arthur_inbox_settings")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
