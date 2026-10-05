import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicHttpsUrl, publicHttpsUrlError, safeFetch, setDefaultResolver, isPublicAddress, pinnedLookup } from '../net/safe-url.ts';
import { ADAPTERS } from '../adapters/registry.ts';
import { fakeFetch, routedFetch, hdr, rsaPem } from './_helpers.mjs';
import { readFileSync } from 'node:fs';

const PUBLIC = async () => ['93.184.216.34'];
const rejects = (url, resolve = PUBLIC) => assert.rejects(() => assertPublicHttpsUrl(url, { resolve }), /./, `should reject ${url}`);

const BAD_URLS = [
  // schemes and userinfo
  'http://example.com/', 'ftp://example.com/', 'https://good.com@127.0.0.1/', 'https://user:pw@example.com/', 'https://example.com@10.0.0.5/',
  // loopback and 0/8
  'https://127.0.0.1/', 'https://127.1.2.3/', 'https://0.0.0.0/', 'https://0.1.2.3/', 'https://localhost/', 'https://foo.localhost/', 'https://[::1]/', 'https://[::]/',
  // RFC1918
  'https://10.0.0.1/', 'https://10.255.255.255/', 'https://172.16.0.1/', 'https://172.31.255.255/', 'https://192.168.0.1/', 'https://192.168.255.1/',
  // link-local and metadata
  'https://169.254.169.254/latest/meta-data/', 'https://169.254.0.1/', 'https://[fe80::1]/', 'https://[febf::1]/',
  // CGNAT, multicast, reserved
  'https://100.64.0.1/', 'https://100.127.255.255/', 'https://224.0.0.1/', 'https://239.255.255.250/', 'https://255.255.255.255/', 'https://240.0.0.1/', 'https://[ff02::1]/',
  // unique-local
  'https://[fc00::1]/', 'https://[fd12:3456:789a::1]/',
  // IPv4-mapped IPv6 of the above
  'https://[::ffff:127.0.0.1]/', 'https://[::ffff:7f00:1]/', 'https://[::ffff:10.0.0.5]/', 'https://[::ffff:a9fe:a9fe]/', 'https://[::ffff:192.168.1.1]/', 'https://[::ffff:172.16.0.1]/', 'https://[::ffff:100.64.0.1]/', 'https://[::ffff:0.0.0.0]/',
  // other embeddings of IPv4
  'https://[64:ff9b::7f00:1]/', 'https://[2002:7f00:1::1]/', 'https://[::127.0.0.1]/',
  // decimal, hex, octal and short encodings of loopback / private
  'https://2130706433/', 'https://0x7f000001/', 'https://017700000001/', 'https://127.1/', 'https://0x7f.0.0.1/', 'https://0177.0.0.1/', 'https://167772161/', 'https://0xA9FEA9FE/', 'https://3232235521/',
  // names that are not public
  'https://intranet/', 'https://printer.local/', 'https://svc.internal/', 'https://not a url',
];

test('ssrf: every private, loopback, link-local, CGNAT, multicast, mapped and encoded address is rejected', async () => {
  for (const u of BAD_URLS) await rejects(u);
});

test('ssrf: a public host and public IP literals are accepted', async () => {
  assert.equal((await assertPublicHttpsUrl('https://services.arcgis.com/x/FeatureServer/0', { resolve: PUBLIC })).hostname, 'services.arcgis.com');
  await assertPublicHttpsUrl('https://93.184.216.34/');
  await assertPublicHttpsUrl('https://[2606:2800:220:1:248:1893:25c8:1946]/');
  await assertPublicHttpsUrl('https://[::ffff:93.184.216.34]/');
  assert.equal(isPublicAddress('8.8.8.8'), true);
  assert.equal(isPublicAddress('172.15.0.1'), true);
  assert.equal(isPublicAddress('172.32.0.1'), true);
  assert.equal(isPublicAddress('100.63.255.255'), true);
});

test('ssrf: a hostname that resolves to a private address is rejected, including when only one answer is private', async () => {
  await rejects('https://looks-public.example.com/', async () => ['10.0.0.5']);
  await rejects('https://looks-public.example.com/', async () => ['93.184.216.34', '169.254.169.254']);
  await rejects('https://looks-public.example.com/', async () => ['::ffff:10.0.0.5']);
  await rejects('https://looks-public.example.com/', async () => ['fd00::1']);
  await rejects('https://looks-public.example.com/', async () => []);
  await rejects('https://looks-public.example.com/', async () => {
    throw new Error('ENOTFOUND');
  });
});

test('ssrf: publicHttpsUrlError returns a message for bad targets and null for good ones', async () => {
  assert.match(await publicHttpsUrlError('https://169.254.169.254/', { resolve: PUBLIC }), /public/);
  assert.equal(await publicHttpsUrlError('https://hooks.example.com/in', { resolve: PUBLIC }), null);
});

test('safeFetch: asserts before the request and sends nothing to a private target', async () => {
  const f = fakeFetch([{ json: {} }]);
  await assert.rejects(() => safeFetch(f, 'https://10.0.0.5/x', {}, { resolve: PUBLIC }));
  await assert.rejects(() => safeFetch(f, 'https://internal-looking.example.com/x', {}, { resolve: async () => ['10.0.0.5'] }));
  assert.equal(f.calls.length, 0);
});

test('safeFetch checks the address used by the connector, including mixed answers', async () => {
  let calls = 0;
  let connected = 0;
  const connect = async (url, init, lookup) => {
    const address = await lookup(new URL(url).hostname);
    connected++;
    assert.equal(address.address, '93.184.216.34');
    return new Response('ok');
  };
  const flip = async () => ++calls === 1 ? ['93.184.216.34'] : ['127.0.0.1'];
  await assert.rejects(() => safeFetch(fakeFetch(), 'https://example.com/', {}, { resolve: flip, connect }), /non-public/);
  assert.equal(connected, 0);
  await assert.rejects(() => safeFetch(fakeFetch(), 'https://example.com/', {}, { resolve: async () => ['93.184.216.34', '127.0.0.1'], connect }), /non-public/);
  assert.equal(connected, 0);
  assert.equal((await safeFetch(fakeFetch(), 'https://example.com/', {}, { resolve: PUBLIC, connect })).status, 200);
  assert.equal(connected, 1);
});

test('safeFetch refuses an injected fetch that could resolve the host again', async () => {
  let reachedPrivate = false;
  const rebindingFetch = async () => { reachedPrivate = true; return new Response('private'); };
  await assert.rejects(() => safeFetch(rebindingFetch, 'https://example.com/', {}, { resolve: PUBLIC }), /checked address/);
  assert.equal(reachedPrivate, false);
});

test('native HTTPS connector destroys its request on abort', () => {
  const source = readFileSync(new URL('../net/safe-url.ts', import.meta.url), 'utf8');
  assert.match(source, /init\.signal\?\.addEventListener\('abort', abort/);
  assert.match(source, /const abort = \(\) => req\.destroy\(/);
});

test('safeFetch: sets redirect manual, and refuses a 3xx to the metadata address without following it', async () => {
  const f = routedFetch((url) => (url.startsWith('https://api.example.com') ? { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' }, text: '' } : { json: { leaked: true } }));
  await assert.rejects(() => safeFetch(f, 'https://api.example.com/start', { headers: { authorization: 'Bearer T' } }, { resolve: PUBLIC }), /public/);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].init.redirect, 'manual');
});

test('safeFetch: a redirect to a name that resolves privately is refused; a public redirect is followed and credentials do not cross origins', async () => {
  const resolve = async (h) => (h === 'rebind.example.net' ? ['192.168.1.9'] : ['93.184.216.34']);
  const f1 = routedFetch(() => ({ status: 301, headers: { location: 'https://rebind.example.net/x' }, text: '' }));
  await assert.rejects(() => safeFetch(f1, 'https://api.example.com/start', {}, { resolve }));
  assert.equal(f1.calls.length, 1);
  const f2 = routedFetch((url) => (url === 'https://api.example.com/start' ? { status: 307, headers: { location: 'https://cdn.example.org/next' }, text: '' } : { json: { ok: 1 } }));
  const res = await safeFetch(f2, 'https://api.example.com/start', { headers: { authorization: 'Bearer SECRET', 'x-esri-authorization': 'Bearer SECRET', 'LLD-Signature': 'secret', 'lld-custom': 'secret' } }, { resolve });
  assert.equal(res.status, 200);
  assert.equal(f2.calls.length, 2);
  assert.equal(hdr(f2.calls[1], 'authorization'), undefined);
  assert.equal(hdr(f2.calls[1], 'x-esri-authorization'), undefined);
  assert.equal(new Headers(f2.calls[1].init.headers).get('lld-signature'), null);
  assert.equal(new Headers(f2.calls[1].init.headers).get('lld-custom'), null);
  const loop = routedFetch(() => ({ status: 302, headers: { location: 'https://api.example.com/again' }, text: '' }));
  await assert.rejects(() => safeFetch(loop, 'https://api.example.com/start', {}, { resolve }), /too many redirects/);
});

const ARC = 'https://services.arcgis.com/abc/arcgis/rest/services/Assets/FeatureServer/0';

test('arcgis: a private or loopback service_url never receives a request', async () => {
  for (const service_url of ['https://127.0.0.1/arcgis/rest/services/A/FeatureServer/0', 'https://10.0.0.5/arcgis/rest/services/A/FeatureServer/0', 'https://169.254.169.254/x/FeatureServer/0', 'https://[::1]/x/FeatureServer/0', 'https://2130706433/x/FeatureServer/0']) {
    const f = fakeFetch([{ json: { name: 'x' } }]);
    await assert.rejects(() => ADAPTERS['esri-arcgis'].validate({ access_token: 'TOK', service_url }, f), /./, service_url);
    await assert.rejects(() => ADAPTERS['esri-arcgis'].pull('features', null, { access_token: 'TOK', service_url }, f), /./, service_url);
    assert.equal(f.calls.length, 0, service_url);
  }
});

test('arcgis: a public-looking host that resolves to a private address never receives a request', async () => {
  setDefaultResolver(async () => ['10.0.0.5']);
  try {
    const f = fakeFetch([{ json: { features: [] } }]);
    await assert.rejects(() => ADAPTERS['esri-arcgis'].pull('features', null, { access_token: 'TOK', service_url: ARC }, f), /non-public/);
    assert.equal(f.calls.length, 0);
  } finally {
    setDefaultResolver(PUBLIC);
  }
});

test('arcgis: the token travels in X-Esri-Authorization and never in the URL; a redirect to metadata is refused', async () => {
  const f = fakeFetch([{ json: { name: 'Assets' } }, { json: { features: [] } }]);
  await ADAPTERS['esri-arcgis'].validate({ access_token: 'TOK', service_url: ARC }, f);
  await ADAPTERS['esri-arcgis'].pull('features', null, { access_token: 'TOK', service_url: ARC }, f);
  for (const c of f.calls) {
    assert.equal(hdr(c, 'x-esri-authorization'), 'Bearer TOK');
    assert.equal(c.url.includes('TOK'), false);
    assert.equal(/token=/i.test(c.url), false);
    assert.equal(c.init.redirect, 'manual');
  }
  const r = routedFetch(() => ({ status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data/' }, text: '' }));
  await assert.rejects(() => ADAPTERS['esri-arcgis'].validate({ access_token: 'TOK', service_url: ARC }, r), /public/);
  assert.equal(r.calls.length, 1);
});

test('customer-host adapters: Snowflake account, Databricks workspace, Shopify, Salesforce, Mailchimp all refuse a private resolution', async () => {
  const pem = rsaPem();
  setDefaultResolver(async () => ['10.0.0.5']);
  try {
    const sn = fakeFetch([{ json: {} }]);
    await assert.rejects(() => ADAPTERS.snowflake.validate({ account: 'xy12345', user: 'U', private_key: pem.privateKey ?? pem }, sn), /non-public/);
    const db = fakeFetch([{ json: {} }]);
    await assert.rejects(() => ADAPTERS.databricks.validate({ host: 'adb-1.azuredatabricks.net', access_token: 'T', warehouse_id: 'W' }, db), /non-public/);
    await assert.rejects(() => ADAPTERS.databricks.validate({ host: '10.0.0.5', access_token: 'T', warehouse_id: 'W' }, db), /./);
    await assert.rejects(() => ADAPTERS.databricks.pull('t', null, { host: '127.0.0.1', client_id: 'a', client_secret: 'b', warehouse_id: 'W' }, db), /./);
    const sh = fakeFetch([{ json: {} }]);
    await assert.rejects(() => ADAPTERS.shopify.validate({ shop: 'acme', access_token: 'T' }, sh), /non-public/);
    const sf = fakeFetch([{ json: {} }]);
    await assert.rejects(() => ADAPTERS.salesforce.validate({ access_token: 'T', instance_url: 'https://acme.my.salesforce.com' }, sf), /non-public/);
    const mc = fakeFetch([{ json: {} }]);
    await assert.rejects(() => ADAPTERS.mailchimp.validate({ access_token: 'T', dc: 'us1' }, mc), /non-public/);
    assert.equal(sn.calls.length + db.calls.length + sh.calls.length + sf.calls.length + mc.calls.length, 0);
  } finally {
    setDefaultResolver(PUBLIC);
  }
});

test('pinned lookup answers both shapes node uses, with only the checked address (production regression: ERR_INVALID_IP_ADDRESS)', () => {
  const look = pinnedLookup({ address: '93.184.216.34', family: 4 });
  let single, all;
  look('example.com', { family: 0 }, (err, a, f) => { single = { err, a, f }; });
  look('example.com', { all: true }, (err, list) => { all = { err, list }; });
  assert.deepEqual(single, { err: null, a: '93.184.216.34', f: 4 });
  assert.deepEqual(all, { err: null, list: [{ address: '93.184.216.34', family: 4 }] });
});
