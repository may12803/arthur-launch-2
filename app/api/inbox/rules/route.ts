import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("arthur_inbox_rules")
    .select("*")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rules: data ?? [] });
}

interface RuleBody {
  name: string;
  match_from_pattern?: string | null;
  match_subject_pattern?: string | null;
  match_intent?: string | null;
  action: "archive" | "delete" | "draft" | "flag";
  confidence_min?: number;
  priority?: number;
  enabled?: boolean;
}

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  let body: RuleBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.name || !body.action) {
    return NextResponse.json({ error: "name and action are required" }, { status: 400 });
  }

  const VALID_ACTIONS = ["archive", "delete", "draft", "flag"];
  if (!VALID_ACTIONS.includes(body.action)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("arthur_inbox_rules")
    .insert({
      name: body.name,
      match_from_pattern: body.match_from_pattern ?? null,
      match_subject_pattern: body.match_subject_pattern ?? null,
      match_intent: body.match_intent ?? null,
      action: body.action,
      confidence_min: body.confidence_min ?? 0.70,
      priority: body.priority ?? 100,
      enabled: body.enabled ?? true,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
