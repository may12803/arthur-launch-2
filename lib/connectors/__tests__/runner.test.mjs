import test from 'node:test';
import assert from 'node:assert/strict';
import { runConnection } from '../runner/runner.ts';
import { MemoryStore } from '../runner/memory-store.ts';
import { SupabaseRpcStore } from '../runner/supabase-store.ts';
import { computeHealth, DEFAULT_STALE_AFTER_MS } from '../runner/health.ts';
import { backoffDelayMs, withBackoff, isRetryable } from '../runner/backoff.ts';
import { createRateLimiter } from '../runner/rate-limit.ts';
import { parseRetryAfter, requestJson } from '../http.ts';
import { HttpError } from '../types.ts';
import { fakeClock, fakeFetch } from './_helpers.mjs';

const conn = { id: 'conn-1', tenantId: 't1', definitionKey: 'fake', creds: {} };
const rec = (page, i) => ({ source_ref: `r${page}-${i}`, payload: { page, i } });
const TOTAL_PAGES = 4;
const PER_PAGE = 3;

/** Cursor "pN" means pages 1..N are done. Honors the cursor like a real incremental adapter. */
function pagedAdapter({ onPull } = {}) {
  const seen = [];
  return {
    seen,
    key: 'fake',
    objects: ['things'],
    async validate() { return { ok: true, detail: '' }; },
    async pull(object, cursor) {
      seen.push(cursor);
      await onPull?.(cursor, seen.length);
      const done = cursor ? Number(cursor.slice(1)) : 0;
      const page = done + 1;
      if (page > TOTAL_PAGES) return { records: [], nextCursor: cursor, hasMore: false };
      return { records: Array.from({ length: PER_PAGE }, (_, i) => rec(page, i)), nextCursor: `p${page}`, hasMore: page < TOTAL_PAGES };
    },
  };
}

function opts(clock, extra = {}) {
  return { fetch: fakeFetch(), now: clock.now, sleep: clock.sleep, random: () => 0, ...extra };
}

test('idempotency: running twice over the same data adds no duplicate rows', async () => {
  const clock = fakeClock();
  const store = new MemoryStore(clock.now);
  // A snapshot-style adapter that ignores the cursor and always returns the full set.
  const snapshot = { key: 'fake', objects: ['things'], validate: async () => ({ ok: true, detail: '' }), pull: async () => ({ records: [rec(1, 0), rec(1, 1), rec(1, 2)], nextCursor: 'x', hasMore: false }) };
  const a = await runConnection(conn, snapshot, store, opts(clock));
  assert.equal(a.objects[0].rowsWritten, 3);
  assert.equal(store.rows.size, 3);
  const b = await runConnection(conn, snapshot, store, opts(clock));
  assert.equal(b.objects[0].rowsRead, 3, 'the second run still reads the rows');
  assert.equal(b.objects[0].rowsWritten, 0, 'but writes none of them again');
  assert.equal(store.rows.size, 3);
});

test('idempotency: changed content for the same source_ref is a new row, identical content is not', async () => {
  const clock = fakeClock();
  const store = new MemoryStore(clock.now);
  let v = 1;
  const a = { key: 'fake', objects: ['things'], validate: async () => ({}), pull: async () => ({ records: [{ source_ref: 'same', payload: { v } }], nextCursor: null, hasMore: false }) };
  await runConnection(conn, a, store, opts(clock));
  await runConnection(conn, a, store, opts(clock));
  assert.equal(store.rows.size, 1);
  v = 2;
  await runConnection(conn, a, store, opts(clock));
  assert.equal(store.rows.size, 2);
});

test('different connections never dedupe against each other', async () => {
  const clock = fakeClock();
  const store = new MemoryStore(clock.now);
  const a = pagedAdapter();
  await runConnection(conn, a, store, opts(clock));
  await runConnection({ ...conn, id: 'conn-2' }, pagedAdapter(), store, opts(clock));
  assert.equal(store.rows.size, TOTAL_PAGES * PER_PAGE * 2);
});

test('resumability: crash while pulling page 3 resumes at page 3, with pages 1-2 intact', async () => {
  const clock = fakeClock();
  const store = new MemoryStore(clock.now);
  const crashing = pagedAdapter({ onPull: (cursor) => { if (cursor === 'p2') throw new Error('boom: process died'); } });
  const r1 = await runConnection(conn, crashing, store, opts(clock));
  assert.equal(r1.objects[0].status, 'failed');
  assert.equal(r1.objects[0].pages, 2);
  assert.equal(store.rows.size, 2 * PER_PAGE);
  assert.equal(store.cursors.get('conn-1|things'), 'p2', 'cursor stops at the last ingested page');
  assert.equal(store.runs[0].status, 'partial');

  const healthy = pagedAdapter();
  const r2 = await runConnection(conn, healthy, store, opts(clock));
  assert.equal(r2.objects[0].status, 'succeeded');
  // cursor 'p2' means pages 1-2 are done, so the first pull asks for page 3 and the second for page 4.
  assert.deepEqual(healthy.seen, ['p2', 'p3'], 'second run starts at page 3, never re-reads pages 1-2');
  assert.deepEqual([...new Set([...store.rows.values()].map((x) => x.payload.page))].sort(), [1, 2, 3, 4]);
  assert.equal(store.rows.size, TOTAL_PAGES * PER_PAGE);
  assert.equal(store.runs[1].cursorBefore, 'p2');
});

test('resumability: the cursor never gets ahead of ingestion', async () => {
  const clock = fakeClock();
  const store = new MemoryStore(clock.now);
  const order = [];
  const origIngest = store.ingest.bind(store);
  const origSet = store.setCursor.bind(store);
  store.ingest = async (...a) => { order.push('ingest'); return origIngest(...a); };
  store.setCursor = async (...a) => { order.push('cursor'); return origSet(...a); };
  await runConnection(conn, pagedAdapter(), store, opts(clock));
  assert.deepEqual(order, Array.from({ length: TOTAL_PAGES }, () => ['ingest', 'cursor']).flat());
  // A failing ingest must leave the cursor untouched.
  const s2 = new MemoryStore(clock.now);
  s2.ingest = async () => { throw new Error('db down'); };
  const r = await runConnection(conn, pagedAdapter(), s2, opts(clock));
  assert.equal(r.objects[0].status, 'failed');
  assert.equal(s2.cursors.size, 0);
});

test('resumability: crash between ingest and cursor write replays one page, deduped', async () => {
  const clock = fakeClock();
  const store = new MemoryStore(clock.now);
  const origSet = store.setCursor.bind(store);
  let calls = 0;
  store.setCursor = async (...a) => { if (++calls === 2) throw new Error('crash before cursor write'); return origSet(...a); };
  const r1 = await runConnection(conn, pagedAdapter(), store, opts(clock));
  assert.equal(r1.objects[0].status, 'failed');
  assert.equal(store.rows.size, 2 * PER_PAGE, 'page 2 was ingested');
  assert.equal(store.cursors.get('conn-1|things'), 'p1', 'but its cursor was not advanced');
  const a2 = pagedAdapter();
  const r2 = await runConnection(conn, a2, store, opts(clock));
  assert.deepEqual(a2.seen[0], 'p1');
  assert.equal(r2.objects[0].rowsWritten, 2 * PER_PAGE, 'page 2 replayed as no-ops; pages 3 and 4 are new');
  assert.equal(store.rows.size, TOTAL_PAGES * PER_PAGE);
});

test('backoff: a 429 with Retry-After waits at least that long, then succeeds', async () => {
  const clock = fakeClock();
  const store = new MemoryStore(clock.now);
  let n = 0;
  const adapter = { key: 'fake', objects: ['things'], validate: async () => ({}), pull: async () => { if (++n === 1) throw new HttpError(429, 'slow down', 7000); return { records: [rec(1, 0)], nextCursor: 'p1', hasMore: false }; } };
  const r = await runConnection(conn, adapter, store, opts(clock));
  assert.equal(r.objects[0].status, 'succeeded');
  assert.equal(r.objects[0].attempts, 2);
  assert.ok(clock.sleeps.includes(7000), `sleeps were ${clock.sleeps}`);
  assert.ok(Math.min(...clock.sleeps.filter((s) => s >= 7000)) >= 7000);
  assert.equal(n, 2);
});

test('backoff: Retry-After is a floor even when jitter is larger, and jitter is full-range below the cap', () => {
  const o = { baseMs: 1000, capMs: 60_000, random: () => 0.999 };
  assert.equal(backoffDelayMs(3, o, 500), 3996, 'jitter above Retry-After wins');
  assert.equal(backoffDelayMs(3, { ...o, random: () => 0 }, 9000), 9000, 'Retry-After wins over zero jitter');
  assert.equal(backoffDelayMs(1, { ...o, random: () => 0.5 }, null), 500);
  assert.equal(backoffDelayMs(20, { ...o, random: () => 0.999 }, null), 59940, 'capped');
  assert.equal(backoffDelayMs(2, { ...o, random: () => 0 }, null), 0, 'full jitter can be zero');
});

test('backoff: gives up after max attempts and records the attempt count; non-retryable errors are not retried', async () => {
  const clock = fakeClock();
  let n = 0;
  const always503 = async () => { n++; throw new HttpError(503, 'down'); };
  await assert.rejects(() => withBackoff(always503, { maxAttempts: 4, baseMs: 10, capMs: 100, sleep: clock.sleep, random: () => 0.5 }), (e) => e.status === 503 && e.attempts === 4);
  assert.equal(n, 4);
  assert.equal(clock.sleeps.length, 3);
  let m = 0;
  await assert.rejects(() => withBackoff(async () => { m++; throw new HttpError(400, 'bad'); }, { maxAttempts: 5, baseMs: 1, capMs: 1, sleep: clock.sleep, random: () => 0 }));
  assert.equal(m, 1);
  assert.equal(isRetryable(new HttpError(500, 'x')), false);
  assert.equal(isRetryable(new HttpError(429, 'x')), true);
  assert.equal(isRetryable(new Error('x')), false);
});

test('Retry-After header parsing: seconds and HTTP-date, from a real Response through requestJson', async () => {
  assert.equal(parseRetryAfter('3'), 3000);
  assert.equal(parseRetryAfter('Wed, 21 Oct 2015 07:28:10 GMT', Date.parse('Wed, 21 Oct 2015 07:28:00 GMT')), 10_000);
  assert.equal(parseRetryAfter('garbage'), null);
  assert.equal(parseRetryAfter(null), null);
  const f = fakeFetch([{ status: 429, json: {}, headers: { 'retry-after': '12' } }]);
  await assert.rejects(() => requestJson(f, 'https://api.example.com/x'), (e) => e instanceof HttpError && e.status === 429 && e.retryAfterMs === 12_000);
});

test('rate limiter: token bucket spends the burst, then waits 1/rps per token', async () => {
  const clock = fakeClock();
  const rl = createRateLimiter({ rps: 2, burst: 2, now: clock.now, sleep: clock.sleep });
  await rl.take();
  await rl.take();
  assert.deepEqual(clock.sleeps, []);
  await rl.take();
  assert.deepEqual(clock.sleeps, [500]);
  clock.advance(10_000);
  await rl.take();
  await rl.take();
  assert.deepEqual(clock.sleeps, [500], 'refill is capped at the burst, then two tokens are free again');
  await rl.take();
  assert.deepEqual(clock.sleeps, [500, 500]);
  assert.throws(() => createRateLimiter({ rps: 0, burst: 1, now: clock.now, sleep: clock.sleep }));
});

test('runner paces calls with the definition rate limit', async () => {
  const clock = fakeClock();
  const store = new MemoryStore(clock.now);
  const definition = { rate_limit: { rps: 1, burst: 1, source: 'documented' } };
  await runConnection(conn, pagedAdapter(), store, opts(clock, { definition }));
  assert.equal(clock.sleeps.filter((s) => s === 1000).length, TOTAL_PAGES - 1, 'one second between pulls after the first');
});

const H = 3_600_000;
const NOW = Date.parse('2026-10-05T12:00:00Z');
const run = (over) => ({ object: 'orders', status: 'succeeded', startedAt: new Date(NOW - 2 * H).toISOString(), finishedAt: new Date(NOW - 2 * H).toISOString(), rowsRead: 10, rowsWritten: 10, ...over });

test('health: healthy, stale by age, stale by zero rows, failing, not_running', () => {
  assert.equal(computeHealth([run()], NOW).status, 'healthy');
  const old = new Date(NOW - 30 * H).toISOString();
  const stale = computeHealth([run({ startedAt: old, finishedAt: old })], NOW);
  assert.equal(stale.status, 'stale');
  assert.match(stale.reason, /30h ago, allowed 26h/);
  const zero = computeHealth([run({ rowsRead: 0, rowsWritten: 0 })], NOW);
  assert.equal(zero.status, 'stale');
  assert.match(zero.reason, /0 rows/);
  assert.equal(computeHealth([run({ status: 'failed' })], NOW).status, 'failing');
  assert.equal(computeHealth([run({ status: 'partial' })], NOW).status, 'failing');
  assert.equal(computeHealth([], NOW).status, 'not_running');
  assert.equal(computeHealth([run({ status: 'running', finishedAt: null })], NOW).status, 'not_running');
});

test('health: a read with all duplicates is healthy (rows moved), the stale window is configurable, newest run decides', () => {
  assert.equal(computeHealth([run({ rowsRead: 5, rowsWritten: 0 })], NOW).status, 'healthy');
  assert.equal(computeHealth([run()], NOW, 1 * H).status, 'stale');
  assert.equal(DEFAULT_STALE_AFTER_MS, 26 * H);
  const failedAfterSuccess = [run({ finishedAt: new Date(NOW - 5 * H).toISOString() }), run({ status: 'failed', finishedAt: new Date(NOW - 1 * H).toISOString() })];
  assert.equal(computeHealth(failedAfterSuccess, NOW).status, 'failing');
  const recoveredAfterFail = [run({ status: 'failed', finishedAt: new Date(NOW - 5 * H).toISOString() }), run({ finishedAt: new Date(NOW - 1 * H).toISOString() })];
  assert.equal(computeHealth(recoveredAfterFail, NOW).status, 'healthy');
  const twoObjects = [run(), run({ object: 'customers', rowsRead: 0 })];
  assert.equal(computeHealth(twoObjects, NOW).status, 'stale', 'one stale object downgrades the connection');
  assert.equal(computeHealth([run({ object: 'a', status: 'failed' }), run({ object: 'b', rowsRead: 0 })], NOW).status, 'failing', 'failing outranks stale');
});

test('runner downgrades health to stale when its latest successful run moved 0 rows, and records it', async () => {
  const clock = fakeClock(NOW);
  const store = new MemoryStore(clock.now);
  const empty = { key: 'fake', objects: ['things'], validate: async () => ({}), pull: async () => ({ records: [], nextCursor: null, hasMore: false }) };
  const r = await runConnection(conn, empty, store, opts(clock));
  assert.equal(r.objects[0].status, 'succeeded');
  assert.equal(r.health.status, 'stale');
  assert.equal(store.health.get('conn-1').status, 'stale');
  const r2 = await runConnection({ ...conn, id: 'conn-9' }, pagedAdapter(), store, opts(clock));
  assert.equal(r2.health.status, 'healthy');
});

test('oauth sync refreshes expiry, stores rotation, and pulls with the new access token', async () => {
  const clock = fakeClock(NOW);
  const store = new MemoryStore(clock.now);
  let tokens = { access_token: 'old', refresh_token: 'r1', expires_at: new Date(NOW + 1000).toISOString(), token_type: 'Bearer', rotated_at: new Date(NOW - 1000).toISOString() };
  const tokenStore = { get: async () => tokens, compareAndSet: async (expected, next) => { assert.equal(expected, tokens.rotated_at); tokens = next; return true; } };
  const fetch = fakeFetch([{ json: { access_token: 'new', refresh_token: 'r2', expires_in: 3600 } }]);
  const adapter = { objects: ['things'], pull: async (_object, _cursor, creds) => { assert.equal(creds.access_token, 'new'); assert.equal(tokens.refresh_token, 'r2'); return { records: [rec(1, 1)], nextCursor: null, hasMore: false }; } };
  const out = await runConnection({ ...conn, creds: tokens }, adapter, store, opts(clock, { fetch, oauth: { store: tokenStore, tokenUrl: 'https://auth.example.com/token', clientId: 'id' } }));
  assert.equal(out.objects[0].status, 'succeeded');
  assert.equal(fetch.calls.length, 1);
});

test('oauth sync uses winner after stale CAS, reports invalid_grant, and skips fresh tokens', async () => {
  const clock = fakeClock(NOW);
  const initial = { access_token: 'old', refresh_token: 'r1', expires_at: new Date(NOW - 1).toISOString(), token_type: 'Bearer', rotated_at: new Date(NOW - 1000).toISOString() };
  let current = initial;
  const winner = { ...initial, access_token: 'winner', refresh_token: 'r3', rotated_at: new Date(NOW + 1000).toISOString() };
  const tokenStore = { get: async () => current, compareAndSet: async () => { current = winner; return false; } };
  const adapter = { objects: ['things'], pull: async (_o, _c, creds) => { assert.equal(creds.access_token, 'winner'); return { records: [rec(1, 1)], nextCursor: null, hasMore: false }; } };
  const oauth = { store: tokenStore, tokenUrl: 'https://auth.example.com/token', clientId: 'id' };
  const out = await runConnection({ ...conn, creds: initial }, adapter, new MemoryStore(clock.now), opts(clock, { fetch: fakeFetch([{ json: { access_token: 'loser', refresh_token: 'r2' } }]), oauth }));
  assert.equal(out.objects[0].status, 'succeeded');
  assert.equal(current.refresh_token, 'r3');
  const bad = await runConnection({ ...conn, creds: initial }, adapter, new MemoryStore(clock.now), opts(clock, { fetch: fakeFetch([{ status: 400, json: { error: 'invalid_grant' } }]), oauth }));
  assert.equal(bad.objects[0].status, 'failed');
  assert.equal(bad.objects[0].error, 'The vendor sign-in expired. Re-authorize this connection.');
  assert.equal(bad.health.status, 'failing');
  const fresh = { ...initial, access_token: 'winner', expires_at: new Date(NOW + 3600_000).toISOString() };
  const noRefresh = fakeFetch();
  await runConnection({ ...conn, creds: fresh }, adapter, new MemoryStore(clock.now), opts(clock, { fetch: noRefresh, oauth }));
  assert.equal(noRefresh.calls.length, 0);
});

test('Supabase RPC store calls the CONTRACT RPC names with p_secret from env and withholds error bodies', async () => {
  const f = fakeFetch([
    { json: 'p1' },
    { json: 'run-9' },
    { json: 2 },
    { json: null },
    { json: null },
    { json: [{ object: 'things', status: 'succeeded', started_at: 's', finished_at: 'f', rows_read: 3, rows_written: 3 }] },
    { json: null },
    { status: 500, text: 'leaked SECRET-BODY' },
  ]);
  process.env.LOVELEEDAY_CONNECTORS_SERVER_SECRET = 'srv-secret-value';
  const s = new SupabaseRpcStore({ url: 'https://proj.supabase.co/', anonKey: 'anon', fetch: f });
  const st = await s.startRun(conn, 'things');
  assert.deepEqual(st, { runId: 'run-9', cursor: 'p1' });
  assert.equal(await s.ingest('run-9', conn, [{ source_system: 'fake', object: 'things', source_ref: 'a', payload: {}, payload_sha256: 'x', observed_at: 'o' }]), 2);
  assert.equal(await s.ingest('run-9', conn, []), 0, 'empty batch makes no call');
  await s.setCursor(conn, 'things', 'p2');
  await s.finishRun('run-9', { status: 'succeeded', rowsRead: 3, rowsWritten: 3, error: null, cursorAfter: 'p2', attempt: 1 });
  const runs = await s.recentRuns(conn, 10);
  assert.equal(runs[0].rowsRead, 3);
  await s.recordHealth(conn, { status: 'healthy', reason: 'ok', checkedAt: 'now' });
  const names = f.calls.map((c) => c.url.split('/rpc/')[1]);
  assert.deepEqual(names, ['sync_cursor_get', 'sync_run_start', 'ingest_records', 'sync_cursor_set', 'sync_run_finish', 'sync_runs_recent', 'connection_health_record']);
  for (const c of f.calls) assert.equal(JSON.parse(c.init.body).p_secret, 'srv-secret-value');
  // argument names match supabase/loveleeday/20261005_10_connector_platform.sql (scripts/check-rpc-contract.mjs checks the same)
  const args = f.calls.map((c) => Object.keys(JSON.parse(c.init.body)).sort().join(','));
  assert.deepEqual(args, [
    'p_connection,p_object,p_secret', 'p_connection,p_object,p_secret', 'p_records,p_run,p_secret', 'p_connection,p_cursor,p_object,p_secret',
    'p_cursor_after,p_error,p_rows_read,p_rows_written,p_run,p_secret,p_status', 'p_connection,p_limit,p_secret', 'p_connection,p_secret',
  ]);
  await assert.rejects(() => s.setCursor(conn, 'things', 'p3'), (e) => /HTTP 500/.test(e.message) && !/SECRET-BODY/.test(e.message));
  delete process.env.LOVELEEDAY_CONNECTORS_SERVER_SECRET;
  await assert.rejects(() => new SupabaseRpcStore({ url: 'https://x', anonKey: 'a', fetch: f }).startRun(conn, 'o'), /SERVER_SECRET is not set/);
});
