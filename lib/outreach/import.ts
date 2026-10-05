// JSONL import: rows become DRAFT messages (never approved, never scheduled). Suppressed addresses and blocked
// segments are skipped and reported. Row shape: id, batch, recipient (name/org/email-or-url), source, subject, body,
// personalization_source, status (ignored: everything lands as a draft; the original is kept in the summary).
import type { OutreachConfig } from './config.ts';
import { blockedSegment, isEmail, normalizeEmail } from './suppression.ts';
import type { OutreachStore } from './store.ts';

export interface ImportRow {
  id?: string | number; batch?: string; recipient?: unknown; source?: string; subject?: string; body?: string;
  personalization_source?: string; status?: string;
}
export interface Recipient { name: string | null; org: string | null; email: string | null; url: string | null }

export function parseJsonl(text: string): { rows: ImportRow[]; errors: { line: number; error: string }[] } {
  const rows: ImportRow[] = []; const errors: { line: number; error: string }[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    if (!l.trim()) return;
    try { const v = JSON.parse(l); if (v && typeof v === 'object' && !Array.isArray(v)) rows.push(v as ImportRow); else errors.push({ line: i + 1, error: 'not an object' }); }
    catch { errors.push({ line: i + 1, error: 'invalid JSON' }); }
  });
  return { rows, errors };
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function parseRecipient(r: unknown): Recipient {
  if (r && typeof r === 'object') {
    const o = r as Record<string, unknown>;
    const email = str(o.email); const url = str(o.url) ?? str(o.source_url) ?? str(o.website);
    return { name: str(o.name), org: str(o.org) ?? str(o.organization) ?? str(o.company), email: email && isEmail(email) ? normalizeEmail(email) : null, url };
  }
  let s = typeof r === 'string' ? r : '';
  const email = s.match(/[^\s<>,;|/]+@[^\s<>,;|/]+\.[^\s<>,;|/]+/)?.[0] ?? null;
  const url = s.match(/https?:\/\/[^\s<>,;|]+/)?.[0] ?? null;
  if (email) s = s.replace(email, '');
  if (url) s = s.replace(url, '');
  const parts = s.split(/\s*[/|;]\s*|\s*,\s*/).map((p) => p.replace(/[<>()]/g, '').trim()).filter(Boolean);
  const [a, b] = parts;
  return { name: b ? a : null, org: b ?? a ?? null, email: email ? normalizeEmail(email) : null, url };
}

export type Outcome = 'imported' | 'imported_no_email' | 'skipped_suppressed' | 'skipped_blocked_segment' | 'skipped_duplicate' | 'skipped_invalid';
export interface RowResult { id: string | null; outcome: Outcome; detail?: string }
export interface ImportSummary { applied: boolean; total: number; counts: Record<Outcome, number>; results: RowResult[] }

export async function importRows(store: OutreachStore, cfg: OutreachConfig, rows: ImportRow[], opts: { apply: boolean }): Promise<ImportSummary> {
  const counts: Record<Outcome, number> = { imported: 0, imported_no_email: 0, skipped_suppressed: 0, skipped_blocked_segment: 0, skipped_duplicate: 0, skipped_invalid: 0 };
  const results: RowResult[] = [];
  const seenEmails = new Set<string>();
  for (const row of rows) {
    const id = row.id !== undefined ? String(row.id) : null;
    const push = (outcome: Outcome, detail?: string) => { counts[outcome]++; results.push({ id, outcome, detail }); };
    const rcp = parseRecipient(row.recipient);
    const subject = str(row.subject); const body = str(row.body);
    if (!rcp.org && !rcp.name && !rcp.email) { push('skipped_invalid', 'no recipient'); continue; }
    if (rcp.email == null && !rcp.url) { push('skipped_invalid', 'recipient has neither email nor url'); continue; }
    const seg = blockedSegment(rcp.org, rcp.email, cfg);
    if (seg) { push('skipped_blocked_segment', seg); continue; }
    if (rcp.email) {
      if (await store.suppressionFor(rcp.email)) { push('skipped_suppressed'); continue; }
      if (seenEmails.has(rcp.email)) { push('skipped_duplicate', 'same email earlier in file'); continue; }
    }
    if (rcp.email && (!subject || !body)) { push('skipped_invalid', 'missing subject or body'); continue; }
    if (rcp.email) seenEmails.add(rcp.email);
    const batch = str(row.batch);
    let contact = rcp.email ? await store.getContactByEmail(rcp.email) : null;
    if (contact && (await store.listMessages({ contactId: contact.id })).some((m) => m.step === 1)) { push('skipped_duplicate', 'contact already has a first message'); continue; }
    if (opts.apply) {
      contact ??= await store.insertContact({ org: rcp.org, name: rcp.name, email: rcp.email, source_url: rcp.url ?? str(row.source), batch, external_id: id, status: rcp.email ? 'new' : 'needs_email' });
      if (rcp.email) {
        await store.insertMessage({
          contact_id: contact.id, to_email: rcp.email, batch, step: 1, subject: subject!, body: body!,
          personalization_source: str(row.personalization_source), status: 'draft', approved_by: null, approved_at: null,
          scheduled_at: null, sent_at: null, last_error: null,
        });
      }
    }
    push(rcp.email ? 'imported' : 'imported_no_email');
  }
  return { applied: opts.apply, total: rows.length, counts, results };
}
