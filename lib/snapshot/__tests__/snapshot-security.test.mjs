import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientKeyFromHeaders, SHARED_BUCKET } from '../client-key.ts';
import { SlidingWindow } from '../limits.ts';
import { takeShared, supabaseSharedTake } from '../shared-limit.ts';
import { readFormWithin } from '../body.ts';
import { SupabaseStore, MemoryStore, newRunId } from '../store.ts';
import { purgeWithinBudget } from '../purge.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const hdr = (o) => (n) => o[n] ?? null;

// ---- 4: client identity
test('client key: only fly-client-ip is trusted; x-forwarded-for is never read (finding 4)', () => {
  assert.equal(clientKeyFromHeaders(hdr({ 'fly-client-ip': '203.0.113.9' })), '203.0.113.9');
  assert.equal(clientKeyFromHeaders(hdr({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })), SHARED_BUCKET);
  // Rotating a spoofed header must not mint new identities: all of these share one bucket.
  const keys = new Set(['1.1.1.1', '2.2.2.2', '3.3.3.3'].map((ip) => clientKeyFromHeaders(hdr({ 'x-forwarded-for': ip }))));
  assert.equal(keys.size, 1);
  assert.equal(clientKeyFromHeaders(hdr({ 'fly-client-ip': 'not an ip; drop table' })), SHARED_BUCKET);
  assert.equal(clientKeyFromHeaders(hdr({})), SHARED_BUCKET);
});

// ---- 5: shared limiter
test('shared limiter: a second process sees the first process\'s hits (finding 5)', async () => {
  const counts = new Map();
  const shared = async (bucket, max) => { const n = (counts.get(bucket) ?? 0) + 1; counts.set(bucket, n); return { ok: n <= max, retryAfterSec: 30 }; };
  const procA = new SlidingWindow(2, 3600_000, Date.now, 'upload');
  const procB = new SlidingWindow(2, 3600_000, Date.now, 'upload'); // a restart or another machine: empty local state
  assert.equal((await takeShared(procA, 'ip', shared)).ok, true);
  assert.equal((await takeShared(procA, 'ip', shared)).ok, true);
  const third = await takeShared(procB, 'ip', shared);
  assert.equal(third.ok, false);
  assert.equal(third.retryAfterSec, 30);
});

test('shared limiter: store down falls back to the local limiter, never open', async () => {
  const down = async () => { throw new Error('connect refused'); };
  const w = new SlidingWindow(2, 3600_000, Date.now, 'upload');
  assert.equal((await takeShared(w, 'ip', down)).ok, true);
  assert.equal((await takeShared(w, 'ip', down)).ok, true);
  assert.equal((await takeShared(w, 'ip', down)).ok, false);
  const none = new SlidingWindow(1, 3600_000, Date.now, 'run');
  assert.equal((await takeShared(none, 'ip', null)).ok, true);
  assert.equal((await takeShared(none, 'ip', null)).ok, false);
});

test('shared limiter: RPC adapter calls snapshot_rate_take and maps the row; HTTP errors throw', async () => {
  let seen;
  const f = async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return { ok: true, json: async () => [{ allowed: false, retry_after_seconds: 12 }] }; };
  const v = await supabaseSharedTake('https://x.test', 'k', f)('upload:1.2.3.4', 6, 3600);
  assert.match(seen.url, /\/rest\/v1\/rpc\/snapshot_rate_take$/);
  assert.deepEqual(seen.body, { p_bucket: 'upload:1.2.3.4', p_max: 6, p_window_seconds: 3600 });
  assert.deepEqual(v, { ok: false, retryAfterSec: 12 });
  await assert.rejects(supabaseSharedTake('https://x.test', 'k', async () => ({ ok: false, status: 500 }))('b', 1, 1));
});

test('migration defines the table and RPC, service role only, RLS forced', () => {
  const sql = readFileSync(path.join(root, 'supabase/loveleeday/20261006_30_snapshot_rate_limits.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.snapshot_rate_hits/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /function public\.snapshot_rate_take/);
  assert.match(sql, /security definer[\s\S]*set search_path = public/);
  assert.match(sql, /grant execute on function public\.snapshot_rate_take\(text, integer, integer\) to service_role/);
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /grant[^;]*to\s+(anon|authenticated)/i);
});

// ---- 6: bounded body
const mp = (size) => {
  const b = '----t';
  const head = `--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.csv"\r\nContent-Type: text/csv\r\n\r\n`;
  return { b, body: Buffer.concat([Buffer.from(head), Buffer.alloc(size, 97), Buffer.from(`\r\n--${b}--\r\n`)]) };
};
const reqWith = (body, headers) => new Request('http://x.test/', { method: 'POST', body, headers, duplex: 'half' });

test('upload: a missing Content-Length is refused with 411 (finding 6)', async () => {
  const { b, body } = mp(10);
  const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(body)); c.close(); } });
  const req = reqWith(stream, { 'content-type': `multipart/form-data; boundary=${b}` });
  assert.equal(req.headers.get('content-length'), null);
  await assert.rejects(readFormWithin(req, 1000), (e) => e.status === 411 && e.code === 'length_required');
});

test('upload: a lying small Content-Length cannot make the server buffer past the cap', async () => {
  let pulled = 0;
  const chunk = new Uint8Array(64 * 1024).fill(97);
  const stream = new ReadableStream({ pull(c) { pulled += chunk.length; if (pulled > 50 * 1024 * 1024) c.close(); else c.enqueue(chunk); } });
  const req = reqWith(stream, { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '100' });
  await assert.rejects(readFormWithin(req, 1024 * 1024), (e) => e.status === 413);
  assert.ok(pulled <= 1024 * 1024 + 4 * 64 * 1024, `read ${pulled} bytes past a 1 MB cap`);
});

test('upload: an honest small upload still parses', async () => {
  const { b, body } = mp(500);
  const req = reqWith(new Uint8Array(body), { 'content-type': `multipart/form-data; boundary=${b}`, 'content-length': String(body.length) });
  const form = await readFormWithin(req, 100_000);
  assert.equal(form.get('file').size, 500);
});

test('upload route no longer calls req.formData() directly', () => {
  const src = readFileSync(path.join(root, 'app/api/public/snapshot/route.ts'), 'utf8');
  assert.doesNotMatch(src, /req\.formData\(\)/);
  assert.match(src, /readFormWithin\(req,/);
});

// ---- 7: orphan
test('store: a failed row insert deletes the uploaded object (finding 7)', async () => {
  const calls = [];
  const f = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body });
    if (String(url).includes('/rest/v1/snapshot_runs')) return { ok: false, status: 500 };
    return { ok: true, status: 200 };
  };
  const store = new SupabaseStore('https://x.test', 'k', f);
  const id = newRunId();
  const row = { id, status: 'mapping', created_at: '', expires_at: '', source: 'upload', filename: 'a.csv', file_bytes: 3, file_sha256: null, storage_path: `${id}/a.csv`, header: null, rows_total: null, mapping: null, mapping_meta: null, result: null, error: null, as_of: null };
  await assert.rejects(store.create(row, Buffer.from('abc')));
  const del = calls.find((c) => c.method === 'DELETE' && c.url.includes('/storage/v1/object/snapshot-uploads'));
  assert.ok(del, 'object delete issued');
  assert.deepEqual(JSON.parse(del.body), { prefixes: [`${id}/a.csv`] });
});

// ---- 9: purge
test('purge: pages past 2000 rows until empty, and reports the remainder when the budget runs out (finding 9)', async () => {
  const store = new MemoryStore();
  const old = new Date(Date.now() - 86400_000).toISOString();
  for (let i = 0; i < 2500; i++) store.rows.set(`r${i}`, { id: `r${i}`, expires_at: old, storage_path: null });
  const orig = store.purgeExpired.bind(store);
  store.purgeExpired = async (now) => { // behave like the real store: at most 200 per call
    let n = 0;
    for (const [id, r] of store.rows) { if (n >= 200) break; if (new Date(r.expires_at) <= (now ?? new Date())) { store.rows.delete(id); n++; } }
    return n;
  };
  const r = await purgeWithinBudget(store, { budgetMs: 10_000 });
  assert.equal(r.purged, 2500);
  assert.equal(r.remaining, 0);
  assert.equal(r.budgetExhausted, false);

  for (let i = 0; i < 1000; i++) store.rows.set(`s${i}`, { id: `s${i}`, expires_at: old, storage_path: null });
  let t = 0;
  const r2 = await purgeWithinBudget(store, { budgetMs: 3, now: () => (t += 1) });
  assert.equal(r2.budgetExhausted, true);
  assert.ok(r2.remaining > 0 && r2.purged + r2.remaining === 1000, `purged ${r2.purged} remaining ${r2.remaining}`);
  void orig;
});
