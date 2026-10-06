// The sequence engine. Only messages with status "approved" are ever eligible. Disabled (the default) means the
// live path does not execute at all: runBatch downgrades to a dry run that renders and writes nothing.
import { dailyCapFor, dayOffsetForStep, MAX_STEP, startOfDay, type Env, type OutreachConfig, loadConfig } from './config.ts';
import { RenderError, renderMessage, type Rendered } from './render.ts';
import { registerToken } from './lifecycle.ts';
import { blockedSegment, domainOf } from './suppression.ts';
import { DryRunTransport, getTransport, type Transport } from './transport.ts';
import type { Contact, Message, OutreachStore } from './store.ts';

const SENDABLE_CONTACT = new Set(['new', 'active']);
const DAY_MS = 86_400_000;

export type SkipReason =
  | 'contact_missing' | 'contact_stopped' | 'suppressed' | 'blocked_segment' | 'previous_step_not_sent'
  | 'step_not_due' | 'domain_throttle' | 'daily_cap' | 'no_postal_address' | 'no_token_secret' | 'empty_body';

export interface PlanItem { message: Message; contact: Contact | null; send: boolean; reason?: SkipReason; dueAt?: string; rendered?: Rendered }
export interface Plan { cap: number; sentToday: number; remaining: number; items: PlanItem[] }

export async function planBatch(store: OutreachStore, cfg: OutreachConfig, now: Date): Promise<Plan> {
  const cap = dailyCapFor(cfg, now);
  const sentRows = await store.sentSince(startOfDay(now, cfg.timeZone).toISOString());
  const perDomain = new Map<string, number>();
  for (const r of sentRows) perDomain.set(domainOf(r.to_email), (perDomain.get(domainOf(r.to_email)) ?? 0) + 1);
  const sentToday = sentRows.length;
  let planned = 0;
  const items: PlanItem[] = [];
  // Follow-ups first (they are promises already in flight), then oldest first.
  const approved = (await store.listMessages({ status: 'approved' })).sort((a, b) => b.step - a.step || a.created_at.localeCompare(b.created_at));
  for (const message of approved) {
    const contact = await store.getContact(message.contact_id);
    const skip = (reason: SkipReason, extra: Partial<PlanItem> = {}) => items.push({ message, contact, send: false, reason, ...extra });
    if (!contact) { skip('contact_missing'); continue; }
    if (!SENDABLE_CONTACT.has(contact.status)) { skip('contact_stopped'); continue; }
    if (await store.suppressionFor(message.to_email)) { skip('suppressed'); continue; }
    if (blockedSegment(contact.org, message.to_email, cfg)) { skip('blocked_segment'); continue; }
    if (message.step > 1) {
      const mine = await store.listMessages({ contactId: contact.id });
      const prev = mine.find((m) => m.step === message.step - 1);
      const first = mine.find((m) => m.step === 1);
      if (!prev || !first || !['sent'].includes(prev.status) || !first.sent_at) { skip('previous_step_not_sent'); continue; }
      const dueAt = new Date(new Date(first.sent_at).getTime() + dayOffsetForStep(message.step) * DAY_MS);
      if (now < dueAt) { skip('step_not_due', { dueAt: dueAt.toISOString() }); continue; }
    }
    const dom = domainOf(message.to_email);
    if ((perDomain.get(dom) ?? 0) >= cfg.perDomainPerDay) { skip('domain_throttle'); continue; }
    if (sentToday + planned >= cap) { skip('daily_cap'); continue; }
    let rendered: Rendered;
    try { rendered = renderMessage(message, cfg); } catch (e) { if (e instanceof RenderError) { skip(e.code); continue; } throw e; }
    perDomain.set(dom, (perDomain.get(dom) ?? 0) + 1);
    planned++;
    items.push({ message, contact, send: true, rendered });
  }
  return { cap, sentToday, remaining: Math.max(0, cap - sentToday - planned), items };
}

export interface RunOptions {
  now?: Date;
  mode?: 'dry-run' | 'live';
  transport?: Transport;
  sleep?: (ms: number) => Promise<void>;
}
export interface RunResult { mode: 'dry-run' | 'live'; sendingEnabled: boolean; plan: Plan; sent: string[]; failed: { id: string; error: string }[] }

export async function runBatch(store: OutreachStore, env: Env = process.env, opts: RunOptions = {}): Promise<RunResult> {
  const cfg = loadConfig(env);
  const now = opts.now ?? new Date();
  const plan = await planBatch(store, cfg, now);
  const live = opts.mode === 'live' && cfg.sendingEnabled;
  const sent: string[] = [];
  const failed: { id: string; error: string }[] = [];

  if (!live) {
    // Dry run: render everything that would go out, touch nothing. The transport here is always the dry-run one.
    const t = new DryRunTransport();
    for (const it of plan.items) if (it.send && it.rendered) await t.send(it.rendered);
    return { mode: 'dry-run', sendingEnabled: cfg.sendingEnabled, plan, sent, failed };
  }

  const transport = opts.transport ?? getTransport(env);
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let consecutive = 0;
  for (const it of plan.items) {
    if (!it.send || !it.rendered || !it.contact) continue;
    // Re-check at the last moment: an unsubscribe or reply may have landed since the plan was made.
    const fresh = await store.getMessage(it.message.id);
    const contact = await store.getContact(it.message.contact_id);
    if (!fresh || fresh.status !== 'approved' || !fresh.approved_by || !fresh.approved_at || !contact || !SENDABLE_CONTACT.has(contact.status) || (await store.suppressionFor(fresh.to_email)) || blockedSegment(contact.org, fresh.to_email, cfg)) continue;
    await store.updateMessage(fresh.id, { status: 'scheduled', scheduled_at: now.toISOString() });
    try {
      await registerToken(store, cfg, contact);
      await transport.send(it.rendered);
      await store.updateMessage(fresh.id, { status: 'sent', sent_at: new Date().toISOString(), last_error: null });
      if (contact.status === 'new') await store.updateContact(contact.id, { status: 'active' });
      sent.push(fresh.id);
      consecutive = 0;
      await ensureNextDraft(store, fresh, contact);
    } catch (e) {
      await store.updateMessage(fresh.id, { status: 'approved', last_error: String((e as Error).message).slice(0, 300) });
      failed.push({ id: fresh.id, error: String((e as Error).message).slice(0, 300) });
      if (++consecutive >= 3) break;
    }
    if (cfg.sendIntervalMs > 0) await sleep(cfg.sendIntervalMs);
  }
  return { mode: 'live', sendingEnabled: true, plan, sent, failed };
}

// ---- follow-up drafts: created as DRAFTS when a step sends; they still need approval like any other message ----
const first = (name: string | null) => (name ?? '').trim().split(/\s+/)[0] || 'there';

export function followUpTemplate(step: number, original: Message, contact: Contact, env: Env = process.env): { subject: string; body: string } {
  const sig = env.OUTREACH_SIGNATURE?.trim() || '{{SIGNATURE}}';
  const hi = `Hi ${first(contact.name)},`;
  const subject = original.subject.startsWith('Following up: ') ? original.subject : `Following up: ${original.subject.replace(/^Re:\s*/i, '')}`;
  if (step === 2) return { subject, body: `${hi}\n\nI wanted to follow up gently on my note from a few days ago, in case it got buried. If it would help, I am glad to share a short example from your own industry.\n\nNo pressure at all, and thank you for your time either way.\n\n${sig}` };
  return { subject, body: `${hi}\n\nI do not want to crowd your inbox, so this is my last note. If the timing is not right, I completely understand, and the door stays open whenever it makes sense for you.\n\nWishing you and the team a good season.\n\n${sig}` };
}

export async function ensureNextDraft(store: OutreachStore, justSent: Message, contact: Contact, env: Env = process.env): Promise<Message | null> {
  const next = justSent.step + 1;
  if (next > MAX_STEP) return null;
  const existing = await store.listMessages({ contactId: contact.id });
  if (existing.some((m) => m.step === next)) return null;
  const first1 = existing.find((m) => m.step === 1) ?? justSent;
  const t = followUpTemplate(next, first1, contact, env);
  return store.insertMessage({
    contact_id: contact.id, to_email: justSent.to_email, batch: justSent.batch, step: next, subject: t.subject, body: t.body,
    personalization_source: null, status: 'draft', approved_by: null, approved_at: null, scheduled_at: null, sent_at: null, last_error: null,
  });
}
