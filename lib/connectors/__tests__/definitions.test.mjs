import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONNECTOR_DEFINITIONS, getDefinition } from '../definitions.ts';
import { ADAPTERS } from '../adapters/registry.ts';
import { INTERIM_LAYOUTS } from '../upload/interim-layouts.ts';
import { applyMapping, suggestMapping } from '../upload/map.ts';
import { parseCsv, toCsv } from '../upload/parse.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const files = fs.readdirSync(path.join(root, 'data/connectors/systems')).filter((f) => f.endsWith('.json'));
const AUTH = new Set(['oauth2_authcode', 'oauth2_client_credentials', 'oauth1_tba', 'api_key', 'basic', 'service_account', 'key_pair', 'jwt', 'sftp', 'upload', 'none']);
const PARTNER_13 = ['yardi-voyager', 'mri-software', 'tyler-munis', 'appfolio', 'workday', 'adp-workforce-now', 'toast', 'clover', 'sage-intacct', 'xero', 'procore', 'gusto', 'sage'];

test('all 57 systems are defined, one per JSON file, with valid auth methods', () => {
  assert.equal(files.length, 57);
  assert.equal(CONNECTOR_DEFINITIONS.length, 57);
  assert.deepEqual(CONNECTOR_DEFINITIONS.map((d) => d.key).sort(), files.map((f) => f.replace('.json', '')).sort());
  assert.equal(new Set(CONNECTOR_DEFINITIONS.map((d) => d.key)).size, 57);
  for (const d of CONNECTOR_DEFINITIONS) {
    assert.ok(AUTH.has(d.auth_method), `${d.key}: ${d.auth_method}`);
    assert.ok(d.auth_methods.every((a) => AUTH.has(a)) && d.auth_methods[0] === d.auth_method, d.key);
    assert.ok(d.rate_limit.rps > 0 && d.rate_limit.burst >= 1, d.key);
  }
});

test('build_status is derived, never live, and matches the adapters that really exist', () => {
  for (const d of CONNECTOR_DEFINITIONS) {
    assert.ok(['implemented', 'sftp_csv_path', 'planned'].includes(d.build_status), `${d.key}: ${d.build_status}`);
    assert.notEqual(d.build_status, 'live');
    assert.equal(d.build_status === 'implemented', d.key in ADAPTERS, `${d.key} implemented iff an adapter exists`);
  }
  for (const k of Object.keys(ADAPTERS)) assert.equal(getDefinition(k).build_status, 'implemented');
  assert.equal(getDefinition('yardi-voyager').build_status, 'sftp_csv_path');
  assert.equal(getDefinition('toast').build_status, 'sftp_csv_path');
  assert.equal(getDefinition('qad-adaptive-erp').build_status, 'planned');
  assert.equal(getDefinition('azure-synapse').build_status, 'planned', 'TDS-only, no adapter, not faked');
});

test('auth mapping: NetSuite also supports oauth1_tba, upload and SFTP map to their own methods, S3 is a role not an OAuth app', () => {
  assert.deepEqual(getDefinition('netsuite').auth_methods, ['oauth2_authcode', 'oauth1_tba']);
  assert.equal(getDefinition('csv-excel-upload').auth_method, 'upload');
  assert.equal(getDefinition('sftp-drop').auth_method, 'sftp');
  assert.equal(getDefinition('snowflake').auth_method, 'key_pair');
  assert.equal(getDefinition('amazon-s3').auth_method, 'service_account');
  assert.equal(getDefinition('quickbooks-online').auth_method, 'oauth2_authcode');
  assert.ok(getDefinition('box').auth_methods.includes('jwt'));
});

test('UNVERIFIED stays labelled: vendor text is copied verbatim and the field is listed in `unverified`', () => {
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(root, 'data/connectors/systems', f), 'utf8'));
    const d = getDefinition(f.replace('.json', ''));
    assert.equal(d.api_base_url, j.api.base_url, `${d.key} api_base_url verbatim`);
    assert.equal(d.rate_limits, String(j.rate_limits));
    assert.equal(d.incremental_sync, String(j.incremental_sync));
    assert.equal(d.partner_program, j.access_requirements.partner_program_name || '');
    if (/UNVERIFIED/i.test(j.rate_limits)) assert.ok(d.unverified.includes('rate_limits') && /UNVERIFIED/i.test(d.rate_limits), `${d.key} rate_limits`);
    if (/UNVERIFIED/i.test(j.api.base_url)) assert.ok(d.unverified.includes('api_base_url'), `${d.key} api_base_url`);
    if (/UNVERIFIED/i.test(j.auth.token_lifetime ?? '')) assert.ok(d.unverified.includes('token_lifetime'), `${d.key} token_lifetime`);
  }
  assert.match(getDefinition('quickbooks-online').api_base_url, /UNVERIFIED/);
  assert.ok(getDefinition('quickbooks-online').unverified.includes('incremental_sync'));
  assert.ok(getDefinition('shopify').unverified.includes('rate_limits'));
  assert.ok(!getDefinition('hubspot').unverified.includes('api_base_url'), 'a verified field is not marked unverified');
});

test('rate limits are structured only where the vendor JSON gives a number; everything else is the labelled conservative default', () => {
  assert.equal(getDefinition('quickbooks-online').rate_limit.source, 'documented');
  assert.ok(Math.abs(getDefinition('quickbooks-online').rate_limit.rps - 500 / 60) < 1e-9);
  assert.equal(getDefinition('clover').rate_limit.rps, 16);
  assert.deepEqual(getDefinition('shopify').rate_limit, { rps: 2, burst: 2, source: 'default_unverified' });
});

test('access gate is derived from the vendor flags: 35 self-serve, 13 partner/license, 9 unverified', () => {
  const by = (g) => CONNECTOR_DEFINITIONS.filter((d) => d.access_gate === g).length;
  assert.deepEqual([by('self-serve'), by('partner/license'), by('unverified')], [35, 13, 9]);
});

test('every partner-gated system has a doc with the required sections', () => {
  for (const k of PARTNER_13) {
    const p = path.join(root, 'docs/connector-platform/partner', `${k}.md`);
    assert.ok(fs.existsSync(p), `${k}.md missing`);
    const md = fs.readFileSync(p, 'utf8');
    for (const h of ['## Program', '## What to apply with', '## Security questionnaire items', '## Sandbox path', '## Cost and time', '## Interim SFTP/CSV path']) assert.ok(md.includes(h), `${k}: ${h}`);
    assert.match(md, /\| field \| type \| required \|/, `${k}: layout table`);
  }
  const yardi = fs.readFileSync(path.join(root, 'docs/connector-platform/partner/yardi-voyager.md'), 'utf8');
  assert.match(yardi, /Exact figure UNVERIFIED/, 'UNVERIFIED cost text survives into the doc');
  assert.match(fs.readFileSync(path.join(root, 'docs/connector-platform/partner/sage.md'), 'utf8'), /UNVERIFIED/);
  for (const k of PARTNER_13.filter((x) => x !== 'sage')) {
    const d = getDefinition(k);
    assert.ok(d.build_status === 'sftp_csv_path' || ['clover', 'xero'].includes(k), `${k} ${d.build_status}`);
  }
});

test('every interim layout ingests: a file with exactly those headers maps automatically with zero mapping errors', () => {
  for (const [key, layouts] of Object.entries(INTERIM_LAYOUTS)) {
    for (const l of layouts) {
      const header = l.fields.map((f) => f.name);
      const sample = l.fields.map((f) => ({ string: 'x1', date: '2026-03-09', money: '12.50', number: '3', boolean: 'true' })[f.type]);
      const table = parseCsv(toCsv([header, sample]));
      const mapping = suggestMapping(table.header, l.fields);
      assert.equal(Object.keys(mapping).length, l.fields.length, `${key}/${l.file}: every header maps automatically`);
      const r = applyMapping({ table, mapping, fields: l.fields, targetObject: l.object, fileSha256: 'c'.repeat(64) });
      assert.deepEqual(r.mappingErrors, [], `${key}/${l.file}`);
      assert.deepEqual(r.errors, [], `${key}/${l.file}`);
      assert.equal(r.rowsAccepted, 1);
      // and a row missing a required field is rejected, not silently accepted
      const req = l.fields.findIndex((f) => f.required);
      const broken = sample.slice();
      broken[req] = '';
      const bad = applyMapping({ table: parseCsv(toCsv([header, broken])), mapping, fields: l.fields, targetObject: l.object, fileSha256: 'c'.repeat(64) });
      assert.equal(bad.rowsAccepted, 0, `${key}/${l.file}: empty required field must fail`);
    }
  }
  assert.equal(Object.keys(INTERIM_LAYOUTS).length, 13);
});
