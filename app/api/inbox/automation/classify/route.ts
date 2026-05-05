import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Intent overrides applied before persisting — no LLM output can override these
const PERSONAL_FROM_PATTERNS = [
  /^may\.dj@yahoo\.com$/i,            // Daniel personal
  /^blackmarble\.m\.g@gmail\.com$/i,  // Daniel system
  /^daniel(\.may)?@/i,                // any daniel@
  /^kristie@/i,
  /kristiemay@/i,
  /@drinkswithdabney\.com$/i,         // Dabney team
  /@aspenandmay\.com$/i,              // Aspen & May team
  /@loveleedaystudios\.com$/i,        // LOVELEEDAY team (incl. arthur@ replies)
];
const LEGAL_SUBJECT_PATTERNS = /lawsuit|attorney|attorneys|legal|subpoena|cease and desist/i;

type Intent =
  | "newsletter"
  | "promotion"
  | "cold_sales"
  | "confirmation"
  | "catering"
  | "vendor_invoice"
  | "press"
  | "personal"
  | "legal"
  | "auto_reply"
  | "system"      // self-loops, pipeline tests, automated echoes — auto-delete
  | "other";

interface ClassificationResult {
  intent: Intent;
  urgency: "p0" | "p1" | "p2" | "p3";
  venue: "loveleeday" | "olldae" | "dabney" | "other";
  confidence: number;
  reasoning: string;
}

interface EmailToClassify {
  id: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  body_text: string | null;
}

// Self-loop = Arthur sending to itself for diagnostic / pipeline tests.
// from_email and to_email are the SAME mailbox, OR both are arthur@<our domains>.
function isSelfLoop(email: EmailToClassify): boolean {
  const f = (email.from_email || "").toLowerCase();
  const t = (email.to_email || "").toLowerCase();
  if (!f || !t) return false;
  if (f === t) return true;
  // Both arthur@ on any of our domains = system loop
  return f.startsWith("arthur@") && t.startsWith("arthur@");
}

function checkOverrides(email: EmailToClassify): Intent | null {
  // Self-loops = system / test artifact, never real correspondence
  if (isSelfLoop(email)) return "system";
  if (PERSONAL_FROM_PATTERNS.some(p => p.test(email.from_email))) return "personal";
  const haystack = `${email.subject ?? ""} ${email.body_text?.slice(0, 2000) ?? ""}`;
  if (LEGAL_SUBJECT_PATTERNS.test(haystack)) return "legal";
  return null;
}

// Pioneer (api.pioneer.ai) — primary classifier. Same team as GLiNER.
// Free inference until Aug 1 2026, hosts Llama 3.3 70B Instruct + adaptive fine-tuning.
async function classifyWithPioneer(email: EmailToClassify): Promise<ClassificationResult> {
  const key = process.env.PIONEER_API_KEY;
  if (!key) throw new Error("PIONEER_API_KEY not configured");

  const systemPrompt = `You are an email classifier for Arthur, an AI chief-of-staff. Reply with EXACTLY ONE JSON object — no fences, no extra text. Pick exactly ONE value per field:
{"intent":"newsletter"|"promotion"|"cold_sales"|"confirmation"|"catering"|"vendor_invoice"|"press"|"personal"|"legal"|"auto_reply"|"system"|"other","urgency":"p0"|"p1"|"p2"|"p3","venue":"loveleeday"|"olldae"|"dabney"|"other","confidence":0.00,"reasoning":"one sentence"}`;
  const userPrompt = `From: ${email.from_email}
To: ${email.to_email}
Subject: ${email.subject ?? "(no subject)"}
Body (first 1500 chars):
${(email.body_text ?? "").slice(0, 1500)}`;

  const resp = await fetch("https://api.pioneer.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "meta-llama/Llama-3.3-70B-Instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 200,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Pioneer error ${resp.status}: ${err}`);
  }
  const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const parsed = JSON.parse(clean) as ClassificationResult;
  // Defensive: some models return pipe-separated alternatives like "newsletter|other" — take first
  if (typeof parsed.intent === "string" && parsed.intent.includes("|")) {
    parsed.intent = parsed.intent.split("|")[0].trim() as ClassificationResult["intent"];
  }
  return parsed;
}

// Cerebras fallback — same prompt + parse logic as Groq, different endpoint
// Free-tier Cerebras gives us llama3.1-8b (plenty for classification) at ~50ms latency
async function classifyWithCerebras(email: EmailToClassify): Promise<ClassificationResult> {
  const key = process.env.CEREBRAS_API_KEY;
  if (!key) throw new Error("CEREBRAS_API_KEY not configured");

  const systemPrompt = `You are an email classifier. Reply with ONLY a valid JSON object matching:
{"intent":"newsletter|promotion|cold_sales|confirmation|catering|vendor_invoice|press|personal|legal|auto_reply|system|other","urgency":"p0|p1|p2|p3","venue":"loveleeday|olldae|dabney|other","confidence":0.00,"reasoning":"one sentence"}`;
  const userPrompt = `From: ${email.from_email}
To: ${email.to_email}
Subject: ${email.subject ?? "(no subject)"}
Body (first 1200 chars):
${(email.body_text ?? "").slice(0, 1200)}`;

  const resp = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.1-8b",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 200,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Cerebras error ${resp.status}: ${err}`);
  }
  const json = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
  const parsed = JSON.parse(clean) as ClassificationResult;
  // Defensive: 8B sometimes returns pipe-separated alternatives — take first
  if (typeof parsed.intent === "string" && parsed.intent.includes("|")) {
    parsed.intent = parsed.intent.split("|")[0].trim() as ClassificationResult["intent"];
  }
  return parsed;
}

async function classifyWithGroq(email: EmailToClassify): Promise<ClassificationResult> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("GROQ_API_KEY not configured");

  const systemPrompt = `You are an email classifier for Arthur, an AI chief-of-staff for a hospitality and SaaS entrepreneur.

Classify the email and respond with ONLY a valid JSON object — no markdown, no fences, no extra text.

Intent values (pick exactly one):
  newsletter     — recurring digest, blog update, mailing list
  promotion      — sale, discount, coupon, marketing offer
  cold_sales     — unsolicited vendor pitch, outreach, demo request
  confirmation   — order receipt, booking confirmation, account notification
  catering       — catering inquiry or event request for Dabney
  vendor_invoice — supplier invoice or bill
  press          — media inquiry, PR pitch, journalist
  personal       — friend, family, or team member (drinkswithdabney.com)
  legal          — attorney, lawsuit, subpoena, cease and desist
  auto_reply     — out-of-office, vacation auto-reply
  other          — anything that doesn't fit above

Urgency:
  p0 — requires action within 1 hour (crisis, legal, urgent client)
  p1 — requires action today
  p2 — requires action this week
  p3 — informational / no action needed

Venue:
  loveleeday — LOVELEEDAY Studios, agency work
  olldae     — olldae SaaS product
  dabney     — Dabney & Co bar/restaurant
  other      — unclear or general

Respond with exactly this shape:
{"intent":"...","urgency":"...","venue":"...","confidence":0.00,"reasoning":"one sentence"}`;

  const userPrompt = `From: ${email.from_email}
Subject: ${email.subject ?? "(no subject)"}
Body (first 1500 chars):
${(email.body_text ?? "").slice(0, 1500)}`;

  const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
      "User-Agent": "curl/8.0",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 200,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq error ${resp.status}: ${err}`);
  }

  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const raw = json.choices?.[0]?.message?.content ?? "";
  // Strip any accidental markdown fences
  const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

  let parsed: ClassificationResult;
  try {
    parsed = JSON.parse(clean) as ClassificationResult;
  } catch {
    throw new Error(`Groq returned unparseable JSON: ${raw.slice(0, 200)}`);
  }

  return parsed;
}

export async function POST(req: NextRequest) {
  const secret = process.env.AUTOMATION_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTOMATION_SECRET not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let batchSize = 20;
  try {
    const body = await req.json().catch(() => ({})) as { batch_size?: number };
    if (body.batch_size && typeof body.batch_size === "number") {
      batchSize = Math.min(body.batch_size, 50);
    }
  } catch {
    // no body is fine
  }

  const db = getSupabaseAdmin();

  const { data: emails, error: fetchErr } = await db
    .from("arthur_inbox_emails")
    .select("id,from_email,to_email,subject,body_text")
    .is("classification", null)
    .eq("direction", "inbound")
    .order("received_at", { ascending: false })
    .limit(batchSize);

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  if (!emails || emails.length === 0) {
    return NextResponse.json({ ok: true, classified: 0, errors: [] });
  }

  const errors: string[] = [];
  let classified = 0;

  for (const email of emails as EmailToClassify[]) {
    try {
      // Check hard overrides first (no LLM call needed)
      const overrideIntent = checkOverrides(email);

      let classification: ClassificationResult;
      let modelUsed = "override";
      if (overrideIntent) {
        classification = {
          intent: overrideIntent,
          urgency: overrideIntent === "legal" ? "p0" : overrideIntent === "personal" ? "p1" : "p3",
          venue: "other",
          confidence: 1.0,
          reasoning: `Override: matched ${overrideIntent} pattern without LLM`,
        };
      } else {
        // Provider chain: Pioneer (primary, adaptive) → Groq → Cerebras (final fallback)
        modelUsed = "pioneer-llama-3.3-70b-instruct";
        let lastErr: unknown = null;
        try {
          if (process.env.PIONEER_API_KEY) {
            classification = await classifyWithPioneer(email);
          } else {
            throw new Error("PIONEER_API_KEY not configured");
          }
        } catch (pioneerErr) {
          lastErr = pioneerErr;
          const msg = pioneerErr instanceof Error ? pioneerErr.message : String(pioneerErr);
          console.warn(`[classify] Pioneer failed (${msg.slice(0, 100)}), trying Groq`);
          modelUsed = "groq-llama-3.3-70b-versatile";
          try {
            classification = await classifyWithGroq(email);
          } catch (groqErr) {
            lastErr = groqErr;
            const msg2 = groqErr instanceof Error ? groqErr.message : String(groqErr);
            if (process.env.CEREBRAS_API_KEY) {
              console.warn(`[classify] Groq failed (${msg2.slice(0, 100)}), falling back to Cerebras`);
              classification = await classifyWithCerebras(email);
              modelUsed = "cerebras-llama3.1-8b";
            } else {
              throw lastErr;
            }
          }
        }
        // Apply post-LLM overrides too (belt-and-suspenders)
        const postOverride = checkOverrides(email);
        if (postOverride) classification.intent = postOverride;
      }

      const { error: updateErr } = await db
        .from("arthur_inbox_emails")
        .update({
          classification: {
            ...classification,
            model: modelUsed,
            classified_at: new Date().toISOString(),
          },
        })
        .eq("id", email.id);

      if (updateErr) {
        errors.push(`${email.id}: ${updateErr.message}`);
      } else {
        classified++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${email.id}: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, classified, errors });
}
