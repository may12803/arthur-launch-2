import type { FetchLike } from '../types.ts';
import type { HealthStatus, RunSummary } from './health.ts';
import type { ConnectionRef, FinishRun, IngestRecord, SyncStore } from './store.ts';

// Production store: server RPCs from docs/connector-platform/CONTRACT.md, guarded by p_secret
// (env LOVELEEDAY_CONNECTORS_SERVER_SECRET, server name 'connectors-server'). No service-role key.
//
// RPC NAMES are from CONTRACT.md. The ARGUMENT NAMES and RETURN SHAPES below are this module's contract
// with theme A's migration (CONTRACT.md lists names only):
//   sync_run_start(p_secret, p_connection_id, p_object)          -> jsonb { run_id, cursor }
//   ingest_records(p_secret, p_run, p_records jsonb)             -> integer (rows newly inserted)
//   sync_cursor_set(p_secret, p_connection_id, p_object, p_cursor)
//   sync_run_finish(p_secret, p_run, p_status, p_rows_read, p_rows_written, p_error, p_cursor_after, p_attempt)
//   connection_health_record(p_secret, p_connection_id, p_status, p_reason, p_checked_at)
//   sync_runs_recent(p_secret, p_connection_id, p_limit)         -> jsonb [] (NOT in CONTRACT.md yet; needed by health)

export interface SupabaseStoreOptions {
  url: string; // https://<ref>.supabase.co
  anonKey: string; // publishable key; RPCs authenticate with p_secret
  secret?: string;
  fetch: FetchLike;
}

export class SupabaseRpcStore implements SyncStore {
  private o: SupabaseStoreOptions;
  constructor(o: SupabaseStoreOptions) {
    this.o = o;
  }

  private secret(): string {
    const s = this.o.secret ?? process.env.LOVELEEDAY_CONNECTORS_SERVER_SECRET;
    if (!s) throw new Error('LOVELEEDAY_CONNECTORS_SERVER_SECRET is not set');
    return s;
  }

  private async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const res = await this.o.fetch(`${this.o.url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: this.o.anonKey, authorization: `Bearer ${this.o.anonKey}` },
      body: JSON.stringify({ p_secret: this.secret(), ...args }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`rpc ${name} failed: HTTP ${res.status}`); // body withheld: it may echo arguments
    return (text ? JSON.parse(text) : null) as T;
  }

  async startRun(conn: ConnectionRef, object: string) {
    const r = await this.rpc<{ run_id: string; cursor: string | null }>('sync_run_start', { p_connection_id: conn.id, p_object: object });
    return { runId: r.run_id, cursor: r.cursor ?? null };
  }

  async ingest(runId: string, _conn: ConnectionRef, records: IngestRecord[]) {
    if (!records.length) return 0;
    return this.rpc<number>('ingest_records', { p_run: runId, p_records: records });
  }

  async setCursor(conn: ConnectionRef, object: string, cursor: string) {
    await this.rpc('sync_cursor_set', { p_connection_id: conn.id, p_object: object, p_cursor: cursor });
  }

  async finishRun(runId: string, r: FinishRun) {
    await this.rpc('sync_run_finish', { p_run: runId, p_status: r.status, p_rows_read: r.rowsRead, p_rows_written: r.rowsWritten, p_error: r.error, p_cursor_after: r.cursorAfter, p_attempt: r.attempt });
  }

  async recentRuns(conn: ConnectionRef, limit: number): Promise<RunSummary[]> {
    const rows = await this.rpc<any[]>('sync_runs_recent', { p_connection_id: conn.id, p_limit: limit });
    return (rows ?? []).map((x) => ({ object: x.object, status: x.status, startedAt: x.started_at, finishedAt: x.finished_at, rowsRead: x.rows_read ?? 0, rowsWritten: x.rows_written ?? 0 }));
  }

  async recordHealth(conn: ConnectionRef, h: { status: HealthStatus; reason: string; checkedAt: string }) {
    await this.rpc('connection_health_record', { p_connection_id: conn.id, p_status: h.status, p_reason: h.reason, p_checked_at: h.checkedAt });
  }
}
