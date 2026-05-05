import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate, rateLimit } from "@/lib/_auth";

export const runtime = "nodejs";

// ── Haiku helper ───────────────────────────────────────────────────────────────

async function callHaiku(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key":       process.env.ANTHROPIC_API_KEY!,
    },
    body: JSON.stringify({
      model:      "claude-haiku-4-5",
      max_tokens: 1500,
      messages:   [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content[0]?.text ?? "";
}

function stripFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
}

// ── GET /api/goals ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const db = getSupabaseAdmin();
  const { data: goals, error } = await db
    .from("arthur_goals")
    .select("*, arthur_goal_steps(*)")
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result = (goals ?? []).map((g: Record<string, unknown>) => ({
    ...g,
    arthur_goal_steps: ((g.arthur_goal_steps as Record<string, unknown>[]) ?? []).sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) => (a.seq as number) - (b.seq as number)
    ),
  }));

  return NextResponse.json(result);
}

// ── POST /api/goals ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  const rl = await rateLimit("goals-post", 20, 60);
  if (rl) return rl;

  let body: { title?: string; description?: string; due_iso?: string; priority?: number };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const db = getSupabaseAdmin();

  const { data: goal, error: insertError } = await db
    .from("arthur_goals")
    .insert({
      title:       body.title.trim(),
      description: body.description?.trim() ?? null,
      due_iso:     body.due_iso ?? null,
      priority:    body.priority ?? 3,
      status:      "planning",
    })
    .select()
    .single();

  if (insertError || !goal) {
    return NextResponse.json({ error: insertError?.message ?? "insert failed" }, { status: 500 });
  }

  try {
    const prompt = `You are Arthur, an AI executive assistant. Daniel May (entrepreneur, runs Dabney & Co cocktail bar + olldae SaaS + Aspen & May holding company) has a new goal.

Goal title: "${goal.title as string}"
${goal.description ? `Goal description: "${goal.description as string}"` : ""}
${goal.due_iso ? `Due: ${new Date(goal.due_iso as string).toLocaleDateString("en-US", { timeZone: "America/Detroit" })}` : ""}
Priority: ${goal.priority as number} (1=urgent, 5=someday)

Respond ONLY with valid JSON (no markdown fences) in this exact shape:
{
  "plan_md": "## Game Plan\\n\\nMarkdown plan here...",
  "steps": [
    {
      "seq": 1,
      "title": "Step title",
      "description": "What needs to happen",
      "arthur_action": "send email to X",
      "estimated_minutes": 30
    }
  ]
}

Rules:
- plan_md: 3-6 sentences strategic overview in markdown. Be specific to Daniel's context.
- steps: 3-7 concrete steps, sequenced logically
- arthur_action: if Arthur can autonomously do this step (send email, create calendar event, draft proposal, generate report, look up data), provide a brief description. If Daniel must do it himself (make a phone call, sign a document, attend a meeting), set to null.
- estimated_minutes: realistic estimate per step
- Keep titles short (under 60 chars). Be direct and action-oriented.`;

    const rawText = await callHaiku(prompt);
    const parsed = JSON.parse(stripFences(rawText)) as {
      plan_md: string;
      steps: Array<{
        seq: number;
        title: string;
        description?: string;
        arthur_action?: string | null;
        estimated_minutes?: number;
      }>;
    };

    await db
      .from("arthur_goals")
      .update({ plan_md: parsed.plan_md, plan_generated_at: new Date().toISOString() })
      .eq("id", goal.id as string);

    if (parsed.steps?.length > 0) {
      await db.from("arthur_goal_steps").insert(
        parsed.steps.map((s, i) => ({
          goal_id:           goal.id as string,
          seq:               s.seq ?? i + 1,
          title:             s.title,
          description:       s.description ?? null,
          arthur_action:     s.arthur_action ?? null,
          estimated_minutes: s.estimated_minutes ?? null,
          status:            "pending",
        }))
      );
    }
  } catch (e) {
    console.error("[goals/POST] haiku error:", (e as Error).message);
  }

  const { data: finalGoal } = await db
    .from("arthur_goals")
    .select("*, arthur_goal_steps(*)")
    .eq("id", goal.id as string)
    .single();

  const result = {
    ...(finalGoal ?? goal),
    arthur_goal_steps: ((finalGoal as Record<string, unknown> | null)?.arthur_goal_steps as Record<string, unknown>[] ?? []).sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) => (a.seq as number) - (b.seq as number)
    ),
  };
  return NextResponse.json(result, { status: 201 });
}
