/**
 * Shared Nylas helpers used across email API routes.
 */

const NYLAS_BASE = "https://api.us.nylas.com";

// Entity → Nylas grant lookup. Canonical source is arthur_email_accounts in Supabase
// (queried at runtime by resolveGrantForEntity); this is a typed mirror for hot paths.
export type EmailEntity = "dabney" | "personal" | "yahoo" | "loveleeday" | "auto";

export interface NylasMailbox {
  email: string;
  grantId: string;
  provider: "gmail" | "imap" | "resend";
  entity: EmailEntity;
}

// Resolve the right grant for an entity by querying arthur_email_accounts.
// Supabase client passed in so this stays decoupled from /lib/supabase/admin.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveMailbox(entity: EmailEntity, supabaseAdmin: any): Promise<NylasMailbox | null> {
  // Map entity → email address
  const entityToEmail: Record<EmailEntity, string | null> = {
    dabney: "daniel.may@drinkswithdabney.com",
    personal: "blackmarble.m.g@gmail.com",
    yahoo: "may.dj@yahoo.com",
    loveleeday: "arthur@loveleedaystudios.com",
    auto: null,
  };
  const email = entityToEmail[entity];
  if (!email) return null;

  // LOVELEEDAY uses Resend (owned domain, no Nylas grant needed).
  if (entity === "loveleeday") {
    return { email, grantId: "", provider: "resend", entity };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("arthur_email_accounts")
      .select("email,grant_id,provider")
      .eq("email", email)
      .single();
    if (error || !data) return null;
    const row = data as { email: string; grant_id: string; provider: string };
    const provider = row.provider === "gmail" ? "gmail" : row.provider === "imap" ? "imap" : "gmail";
    return { email: row.email, grantId: row.grant_id, provider, entity };
  } catch {
    return null;
  }
}

/**
 * Send an email via a Nylas grant. Works for both Gmail and IMAP grants.
 * Returns { messageId } on success, { error } on failure.
 */
export async function sendEmailViaNylas(opts: {
  grantId: string;
  to: string | string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  replyToMessageId?: string;
  nylasApiKey: string;
}): Promise<{ messageId: string } | { error: string }> {
  const { grantId, to, subject, body, cc, bcc, replyToMessageId, nylasApiKey } = opts;
  if (!grantId) return { error: "grantId required" };
  if (!nylasApiKey) return { error: "NYLAS_API_KEY not configured" };

  const recipients = (Array.isArray(to) ? to : [to]).map(addr => ({ email: addr }));
  const payload: Record<string, unknown> = {
    to: recipients,
    subject,
    body,
  };
  if (cc?.length) payload.cc = cc.map(e => ({ email: e }));
  if (bcc?.length) payload.bcc = bcc.map(e => ({ email: e }));
  if (replyToMessageId) payload.reply_to_message_id = replyToMessageId;

  try {
    const res = await fetch(`${NYLAS_BASE}/v3/grants/${grantId}/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nylasApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { error: `Nylas ${res.status}: ${text.slice(0, 250)}` };
    }
    const data = await res.json() as { data?: { id?: string } };
    return { messageId: data.data?.id ?? "(no id)" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Move a Nylas message to the Archive folder for its grant.
 * Returns null on success, error string on failure.
 */
export async function archiveMessage(
  msgId: string,
  grantId: string,
  nylasApiKey: string
): Promise<string | null> {
  const archiveFolderId = `v0:${grantId}:Archive`;
  const url = `${NYLAS_BASE}/v3/grants/${grantId}/messages/${msgId}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${nylasApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ folders: [archiveFolderId] }),
    });
  } catch (e: unknown) {
    return `network_error: ${e instanceof Error ? e.message : String(e)}`;
  }

  if (!res.ok) {
    const text = await res.text();
    return `Nylas ${res.status}: ${text.slice(0, 150)}`;
  }
  return null;
}
