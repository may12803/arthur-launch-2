import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../../../supabase/loveleeday/20261005_25_sync_queue.sql', import.meta.url), 'utf8');
const route = readFileSync(new URL('../../../app/api/cron/sync/route.ts', import.meta.url), 'utf8');

test('queue enqueues every due connection without the former 20 item slice', () => {
  assert.match(sql, /insert into public\.sync_jobs\(tenant_id, connection_id\)\s+select c\.tenant_id, c\.id/);
  assert.doesNotMatch(route, /MAX_PER_RUN|\.slice\(0, 20\)/);
});
test('claims rank each tenant before selecting jobs and lock without waiting', () => {
  assert.match(sql, /row_number\(\) over \(partition by j\.tenant_id/);
  assert.match(sql, /r\.last_claim nulls first/);
  assert.match(sql, /for update of j skip locked/);
});
test('retries use increasing bounded delay and stale running jobs can be reclaimed', () => {
  assert.match(sql, /j\.locked_at < now\(\) - interval '10 minutes'/);
  assert.match(sql, /attempts >= 5/);
  assert.match(sql, /60 \* power\(2, least\(attempts - 1, 6\)\)/);
});
