import { payloadSha256 } from '../hash.ts';
import type { Adapter, ConnectorDefinition, FetchLike } from '../types.ts';
import { withBackoff } from './backoff.ts';
import { computeHealth } from './health.ts';
import type { Health } from './health.ts';
import { createRateLimiter } from './rate-limit.ts';
import type { ConnectionRef, IngestRecord, SyncStore } from './store.ts';

export interface RunOptions {
  definition?: ConnectorDefinition;
  fetch: FetchLike;
  objects?: string[];
  maxAttempts?: number;
  maxPagesPerObject?: number;
  baseBackoffMs?: number;
  capBackoffMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  staleAfterMs?: number;
}

export interface ObjectOutcome {
  object: string;
  runId: string;
  status: 'succeeded' | 'failed';
  pages: number;
  rowsRead: number;
  rowsWritten: number;
  attempts: number;
  cursorAfter: string | null;
  error?: string;
}

export interface RunOutcome {
  objects: ObjectOutcome[];
  health: Health;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One pass over a connection. For each object: read the stored cursor, pull a page, INGEST it, and only then
 * advance the cursor. A crash anywhere leaves the cursor at the last fully ingested page, so the next run
 * resumes there; a crash between ingest and cursor write replays one page, which the store dedupes.
 */
export async function runConnection(conn: ConnectionRef, adapter: Adapter, store: SyncStore, opts: RunOptions): Promise<RunOutcome> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;
  const random = opts.random ?? Math.random;
  const rate = opts.definition?.rate_limit ?? { rps: 2, burst: 2 };
  const limiter = createRateLimiter({ rps: rate.rps, burst: Math.max(1, rate.burst), now, sleep });
  const maxPages = opts.maxPagesPerObject ?? 10_000;
  const outcomes: ObjectOutcome[] = [];

  for (const object of opts.objects ?? adapter.objects) {
    const { runId, cursor: startCursor } = await store.startRun(conn, object);
    let cursor = startCursor;
    let persisted = startCursor;
    let pages = 0;
    let rowsRead = 0;
    let rowsWritten = 0;
    let attempts = 1;
    try {
      for (;;) {
        const { value: page, attempts: a } = await withBackoff(
          async () => {
            await limiter.take();
            return adapter.pull(object, cursor, conn.creds, opts.fetch);
          },
          { maxAttempts: opts.maxAttempts ?? 5, baseMs: opts.baseBackoffMs ?? 1000, capMs: opts.capBackoffMs ?? 60_000, sleep, random },
        );
        attempts = Math.max(attempts, a);
        const observed = new Date(now()).toISOString();
        const records: IngestRecord[] = page.records.map((r) => ({
          source_system: conn.definitionKey,
          object,
          source_ref: r.source_ref,
          payload: r.payload,
          payload_sha256: payloadSha256(r.payload),
          observed_at: r.observed_at ?? observed,
          valid_from: r.valid_from,
        }));
        rowsWritten += await store.ingest(runId, conn, records);
        rowsRead += records.length;
        pages++;
        if (page.nextCursor !== null) {
          await store.setCursor(conn, object, page.nextCursor); // only after the page is ingested
          persisted = page.nextCursor;
          cursor = page.nextCursor;
        }
        if (!page.hasMore) break;
        if (pages >= maxPages) throw new Error(`stopped after ${maxPages} pages`);
      }
      await store.finishRun(runId, { status: 'succeeded', rowsRead, rowsWritten, error: null, cursorAfter: persisted, attempt: attempts });
      outcomes.push({ object, runId, status: 'succeeded', pages, rowsRead, rowsWritten, attempts, cursorAfter: persisted });
    } catch (e) {
      const status = (e as { status?: number }).status;
      const error = (status ? `HTTP ${status}: ` : '') + (e instanceof Error ? e.message : 'unknown error');
      const att = (e as { attempts?: number }).attempts ?? attempts;
      await store.finishRun(runId, { status: pages > 0 ? 'partial' : 'failed', rowsRead, rowsWritten, error, cursorAfter: persisted, attempt: att });
      outcomes.push({ object, runId, status: 'failed', pages, rowsRead, rowsWritten, attempts: att, cursorAfter: persisted, error });
    }
  }

  const health = computeHealth(await store.recentRuns(conn, 50), now(), opts.staleAfterMs);
  await store.recordHealth(conn, { ...health, checkedAt: new Date(now()).toISOString() });
  return { objects: outcomes, health };
}
