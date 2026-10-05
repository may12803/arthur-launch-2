import test from 'node:test';
import assert from 'node:assert/strict';
import { codeChallengeS256, generateCodeVerifier, generateState, hashState } from '../auth/pkce.ts';
import { beginAuthorization, completeAuthorization, refreshTokens, OAuthError, STATE_TTL_MS } from '../auth/oauth2.ts';
import { clientCredentialsToken } from '../auth/client-credentials.ts';
import { fakeFetch, hdr } from './_helpers.mjs';

// In-memory state store with the atomic single-use semantics the real RPC must provide.
function memStates() {
  const rows = new Map();
  return {
    rows,
    async put(rec) { rows.set(rec.stateHash, { ...rec, used: false }); },
    async consume(h, now) {
      const r = rows.get(h);
      if (!r) return { reason: 'unknown' };
      if (r.used) return { reason: 'used' };
      r.used = true;
      if (r.expiresAt <= now) return { reason: 'expired' };
      return { rec: r };
    },
  };
}

const B = { tenantId: 't1', userId: 'u1', connectorKey: 'quickbooks-online' };
const begin = (store, extra = {}) => beginAuthorization({ store, ...B, authorizeUrl: 'https://auth.example.com/authorize', clientId: 'cid', redirectUri: 'https://portal.example.com/cb', scopes: ['a', 'b'], ...extra });
const tokenResp = { json: { access_token: 'AT', refresh_token: 'RT', expires_in: 3600, token_type: 'bearer' } };

test('PKCE S256 matches RFC 7636 Appendix B', () => {
  assert.equal(codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  assert.notEqual(codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXl'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('PKCE verifier is 43+ unreserved chars and rejects short or illegal verifiers', () => {
  const v = generateCodeVerifier();
  assert.match(v, /^[A-Za-z0-9\-._~]{43,128}$/);
  assert.throws(() => codeChallengeS256('too-short'));
  assert.throws(() => codeChallengeS256('a'.repeat(50) + ' '));
});

test('state is 32 random bytes and only its hash is stored', async () => {
  const s = generateState();
  assert.equal(Buffer.from(s, 'base64url').length, 32);
  assert.notEqual(generateState(), s);
  const store = memStates();
  const { state, url } = await begin(store);
  assert.ok(store.rows.has(hashState(state)));
  assert.ok(![...store.rows.keys()].includes(state), 'raw state must not be a storage key');
  const u = new URL(url);
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('state'), state);
  assert.equal(u.searchParams.get('code_challenge'), codeChallengeS256([...store.rows.values()][0].codeVerifier));
});

test('state is single use: second completion fails with state_used', async () => {
  const store = memStates();
  const { state } = await begin(store);
  const f = fakeFetch([tokenResp, tokenResp]);
  const args = { store, state, code: 'c', ...B, tokenUrl: 'https://auth.example.com/token', clientId: 'cid', clientSecret: 's', fetch: f };
  const ok = await completeAuthorization(args);
  assert.equal(ok.tokens.access_token, 'AT');
  await assert.rejects(() => completeAuthorization(args), (e) => e instanceof OAuthError && e.code === 'state_used');
  assert.equal(f.calls.length, 1, 'no second token request');
});

test('token exchange sends the PKCE verifier and code, form encoded', async () => {
  const store = memStates();
  const { state } = await begin(store);
  const verifier = [...store.rows.values()][0].codeVerifier;
  const f = fakeFetch([tokenResp]);
  await completeAuthorization({ store, state, code: 'CODE1', ...B, tokenUrl: 'https://auth.example.com/token', clientId: 'cid', clientSecret: 's', fetch: f });
  const sent = new URLSearchParams(f.calls[0].init.body);
  assert.equal(sent.get('grant_type'), 'authorization_code');
  assert.equal(sent.get('code'), 'CODE1');
  assert.equal(sent.get('code_verifier'), verifier);
  assert.equal(hdr(f.calls[0], 'content-type'), 'application/x-www-form-urlencoded');
});

test('state expires after the 10 minute TTL', async () => {
  const store = memStates();
  const now = 1_000_000;
  const { state } = await begin(store, { now });
  const args = { store, state, code: 'c', ...B, tokenUrl: 'https://auth.example.com/token', clientId: 'cid', fetch: fakeFetch([tokenResp]) };
  await assert.rejects(() => completeAuthorization({ ...args, now: now + STATE_TTL_MS }), (e) => e.code === 'state_expired');
  const { state: s2 } = await begin(store, { now });
  const ok = await completeAuthorization({ ...args, state: s2, now: now + STATE_TTL_MS - 1 });
  assert.equal(ok.tokens.access_token, 'AT');
});

test('expiry is enforced in code even if the storage layer forgets to check it', async () => {
  const rows = new Map();
  const lax = { put: async (r) => { rows.set(r.stateHash, r); }, consume: async (h) => ({ rec: rows.get(h) }) };
  const now = 5_000_000;
  const { state } = await begin(lax, { now });
  await assert.rejects(
    () => completeAuthorization({ store: lax, state, code: 'c', ...B, tokenUrl: 'https://x/token', clientId: 'c', fetch: fakeFetch([tokenResp]), now: now + STATE_TTL_MS + 1 }),
    (e) => e.code === 'state_expired',
  );
});

test('state is bound to tenant, user and connector, and a wrong attempt burns it', async () => {
  for (const wrong of [{ tenantId: 't2' }, { userId: 'u2' }, { connectorKey: 'xero' }]) {
    const store = memStates();
    const { state } = await begin(store);
    const f = fakeFetch([tokenResp]);
    const args = { store, state, code: 'c', ...B, tokenUrl: 'https://auth.example.com/token', clientId: 'cid', fetch: f };
    await assert.rejects(() => completeAuthorization({ ...args, ...wrong }), (e) => e.code === 'state_binding');
    await assert.rejects(() => completeAuthorization(args), (e) => e.code === 'state_used');
    assert.equal(f.calls.length, 0);
  }
  await assert.rejects(() => completeAuthorization({ store: memStates(), state: 'never-issued', code: 'c', ...B, tokenUrl: 'https://x/token', clientId: 'c', fetch: fakeFetch() }), (e) => e.code === 'state_unknown');
});

function memTokens(initial) {
  let cur = initial;
  const writes = [];
  return {
    get cur() { return cur; },
    writes,
    async get() { return cur; },
    async compareAndSet(expected, next) {
      writes.push({ expected, next: next.refresh_token });
      if (cur.rotated_at !== expected || Date.parse(cur.rotated_at) >= Date.parse(next.rotated_at)) return false;
      cur = next;
      return true;
    },
  };
}
const T0 = { access_token: 'old', refresh_token: 'R1', expires_at: null, token_type: 'Bearer', rotated_at: '2020-01-01T00:00:00.000Z' };

test('refresh rotation persists the NEWEST refresh token with CAS on the one it used', async () => {
  const store = memTokens(T0);
  const f = fakeFetch([{ json: { access_token: 'A2', refresh_token: 'R2', expires_in: 60 } }, { json: { access_token: 'A3', refresh_token: 'R3', expires_in: 60 } }]);
  const base = { store, fetch: f, tokenUrl: 'https://auth.example.com/token', clientId: 'cid', clientSecret: 's' };
  const t2 = await refreshTokens(base);
  assert.equal(t2.refresh_token, 'R2');
  assert.equal(store.cur.refresh_token, 'R2');
  assert.equal(new URLSearchParams(f.calls[0].init.body).get('refresh_token'), 'R1');
  await refreshTokens(base);
  assert.equal(new URLSearchParams(f.calls[1].init.body).get('refresh_token'), 'R2', 'second refresh must use the rotated token');
  assert.equal(store.cur.refresh_token, 'R3');
  assert.deepEqual(store.writes.map((w) => w.expected), [T0.rotated_at, t2.rotated_at]);
});

test('refresh keeps the old refresh token when the vendor does not rotate', async () => {
  const store = memTokens(T0);
  await refreshTokens({ store, fetch: fakeFetch([{ json: { access_token: 'A2', expires_in: 60 } }]), tokenUrl: 'https://x/token', clientId: 'c' });
  assert.equal(store.cur.refresh_token, 'R1');
  assert.equal(store.cur.access_token, 'A2');
});

test('refresh rejects a stale CAS and returns what the winner stored instead of overwriting it', async () => {
  const store = memTokens(T0);
  // Another worker rotates R1 -> RW after we read R1 but before we write.
  const f = fakeFetch([{ json: { access_token: 'AL', refresh_token: 'RL', expires_in: 60 } }]);
  const winner = { access_token: 'AW', refresh_token: 'RW', expires_at: null, token_type: 'Bearer', rotated_at: '2030-01-01T00:00:00.000Z' };
  const origFetch = f;
  const wrapped = async (u, i) => { await store.compareAndSet(T0.rotated_at, winner); return origFetch(u, i); };
  wrapped.calls = f.calls;
  const out = await refreshTokens({ store, fetch: wrapped, tokenUrl: 'https://x/token', clientId: 'c' });
  assert.equal(store.cur.refresh_token, 'RW', 'winner stays; stale CAS must not overwrite');
  assert.equal(out.refresh_token, 'RW');
  assert.equal(store.writes.filter((w) => w.next === 'RL').length, 1, 'our CAS was attempted and refused');
});

test('client credentials grant posts grant_type, scope and basic auth when asked', async () => {
  const f = fakeFetch([{ json: { access_token: 'CC', expires_in: 3600 } }]);
  const t = await clientCredentialsToken({ fetch: f, tokenUrl: 'https://auth.example.com/token', clientId: 'id', clientSecret: 'sec', scope: 'x.default', clientAuth: 'basic' });
  assert.equal(t.access_token, 'CC');
  assert.equal(t.refresh_token, undefined);
  const p = new URLSearchParams(f.calls[0].init.body);
  assert.equal(p.get('grant_type'), 'client_credentials');
  assert.equal(p.get('scope'), 'x.default');
  assert.equal(hdr(f.calls[0], 'authorization'), 'Basic ' + Buffer.from('id:sec').toString('base64'));
  assert.equal(p.get('client_secret'), null, 'basic auth must not also leak the secret in the body');
});
