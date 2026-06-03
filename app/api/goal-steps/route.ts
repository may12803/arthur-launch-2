import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate, rateLimit } from "@/lib/_auth";

export const runtime = "nodejs";

const INBOX_GOAL_TITLE = "Inbox";

async function findOrCreateInboxGoal(): Promise<string> {
  const db = getSupabaseAdmin();
  const { data: existing } = await db
    .from("arthur_goals")
    .select("id")
    .eq("title", INBOX_GOAL_TITLE)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await db
    .from("arthur_goals")
    .insert({
      title: INBOX_GOAL_TITLE,
      description: "Standalone tasks not tied to a strategic goal.",
      status: "approved",
      priority: 3,
      tags: ["inbox"],
    })
    .select("id")
    .single();
  if (error || !created) throw new Error(error?.message ?? "inbox-goal create failed");
  return created.id as string;
}

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const { searchParams } = new URL(req.url);
  const statusCsv = searchParams.get("status");
  const arthurOnly = searchParams.get("arthur_only") === "1";
  const goalId = searchParams.get("goal_id");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "200", 10) || 200, 500);

  const db = getSupabaseAdmin();
  let q = db
    .from("arthur_goal_steps")
    .select("*, arthur_goals!inner(id, title, status, priority, tags)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (statusCsv) {
    const arr = statusCsv.split(",").map(s => s.trim()).filter(Boolean);
    if (arr.length) q = q.in("status", arr);
  }
  if (arthurOnly) q = q.not("arthur_action", "is", null);
  if (goalId) q = q.eq("goal_id", goalId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const rl = await rateLimit("goal-steps-post", 30, 60);
  if (rl) return rl;

  let body: {
    title?: string;
    description?: string;
    arthur_action?: string | null;
    estimated_minutes?: number | null;
    goal_id?: string;
  };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  let goalId = body.goal_id;
  if (!goalId) {
    try {
      goalId = await findOrCreateInboxGoal();
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  const db = getSupabaseAdmin();

  const { data: maxRow } = await db
    .from("arthur_goal_steps")
    .select("seq")
    .eq("goal_id", goalId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSeq = ((maxRow?.seq as number | undefined) ?? 0) + 1;

  const { data: step, error } = await db
    .from("arthur_goal_steps")
    .insert({
      goal_id: goalId,
      seq: nextSeq,
      title: body.title.trim(),
      description: body.description?.trim() ?? null,
      arthur_action: body.arthur_action?.trim() ?? null,
      estimated_minutes: body.estimated_minutes ?? null,
      status: "pending",
    })
    .select("*, arthur_goals!inner(id, title, status, priority, tags)")
    .single();

  if (error || !step) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }
  return NextResponse.json(step, { status: 201 });
}
