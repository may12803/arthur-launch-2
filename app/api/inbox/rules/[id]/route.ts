import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

interface RulePatch {
  name?: string;
  match_from_pattern?: string | null;
  match_subject_pattern?: string | null;
  match_intent?: string | null;
  action?: "archive" | "delete" | "draft" | "flag";
  confidence_min?: number;
  priority?: number;
  enabled?: boolean;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deny = authGate(req);
  if (deny) return deny;

  const { id } = await params;

  let body: RulePatch;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const allowed: (keyof RulePatch)[] = [
    "name",
    "match_from_pattern",
    "match_subject_pattern",
    "match_intent",
    "action",
    "confidence_min",
    "priority",
    "enabled",
  ];

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key as keyof RulePatch];
  }

  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("arthur_inbox_rules")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deny = authGate(req);
  if (deny) return deny;

  const { id } = await params;

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("arthur_inbox_rules")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
