// Portal reads. They run under the signed-in session, so the database's RLS (members of the tenant only, two-factor
// session required) is the wall; every query ALSO names the active company, so a person who belongs to two companies
// never sees one company's audit while looking at the other.
import type { AuditReport } from './report.ts';

export interface AuditListRow {
  id: string;
  offer_key: string;
  status: 'queued' | 'generating' | 'ready' | 'needs_data' | 'failed';
  status_reason: string | null;
  created_at: string;
  generated_at: string | null;
  as_of: string | null;
  score: number | null;
  loss_total: number | null;
  headline: string | null;
  source_filename: string | null;
  livemode: boolean;
}
export interface AuditRow extends AuditListRow { result: AuditReport | null }

export const LIST_COLUMNS = 'id, offer_key, status, status_reason, created_at, generated_at, as_of, score, loss_total, headline, source_filename, livemode';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validAuditId = (id: string) => UUID.test(id);

// The slice of the Supabase query builder used here, so tests can stand in a fake.
interface Q {
  eq(col: string, val: string): Q;
  order(col: string, o: { ascending: boolean }): Q;
  limit(n: number): Q;
  maybeSingle(): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  then: PromiseLike<{ data: unknown; error: { message: string } | null }>['then'];
}
export interface ReadClient { from(table: string): { select(cols: string): Q } }

export async function listAudits(db: ReadClient, tenantId: string): Promise<{ rows: AuditListRow[]; error: string | null }> {
  const r = await db.from('audits').select(LIST_COLUMNS).eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(50);
  return { rows: (r.error ? [] : (r.data as AuditListRow[] | null)) ?? [], error: r.error?.message ?? null };
}

export async function getAudit(db: ReadClient, tenantId: string, id: string): Promise<{ row: AuditRow | null; error: string | null }> {
  if (!validAuditId(id)) return { row: null, error: null };
  const r = await db.from('audits').select(`${LIST_COLUMNS}, result`).eq('id', id).eq('tenant_id', tenantId).maybeSingle();
  return { row: r.error ? null : (r.data as AuditRow | null), error: r.error?.message ?? null };
}
