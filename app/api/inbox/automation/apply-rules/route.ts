import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface Rule {
  id: string;
  name: string;
  match_from_pattern: string | null;
  match_subject_pattern: string | null;
  match_intent: string | null;
  action: "archive" | "delete" | "draft" | "flag";
  confidence_min: number;
  enabled: boolean;
  priority: number;
}

interface Settings {
  automation_enabled: boolean;
  classification_enabled: boolean;
  rules_enabled: boolean;
  drafting_enabled: boolean;
  rate_limit_per_hour: number;
}

interface EmailRow {
  id: string;
  from_email: string;
  subject: string | null;
  body_text: string | null;
  classification: {
    intent: string;
    confidence: number;
    urgency: string;
    venue: string;
    reasoning: string;
  } | null;
}

// Intent categories that must NEVER be auto-acted on (only flagged for review)
const PROTECTED_INTENTS = new Set(["personal", "legal"]);

function matchesRule(email: EmailRow, rule: Rule): boolean {
  const classification = email.classification;
  const confidence = classification?.confidence ?? 0;
  if (confidence < rule.confidence_min) return false;

  if (rule.match_from_pattern) {
    const pat = rule.match_from_pattern.toLowerCase().replace(/%/g, ".*").replace(/_/g, ".");
    if (!new RegExp(`^${pat}$`).test(email.from_email.toLowerCase())) return false;
  }

  if (rule.match_subject_pattern) {
    const subj = (email.subject ?? "").toLowerCase();
    const pat = rule.match_subject_pattern.toLowerCase().replace(/%/g, ".*").replace(/_/g, ".");
    if (!new RegExp(pat).test(subj)) return false;
  }

  if (rule.match_intent) {
    if (classification?.intent !== rule.match_intent) return false;
  }

  return true;
}

async function generateDraftBody(
  email: EmailRow,
  groqKey: string
): Promise<string> {
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
        {
          role: "system",
          content: `You are Arthur, the AI chief-of-staff for Daniel May at LOVELEEDAY Studios / Dabney & Co.
Draft a concise, professional email reply. No filler phrases. Match the tone of the inbound email.
Output ONLY the reply body text — no subject line, no greeting header, just the body.`,
        },
        {
          role: "user",
          content: `Draft a reply to this email:\n\nFrom: ${email.from_email}\nSubject: ${email.subject ?? "(no subject)"}\n\n${(email.body_text ?? "").slice(0, 2000)}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 400,
    }),
  });

  if (!resp.ok) return "";
  const json = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
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

  const db = getSupabaseAdmin();

  // Fetch settings
  const { data: settingsRow, error: settingsErr } = await db
    .from("arthur_inbox_settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (settingsErr || !settingsRow) {
    return NextResponse.json({ error: "could not load settings" }, { status: 500 });
  }

  const settings = settingsRow as Settings;

  if (!settings.automation_enabled || !settings.rules_enabled) {
    return NextResponse.json({ ok: true, skipped: "disabled", applied: 0 });
  }

  // Rate limit check: count Arthur's actions in the last hour
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count: recentCount } = await db
    .from("arthur_inbox_actions")
    .select("id", { count: "exact", head: true })
    .eq("actor", "arthur")
    .gte("created_at", oneHourAgo);

  if ((recentCount ?? 0) >= settings.rate_limit_per_hour) {
    return NextResponse.json({ ok: true, applied: 0, halted: "rate_limit" });
  }

  // Fetch unprocessed classified emails
  const { data: emails, error: emailsErr } = await db
    .from("arthur_inbox_emails")
    .select("id,from_email,subject,body_text,classification")
    .not("classification", "is", null)
    .is("auto_action", null)
    .eq("direction", "inbound")
    .limit(50);

  if (emailsErr) {
    return NextResponse.json({ error: emailsErr.message }, { status: 500 });
  }

  if (!emails || emails.length === 0) {
    return NextResponse.json({ ok: true, applied: 0, audit_ids: [] });
  }

  // Fetch enabled rules sorted by priority asc, created_at desc
  const { data: rules, error: rulesErr } = await db
    .from("arthur_inbox_rules")
    .select("*")
    .eq("enabled", true)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: false });

  if (rulesErr) {
    return NextResponse.json({ error: rulesErr.message }, { status: 500 });
  }

  const ruleList = (rules ?? []) as Rule[];
  const groqKey = process.env.GROQ_API_KEY ?? "";

  let applied = 0;
  const auditIds: string[] = [];
  let actionsThisRun = 0;
  const remaining = settings.rate_limit_per_hour - (recentCount ?? 0);

  for (const email of emails as EmailRow[]) {
    if (actionsThisRun >= remaining) break;

    const intent = email.classification?.intent ?? "";

    // Protected intents: always flag for review, never auto-archive/delete
    if (PROTECTED_INTENTS.has(intent)) {
      await db
        .from("arthur_inbox_emails")
        .update({ requires_review: true })
        .eq("id", email.id);

      const { data: auditRow } = await db
        .from("arthur_inbox_actions")
        .insert({
          email_id: email.id,
          rule_id: null,
          action: "flag",
          actor: "arthur",
          classification: email.classification,
          reasoning: `protected intent: ${intent} — flagged for review`,
        })
        .select("id")
        .single();

      if (auditRow) auditIds.push(auditRow.id);
      applied++;
      actionsThisRun++;
      continue;
    }

    // Find first matching rule
    const matchedRule = ruleList.find(r => matchesRule(email, r));
    if (!matchedRule) continue;

    const now = new Date().toISOString();
    let emailPatch: Record<string, unknown> = {
      auto_action: matchedRule.action,
      auto_action_at: now,
    };

    if (matchedRule.action === "archive") {
      emailPatch = { ...emailPatch, is_archived: true };
    } else if (matchedRule.action === "delete") {
      emailPatch = { ...emailPatch, is_deleted: true };
    } else if (matchedRule.action === "flag") {
      emailPatch = { ...emailPatch, requires_review: true };
    } else if (matchedRule.action === "draft") {
      if (!settings.drafting_enabled) continue; // skip if drafting not enabled
      const draftBody = await generateDraftBody(email, groqKey);
      emailPatch = {
        ...emailPatch,
        requires_review: true,
        draft_subject: `Re: ${email.subject ?? ""}`,
        draft_body: draftBody,
        draft_to: email.from_email,
      };
    }

    const { error: updateErr } = await db
      .from("arthur_inbox_emails")
      .update(emailPatch)
      .eq("id", email.id);

    if (updateErr) continue;

    const { data: auditRow } = await db
      .from("arthur_inbox_actions")
      .insert({
        email_id: email.id,
        rule_id: matchedRule.id,
        action: matchedRule.action,
        actor: "arthur",
        classification: email.classification,
        reasoning: `rule: ${matchedRule.name}`,
      })
      .select("id")
      .single();

    if (auditRow) auditIds.push(auditRow.id);
    applied++;
    actionsThisRun++;
  }

  return NextResponse.json({ ok: true, applied, audit_ids: auditIds });
}
