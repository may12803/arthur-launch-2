import type { HealthStatus, RunSummary } from './health.ts';
import type { ConnectionRef, FinishRun, IngestRecord, SyncStore } from './store.ts';

interface RunRow extends RunSummary {
  id: string;
  connectionId: string;
  cursorBefore: string | null;
  cursorAfter: string | null;
  error: string | null;
  attempt: number;
}

export class MemoryStore implements SyncStore {
  rows = new Map<string, IngestRecord & { connectionId: string; runId: string }>();
  cursors = new Map<string, string>();
  runs: RunRow[] = [];
  health = new Map<string, { status: HealthStatus; reason: string; checkedAt: string }>();
  private seq = 0;
  clock: () => number;

  constructor(clock: () => number = Date.now) {
    this.clock = clock;
  }

  async startRun(conn: ConnectionRef, object: string) {
    const id = `run-${++this.seq}`;
    const cursor = this.cursors.get(`${conn.id}|${object}`) ?? null;
    this.runs.push({ id, connectionId: conn.id, object, status: 'running', startedAt: new Date(this.clock()).toISOString(), finishedAt: null, rowsRead: 0, rowsWritten: 0, cursorBefore: cursor, cursorAfter: null, error: null, attempt: 1 });
    return { runId: id, cursor };
  }

  async ingest(runId: string, conn: ConnectionRef, records: IngestRecord[]) {
    let inserted = 0;
    for (const r of records) {
      const key = [conn.id, r.object, r.source_ref, r.payload_sha256].join('|');
      if (this.rows.has(key)) continue;
      this.rows.set(key, { ...r, connectionId: conn.id, runId });
      inserted++;
    }
    return inserted;
  }

  async setCursor(conn: ConnectionRef, object: string, cursor: string) {
    this.cursors.set(`${conn.id}|${object}`, cursor);
  }

  async finishRun(runId: string, r: FinishRun) {
    const run = this.runs.find((x) => x.id === runId);
    if (!run) throw new Error(`unknown run ${runId}`);
    Object.assign(run, { status: r.status, rowsRead: r.rowsRead, rowsWritten: r.rowsWritten, error: r.error, cursorAfter: r.cursorAfter, attempt: r.attempt, finishedAt: new Date(this.clock()).toISOString() });
  }

  async recentRuns(conn: ConnectionRef, limit: number): Promise<RunSummary[]> {
    return this.runs.filter((r) => r.connectionId === conn.id).slice(-limit).reverse();
  }

  async recordHealth(conn: ConnectionRef, h: { status: HealthStatus; reason: string; checkedAt: string }) {
    this.health.set(conn.id, h);
  }
}
