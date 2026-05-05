import { NextRequest, NextResponse } from "next/server";
import { recordFeedback, type FeedbackPair, type Signal } from "@/lib/training/feedback-recorder";

const VALID_SIGNALS: Signal[] = ["accept", "reject", "edit", "implicit_reject"];

export async function POST(req: NextRequest) {
  let body: Partial<FeedbackPair>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.prompt || !body.response || !body.signal) {
    return NextResponse.json({ error: "prompt, response, and signal required" }, { status: 400 });
  }
  if (!VALID_SIGNALS.includes(body.signal)) {
    return NextResponse.json({ error: `signal must be one of ${VALID_SIGNALS.join("|")}` }, { status: 400 });
  }

  const result = await recordFeedback(body as FeedbackPair);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: result.id });
}
