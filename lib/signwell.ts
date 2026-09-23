// SignWell API client for the LOVELEEDAY client portal (/client/contracts).
// Copied and trimmed from ~/Projects/dabney/src/lib/signwell.ts (a separate
// repo — this app doesn't import across repos) down to the one read this
// portal needs: looking up a document's current status + the recipient's
// hosted signing link. Sending/creating contracts happens elsewhere in
// Loveleeday's own tooling, not from this portal.
// Docs: https://developers.signwell.com/  ·  base https://www.signwell.com/api/v1/
const BASE = "https://www.signwell.com/api/v1";

function key(): string {
  const k = process.env.SIGNWELL_API_KEY;
  if (!k) throw new Error("SIGNWELL_API_KEY not set");
  return k;
}

export type SignWellRecipient = {
  id: string;
  email: string;
  // Hosted (non-embedded) signing URL for this recipient — null until
  // SignWell has generated one, per SignWell's own docs.
  signing_url: string | null;
};

export type SignWellDoc = {
  id: string;
  status: string; // e.g. "sent" | "viewed" | "signed" | "declined" | "voided"
  completed_pdf_url: string | null;
  recipients: SignWellRecipient[];
};

export async function getDocument(id: string): Promise<SignWellDoc> {
  const r = await fetch(`${BASE}/documents/${id}/`, {
    method: "GET",
    headers: { "X-Api-Key": key(), "Content-Type": "application/json" },
  });
  const text = await r.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    /* non-json */
  }
  if (!r.ok) throw new Error(`SignWell GET /documents/${id} ${r.status}: ${text.slice(0, 300)}`);

  const recipients = Array.isArray(body.recipients)
    ? (body.recipients as Record<string, unknown>[]).map((rec) => ({
        id: String(rec.id ?? ""),
        email: String(rec.email ?? ""),
        signing_url: (rec.signing_url as string) ?? null,
      }))
    : [];

  return {
    id: String(body.id),
    status: String(body.status || "unknown"),
    completed_pdf_url: (body.completed_pdf_url as string) ?? null,
    recipients,
  };
}
