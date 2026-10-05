import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createConnectSession, getConnectionAccessToken, listNangoIntegrations, nangoSecretKey, viaNango, resolveNangoRoute, NangoError } from '../nango.ts';
import { aggregatorProbe, classifyAggregator, AGGREGATOR_PROBES } from '../../../scripts/lib/aggregator-probes.mjs';

const routes = { hubspot: viaNango('hubspot', 'hubspot-prod') };
const res = (status, body) => new Response(JSON.stringify(body), { status });

test('via_nango entry maps a system to an integration id', () => {
  assert.deepEqual(resolveNangoRoute('hubspot', routes), { kind: 'via_nango', system_key: 'hubspot', nango_integration_id: 'hubspot-prod' });
  assert.equal(resolveNangoRoute('nope', routes), null);
});

test('createConnectSession posts end user + allowed integrations with the bearer secret', async () => {
  let seen;
  const f = async (url, init) => { seen = { url, init }; return res(201, { data: { token: 'tok', expires_at: '2026-10-05T00:00:00Z' } }); };
  const s = await createConnectSession({ tenantId: 't1', systemKeys: ['hubspot'] }, f, 'sek', routes);
  assert.deepEqual(s, { token: 'tok', expires_at: '2026-10-05T00:00:00Z' });
  assert.equal(seen.url, 'https://api.nango.dev/connect/sessions');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.authorization, 'Bearer sek');
  assert.deepEqual(JSON.parse(seen.init.body), { end_user: { id: 't1' }, allowed_integrations: ['hubspot-prod'] });
});

test('createConnectSession refuses an unrouted system and surfaces HTTP errors without vendor text', async () => {
  await assert.rejects(createConnectSession({ tenantId: 't', systemKeys: ['x'] }, async () => res(200, {}), 'k', routes), /no via_nango route/);
  await assert.rejects(createConnectSession({ tenantId: 't', systemKeys: ['hubspot'] }, async () => res(401, { error: 'secret-echo' }), 'k', routes), (e) => e instanceof NangoError && e.status === 401 && !/secret-echo/.test(e.message));
});

test('getConnectionAccessToken reads credentials.access_token', async () => {
  let url;
  const f = async (u) => { url = u; return res(200, { credentials: { access_token: 'at', expires_at: '2026-01-01T00:00:00Z' } }); };
  assert.deepEqual(await getConnectionAccessToken('c 1', 'hubspot-prod', f, 'k'), { access_token: 'at', expires_at: '2026-01-01T00:00:00Z' });
  assert.equal(url, 'https://api.nango.dev/connection/c%201?provider_config_key=hubspot-prod');
  await assert.rejects(getConnectionAccessToken('c', 'i', async () => res(200, { credentials: {} }), 'k'), /no access token/);
});

test('listNangoIntegrations returns unique_key + provider only', async () => {
  const f = async () => res(200, { data: [{ unique_key: 'a', provider: 'hubspot', extra: 1 }, { nope: 1 }] });
  assert.deepEqual(await listNangoIntegrations(f, 'k'), [{ unique_key: 'a', provider: 'hubspot' }]);
});

test('nangoSecretKey: env wins; dev falls back to vault file; prod refuses the file', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ng-')); const file = path.join(dir, 'nango.env');
  writeFileSync(file, 'NANGO_SECRET_KEY=fromfile\n');
  assert.equal(nangoSecretKey({ NANGO_SECRET_KEY: 'fromenv' }, file), 'fromenv');
  assert.equal(nangoSecretKey({}, file), 'fromfile');
  assert.throws(() => nangoSecretKey({ NODE_ENV: 'production' }, file), /not configured/);
});

test('aggregator probe: CLIENT_VERIFIED needs real accepted and control refused; finch stays CONFIGURED on identical answers', async () => {
  const f = async (u, init) => {
    const auth = init.headers?.authorization || ''; const good = auth === 'Bearer goodkey';
    if (u.includes('nango')) return good ? res(200, { data: [{ unique_key: 'a' }] }) : res(401, {});
    return res(400, { finch_code: 'invalid_request' });
  };
  const n = await aggregatorProbe('nango', { NANGO_SECRET_KEY: 'goodkey' }, f);
  assert.equal(n.status, 'CLIENT_VERIFIED'); assert.equal(n.evidence.record_count, 1);
  assert.equal(JSON.stringify(n).includes('goodkey'), false);
  const fin = await aggregatorProbe('finch', { FINCH_CLIENT_ID: 'i', FINCH_CLIENT_SECRET: 's' }, f);
  assert.equal(fin.status, 'CONFIGURED');
  assert.equal((await aggregatorProbe('merge', {}, f)).status, 'NOT_CONFIGURED');
  assert.equal(classifyAggregator({}, { http: 200 }, { http: 200 }), 'CONFIGURED');
  assert.deepEqual(Object.keys(AGGREGATOR_PROBES), ['nango', 'merge', 'unified', 'pipedream', 'plaid', 'finch']);
});
