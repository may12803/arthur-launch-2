import type { PulledRecord } from '../types.ts';
import type { HealthStatus, RunSummary } from './health.ts';

export interface ConnectionRef {
  id: string;
  tenantId: string;
  definitionKey: string;
  creds: Record<string, string>;
}

export interface IngestRecord {
  source_system: string;
  object: string;
  source_ref: string;
  payload: Record<string, unknown>;
  payload_sha256: string;
  observed_at: string;
  valid_from?: string;
}

export type RunStatus = 'succeeded' | 'failed' | 'partial';

export interface FinishRun {
  status: RunStatus;
  rowsRead: number;
  rowsWritten: number;
  error: string | null;
  cursorAfter: string | null;
  attempt: number;
}

/**
 * Persistence the runner needs. Production: SupabaseRpcStore. Tests: MemoryStore.
 * ingest() must dedupe on (connection, object, source_ref, payload_sha256) and return the NEW row count.
 */
export interface SyncStore {
  startRun(conn: ConnectionRef, object: string): Promise<{ runId: string; cursor: string | null }>;
  ingest(runId: string, conn: ConnectionRef, records: IngestRecord[]): Promise<number>;
  setCursor(conn: ConnectionRef, object: string, cursor: string): Promise<void>;
  finishRun(runId: string, result: FinishRun): Promise<void>;
  recentRuns(conn: ConnectionRef, limit: number): Promise<RunSummary[]>;
  recordHealth(conn: ConnectionRef, h: { status: HealthStatus; reason: string; checkedAt: string }): Promise<void>;
}

export type { PulledRecord };
