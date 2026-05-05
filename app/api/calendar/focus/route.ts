import { NextRequest, NextResponse } from "next/server";
import { authGate } from "@/lib/_auth";

export const runtime = "nodejs";

interface CalEvent {
  id: string;
  type: string;
  title: string;
  start: string;
  all_day: boolean;
  location?: string | null;
  description?: string | null;
}

export async function POST(req: NextRequest) {
  const deny = authGate(req);
  if (deny) return deny;

  let body: { events?: CalEvent[] };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const events = body.events ?? [];
  if (events.length === 0) {
    return NextResponse.json({ focus: "Nothing on your calendar today." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Graceful fallback
    const sorted = [...events].sort((a, b) => {
      const order: Record<string, number> = { approval: 0, reservation: 1, gcal: 2, ticket: 3, tracking: 4 };
      return (order[a.type] ?? 5) - (order[b.type] ?? 5);
    });
    const fallback = sorted.slice(0, 5).map(e => `• ${e.title}`).join("\n");
    return NextResponse.json({ focus: fallback });
  }

  const eventList = events.map(e => {
    const time = e.all_day ? "(all day)" : new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `[${e.type.toUpperCase()}] ${time} — ${e.title}${e.location ? ` @ ${e.location}` : ""}`;
  }).join("\n");

  const prompt = `Today's calendar items for Daniel May (entrepreneur, Dabney & Co, olldae, Essex Brownell):\n\n${eventList}\n\nGenerate a short "what to focus on" list — 3-5 bullet points, most urgent first. Prioritize: pending email replies > reservations/meetings > deliveries. Be specific and terse. No preamble. Just bullets starting with "•".`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) throw new Error(`Anthropic ${res.status}`);
    const data = await res.json() as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find(b => b.type === "text")?.text ?? "";
    return NextResponse.json({ focus: text.trim() || "Nothing urgent today." });
  } catch (e) {
    console.error("[calendar/focus]", (e as Error).message);
    // Fallback
    const sorted = [...events].sort((a, b) => {
      const order: Record<string, number> = { approval: 0, reservation: 1, gcal: 2, ticket: 3, tracking: 4 };
      return (order[a.type] ?? 5) - (order[b.type] ?? 5);
    });
    return NextResponse.json({ focus: sorted.slice(0, 5).map(e => `• ${e.title}`).join("\n") });
  }
}
