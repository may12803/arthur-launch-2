// Everything that STOPS a sequence: unsubscribe, reply, bounce, suppression. Plus per-message / per-batch approval.
import type { OutreachConfig } from './config.ts';
import { hashToken, unsubscribeToken } from './render.ts';
import { normalizeEmail } from './suppression.ts';
import type { Contact, ContactStatus, OutreachStore } from './store.ts';

const OPEN_STATUSES = ['draft', 'approved', 'scheduled'] as const;

// Cancel every not-yet-sent message for a contact.
export async function cancelPending(store: OutreachStore, contactId: string): Promise<number> {
  let n = 0;
  for (const s of OPEN_STATUSES) for (const m of await store.listMessages({ status: s, contactId })) { await store.updateMessage(m.id, { status: 'cancelled' }); n++; }
  return n;
}

async function stop(store: OutreachStore, contact: Contact, status: ContactStatus) {
  await store.updateContact(contact.id, { status });
  await cancelPending(store, contact.id);
}

// ---- unsubscribe (RFC 8058 one-click, and the footer link) ----
export async function registerToken(store: OutreachStore, cfg: OutreachConfig, contact: Contact): Promise<string> {
  if (!cfg.tokenSecret || !contact.email) throw new Error('cannot mint an unsubscribe token');
  const token = unsubscribeToken(cfg.tokenSecret, contact.id);
  await store.saveToken({ token_hash: hashToken(token), contact_id: contact.id, email: normalizeEmail(contact.email) });
  return token;
}

export interface UnsubscribeResult { ok: boolean; email?: string }
// Idempotent. Suppression is written first, immediately; an unknown token changes nothing.
export async function unsubscribeByToken(store: OutreachStore, token: string, now = new Date()): Promise<UnsubscribeResult> {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return { ok: false };
  const hash = hashToken(token);
  const row = await store.getToken(hash);
  if (!row) return { ok: false };
  await store.addSuppression({ email: row.email, domain: null, reason: 'unsubscribe', source: 'one_click' });
  const contact = await store.getContact(row.contact_id);
  if (contact) await stop(store, contact, 'unsubscribed');
  await store.markTokenUsed(hash, now.toISOString());
  return { ok: true, email: row.email };
}

// RFC 8058: the POST body must be the form pair List-Unsubscribe=One-Click.
export const isOneClickBody = (body: string) => new URLSearchParams(body).get('List-Unsubscribe') === 'One-Click';

// ---- reply / bounce / manual suppression ----
export async function recordReply(store: OutreachStore, email: string) {
  const c = await store.getContactByEmail(email);
  if (!c) return false;
  for (const m of await store.listMessages({ status: 'sent', contactId: c.id })) await store.updateMessage(m.id, { status: 'replied' });
  await stop(store, c, 'replied');
  return true;
}

export async function recordBounce(store: OutreachStore, email: string) {
  await store.addSuppression({ email: normalizeEmail(email), domain: null, reason: 'bounce', source: 'bounce' });
  const c = await store.getContactByEmail(email);
  if (!c) return false;
  for (const m of await store.listMessages({ status: 'sent', contactId: c.id })) await store.updateMessage(m.id, { status: 'bounced' });
  await stop(store, c, 'bounced');
  return true;
}

export async function suppress(store: OutreachStore, target: { email?: string; domain?: string }, reason: string, source: string) {
  if (!target.email && !target.domain) throw new Error('email or domain required');
  await store.addSuppression({ email: target.email ? normalizeEmail(target.email) : null, domain: target.domain ? target.domain.toLowerCase() : null, reason, source });
  if (target.email) { const c = await store.getContactByEmail(target.email); if (c) await stop(store, c, 'suppressed'); }
}

// ---- approval: nothing is eligible to send until a named person approves it ----
const cleanApprover = (a: string) => { const v = (a ?? '').trim(); if (v.length < 2) throw new Error('approver identity is required'); return v; };

export interface ApprovalResult { approved: string[]; refused: { id: string; reason: string }[] }

async function approveOne(store: OutreachStore, id: string, approver: string, now: Date, out: ApprovalResult) {
  const m = await store.getMessage(id);
  if (!m) { out.refused.push({ id, reason: 'not_found' }); return; }
  if (m.status !== 'draft') { out.refused.push({ id, reason: `status_${m.status}` }); return; }
  if (/\{\{[A-Z_]+\}\}/.test(m.subject + m.body)) { out.refused.push({ id, reason: 'unfilled_placeholder' }); return; }
  if (await store.suppressionFor(m.to_email)) { out.refused.push({ id, reason: 'suppressed' }); return; }
  const c = await store.getContact(m.contact_id);
  if (!c || ['unsubscribed', 'bounced', 'suppressed', 'replied'].includes(c.status)) { out.refused.push({ id, reason: `contact_${c?.status ?? 'missing'}` }); return; }
  await store.updateMessage(m.id, { status: 'approved', approved_by: approver, approved_at: now.toISOString() });
  out.approved.push(id);
}

export async function approveMessages(store: OutreachStore, ids: string[], approver: string, now = new Date()): Promise<ApprovalResult> {
  const who = cleanApprover(approver);
  const out: ApprovalResult = { approved: [], refused: [] };
  for (const id of ids) await approveOne(store, id, who, now, out);
  return out;
}

export async function approveBatch(store: OutreachStore, batch: string, approver: string, opts: { step?: number } = {}, now = new Date()): Promise<ApprovalResult> {
  const who = cleanApprover(approver);
  const out: ApprovalResult = { approved: [], refused: [] };
  for (const m of await store.listMessages({ status: 'draft', batch })) if (!opts.step || m.step === opts.step) await approveOne(store, m.id, who, now, out);
  return out;
}
