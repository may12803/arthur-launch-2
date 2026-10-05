// Persistence for outreach. Production = Supabase REST with the service role on the LOVELEEDAY project (the tables
// have RLS on and no anon/authenticated policy, so only this server can touch them). Tests use MemoryStore.
import { randomUUID } from 'node:crypto';
import { matchesSuppression, normalizeEmail, type SuppressionEntry } from './suppression.ts';

export type ContactStatus = 'new' | 'active' | 'replied' | 'unsubscribed' | 'bounced' | 'suppressed' | 'needs_email' | 'completed';
export type MessageStatus = 'draft' | 'approved' | 'scheduled' | 'sent' | 'bounced' | 'replied' | 'cancelled';

export interface Contact {
  id: string; org: string | null; name: string | null; email: string | null; source_url: string | null;
  batch: string | null; external_id: string | null; status: ContactStatus; created_at: string;
}
export interface Message {
  id: string; contact_id: string; to_email: string; batch: string | null; step: number; subject: string; body: string;
  personalization_source: string | null; status: MessageStatus; approved_by: string | null; approved_at: string | null;
  scheduled_at: string | null; sent_at: string | null; last_error: string | null; created_at: string;
}
export interface TokenRow { token_hash: string; contact_id: string; email: string; created_at: string; used_at: string | null }

export interface OutreachStore {
  getContact(id: string): Promise<Contact | null>;
  getContactByEmail(email: string): Promise<Contact | null>;
  insertContact(c: Omit<Contact, 'id' | 'created_at'>): Promise<Contact>;
  updateContact(id: string, patch: Partial<Contact>): Promise<void>;
  getMessage(id: string): Promise<Message | null>;
  listMessages(f: { status?: MessageStatus; contactId?: string; batch?: string }): Promise<Message[]>;
  insertMessage(m: Omit<Message, 'id' | 'created_at'>): Promise<Message>;
  updateMessage(id: string, patch: Partial<Message>): Promise<void>;
  sentSince(iso: string): Promise<{ to_email: string; sent_at: string }[]>;
  suppressionFor(email: string): Promise<SuppressionEntry | null>;
  addSuppression(s: Omit<SuppressionEntry, 'created_at'>): Promise<void>;
  saveToken(t: Omit<TokenRow, 'created_at' | 'used_at'>): Promise<void>;
  getToken(hash: string): Promise<TokenRow | null>;
  markTokenUsed(hash: string, at: string): Promise<void>;
}

export class MemoryStore implements OutreachStore {
  contacts = new Map<string, Contact>();
  messages = new Map<string, Message>();
  suppression: SuppressionEntry[] = [];
  tokens = new Map<string, TokenRow>();
  async getContact(id: string) { const c = this.contacts.get(id); return c ? { ...c } : null; }
  async getContactByEmail(email: string) {
    const e = normalizeEmail(email);
    for (const c of this.contacts.values()) if (c.email && normalizeEmail(c.email) === e) return { ...c };
    return null;
  }
  async insertContact(c: Omit<Contact, 'id' | 'created_at'>) {
    const row: Contact = { ...c, id: randomUUID(), created_at: new Date().toISOString() };
    this.contacts.set(row.id, row);
    return { ...row };
  }
  async updateContact(id: string, patch: Partial<Contact>) {
    const c = this.contacts.get(id); if (!c) throw new Error('unknown contact');
    Object.assign(c, patch);
  }
  async getMessage(id: string) { const m = this.messages.get(id); return m ? { ...m } : null; }
  async listMessages(f: { status?: MessageStatus; contactId?: string; batch?: string }) {
    return [...this.messages.values()]
      .filter((m) => (!f.status || m.status === f.status) && (!f.contactId || m.contact_id === f.contactId) && (!f.batch || m.batch === f.batch))
      .map((m) => ({ ...m }));
  }
  async insertMessage(m: Omit<Message, 'id' | 'created_at'>) {
    for (const x of this.messages.values()) if (x.contact_id === m.contact_id && x.step === m.step) throw new Error('duplicate step for contact');
    const row: Message = { ...m, id: randomUUID(), created_at: new Date().toISOString() };
    this.messages.set(row.id, row);
    return { ...row };
  }
  async updateMessage(id: string, patch: Partial<Message>) {
    const m = this.messages.get(id); if (!m) throw new Error('unknown message');
    Object.assign(m, patch);
  }
  async sentSince(iso: string) {
    return [...this.messages.values()].filter((m) => m.sent_at && m.sent_at >= iso).map((m) => ({ to_email: m.to_email, sent_at: m.sent_at! }));
  }
  async suppressionFor(email: string) { return matchesSuppression(this.suppression, email); }
  async addSuppression(s: Omit<SuppressionEntry, 'created_at'>) {
    if (matchesSuppression(this.suppression, s.email ?? `x@${s.domain}`)) return;
    this.suppression.push({ ...s, created_at: new Date().toISOString() });
  }
  async saveToken(t: Omit<TokenRow, 'created_at' | 'used_at'>) {
    if (!this.tokens.has(t.token_hash)) this.tokens.set(t.token_hash, { ...t, created_at: new Date().toISOString(), used_at: null });
  }
  async getToken(hash: string) { const t = this.tokens.get(hash); return t ? { ...t } : null; }
  async markTokenUsed(hash: string, at: string) { const t = this.tokens.get(hash); if (t && !t.used_at) t.used_at = at; }
}

// All production operations go through migration 27's named-secret RPC; no service-role key is used.
export class SupabaseStore implements OutreachStore {
  private url: string; private anonKey: string; private secret: string; private doFetch: typeof fetch;
  constructor(url: string, anonKey: string, secret: string, doFetch: typeof fetch = fetch) {
    this.url = url; this.anonKey = anonKey; this.secret = secret; this.doFetch = doFetch;
  }
  private async call<T>(action: string, table: string, row: object = {}, filter: object = {}): Promise<T> {
    const res = await this.doFetch(`${this.url.replace(/\/$/, '')}/rest/v1/rpc/outreach_store`, {
      method: 'POST', cache: 'no-store',
      headers: { apikey: this.anonKey, Authorization: `Bearer ${this.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_secret: this.secret, p_action: action, p_table: table, p_row: row, p_filter: filter }),
    });
    if (!res.ok) throw new Error(`outreach RPC ${action} ${table} -> ${res.status}`);
    return await res.json() as T;
  }
  private async one<T>(table: string, filter: object): Promise<T | null> {
    return (await this.call<T[]>('list', table, {}, filter))[0] ?? null;
  }
  getContact(id: string) { return this.one<Contact>('outreach_contacts', { id }); }
  getContactByEmail(email: string) { return this.one<Contact>('outreach_contacts', { email: normalizeEmail(email) }); }
  insertContact(c: Omit<Contact, 'id' | 'created_at'>) { return this.call<Contact>('insert', 'outreach_contacts', { ...c, email: c.email ? normalizeEmail(c.email) : null }); }
  async updateContact(id: string, patch: Partial<Contact>) { await this.call('patch', 'outreach_contacts', patch, { id }); }
  getMessage(id: string) { return this.one<Message>('outreach_messages', { id }); }
  async listMessages(f: { status?: MessageStatus; contactId?: string; batch?: string }) {
    const rows = await this.call<Message[]>('list', 'outreach_messages', {}, { ...(f.status ? { status: f.status } : {}), ...(f.contactId ? { contact_id: f.contactId } : {}), ...(f.batch ? { batch: f.batch } : {}) });
    return rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  insertMessage(m: Omit<Message, 'id' | 'created_at'>) { return this.call<Message>('insert', 'outreach_messages', m); }
  async updateMessage(id: string, patch: Partial<Message>) { await this.call('patch', 'outreach_messages', patch, { id }); }
  async sentSince(iso: string) {
    const rows = await this.call<Message[]>('list', 'outreach_messages');
    return rows.filter((m) => m.sent_at && m.sent_at >= iso).map((m) => ({ to_email: m.to_email, sent_at: m.sent_at! }));
  }
  async suppressionFor(email: string) {
    const rows = await this.call<SuppressionEntry[]>('list', 'suppression_list');
    return matchesSuppression(rows, email);
  }
  async addSuppression(s: Omit<SuppressionEntry, 'created_at'>) {
    await this.call('insert', 'suppression_list', { ...s, email: s.email ? normalizeEmail(s.email) : null, domain: s.domain ? s.domain.toLowerCase() : null });
  }
  async saveToken(t: Omit<TokenRow, 'created_at' | 'used_at'>) { await this.call('insert', 'outreach_unsubscribe_tokens', t); }
  getToken(hash: string) { return this.one<TokenRow>('outreach_unsubscribe_tokens', { token_hash: hash }); }
  async markTokenUsed(hash: string, at: string) { await this.call('patch', 'outreach_unsubscribe_tokens', { used_at: at }, { token_hash: hash }); }
}

let singleton: OutreachStore | null = null;
export function getOutreachStore(env: Record<string, string | undefined> = process.env): OutreachStore {
  if (singleton) return singleton;
  const url = env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL ?? process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY;
  const secret = env.LOVELEEDAY_CONNECTORS_SERVER_SECRET;
  if (url && key && secret) singleton = new SupabaseStore(url, key, secret);
  else if (env.NODE_ENV !== 'production' && env.OUTREACH_STORE === 'memory') singleton = new MemoryStore();
  else throw new Error('outreach storage is not configured');
  return singleton;
}
export function setOutreachStoreForTests(s: OutreachStore | null) { singleton = s; }
