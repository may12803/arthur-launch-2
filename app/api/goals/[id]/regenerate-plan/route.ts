import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authGate, rateLimit } from "@/lib/_auth";

export const runtime = "nodejs";

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
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  return data.content[0]?.text ?? "";
}

function stripFences(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const deny = authGate(req);
  if (deny) return deny;

  const rl = await rateLimit("goals-regen", 10, 60);
  if (rl) return rl;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { feedback?: string };

  const db = getSupabaseAdmin();
  const { data: goal, error: fetchError } = await db
    .from("arthur_goals")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !goal) {
    return NextResponse.json({ error: "goal not found" }, { status: 404 });
  }

  const prompt = `You are Arthur, an AI executive assistant for Daniel May.

Goal title: "${goal.title as string}"
${goal.description ? `Goal description: "${goal.description as string}"` : ""}
${goal.due_iso ? `Due: ${new Date(goal.due_iso as string).toLocaleDateString("en-US", { timeZone: "America/Detroit" })}` : ""}
Priority: ${goal.priority as number} (1=urgent, 5=someday)
${body.feedback ? `\nDaniel's feedback on previous plan: "${body.feedback}"` : ""}

Respond ONLY with valid JSON (no markdown fences):
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
}`;

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
    .eq("id", id);

  await db.from("arthur_goal_steps").delete().eq("goal_id", id);
  if (parsed.steps?.length > 0) {
    await db.from("arthur_goal_steps").insert(
      parsed.steps.map((s, i) => ({
        goal_id:           id,
        seq:               s.seq ?? i + 1,
        title:             s.title,
        description:       s.description ?? null,
        arthur_action:     s.arthur_action ?? null,
        estimated_minutes: s.estimated_minutes ?? null,
        status:            "pending",
      }))
    );
  }

  const { data: updated } = await db
    .from("arthur_goals")
    .select("*, arthur_goal_steps(*)")
    .eq("id", id)
    .single();

  return NextResponse.json(updated);
}
