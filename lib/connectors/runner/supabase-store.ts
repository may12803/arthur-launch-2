import type { FetchLike } from '../types.ts';
import type { HealthStatus, RunSummary } from './health.ts';
import type { ConnectionRef, FinishRun, IngestRecord, SyncStore } from './store.ts';

// Production store: the server RPCs in supabase/loveleeday/20261005_10_connector_platform.sql, guarded by p_secret
// (env LOVELEEDAY_CONNECTORS_SERVER_SECRET, server name 'connectors-server'). No service-role key.
// scripts/check-rpc-contract.mjs fails the build check if these argument names drift from the SQL.
//   sync_run_start(p_secret, p_connection, p_object) -> uuid
//   sync_cursor_get(p_secret, p_connection, p_object) -> text
//   ingest_records(p_secret, p_run, p_records jsonb) -> integer (rows newly inserted)
//   sync_cursor_set(p_secret, p_connection, p_object, p_cursor)
//   sync_run_finish(p_secret, p_run, p_status, p_rows_read, p_rows_written, p_error, p_cursor_after) -> computed health
//   sync_runs_recent(p_secret, p_connection, p_limit) -> jsonb []
//   connection_health_record(p_secret, p_connection) -> computed health
// The database computes health from its own sync_runs; the runner's local computeHealth is for its log only and
// can never set a status. The attempt number is derived in SQL from prior failed runs.

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

  private async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
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
    const cursor = await this.call<string | null>('sync_cursor_get', { p_connection: conn.id, p_object: object });
    const runId = await this.call<string>('sync_run_start', { p_connection: conn.id, p_object: object });
    return { runId, cursor: cursor ?? null };
  }

  async ingest(runId: string, _conn: ConnectionRef, records: IngestRecord[]) {
    if (!records.length) return 0;
    const slim = records.map((r) => ({ object: r.object, source_ref: r.source_ref, payload: r.payload, observed_at: r.observed_at, valid_from: r.valid_from ?? null }));
    return this.call<number>('ingest_records', { p_run: runId, p_records: slim });
  }

  async setCursor(conn: ConnectionRef, object: string, cursor: string) {
    await this.call('sync_cursor_set', { p_connection: conn.id, p_object: object, p_cursor: cursor });
  }

  async finishRun(runId: string, r: FinishRun) {
    await this.call('sync_run_finish', { p_run: runId, p_status: r.status, p_rows_read: r.rowsRead, p_rows_written: r.rowsWritten, p_error: r.error, p_cursor_after: r.cursorAfter });
  }

  async recentRuns(conn: ConnectionRef, limit: number): Promise<RunSummary[]> {
    const rows = await this.call<any[]>('sync_runs_recent', { p_connection: conn.id, p_limit: limit });
    return (rows ?? []).map((x) => ({ object: x.object, status: x.status, startedAt: x.started_at, finishedAt: x.finished_at, rowsRead: x.rows_read ?? 0, rowsWritten: x.rows_written ?? 0 }));
  }

  async recordHealth(conn: ConnectionRef, _h: { status: HealthStatus; reason: string; checkedAt: string }) {
    await this.call('connection_health_record', { p_connection: conn.id });
  }
}
