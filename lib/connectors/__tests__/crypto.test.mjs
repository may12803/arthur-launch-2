import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createCrypto, keyringFromEnv, cryptoFromEnv, CryptoError } from '../crypto.ts';

const k1 = randomBytes(32);
const k2 = randomBytes(32);
const c = createCrypto({ primary: 'k1', keys: { k1, k2 } });

test('round trip returns the plaintext and the envelope is versioned with the key id', () => {
  const env = c.encrypt('refresh-token-value');
  assert.match(env, /^v1\.k1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(c.decrypt(env), 'refresh-token-value');
  assert.ok(!env.includes('refresh-token-value'));
});

test('IV is random per message (same plaintext, different envelope, 12 byte IV, 16 byte tag)', () => {
  const a = c.encrypt('same');
  const b = c.encrypt('same');
  assert.notEqual(a, b);
  const [, , iv, tag] = a.split('.');
  assert.equal(Buffer.from(iv, 'base64url').length, 12);
  assert.equal(Buffer.from(tag, 'base64url').length, 16);
});

test('tampering with ciphertext, tag, iv, key id, or version is rejected', () => {
  const parts = c.encrypt('secret payload').split('.');
  const flip = (i) => {
    const p = [...parts];
    const b = Buffer.from(p[i], 'base64url');
    b[0] ^= 1;
    p[i] = b.toString('base64url');
    return p.join('.');
  };
  for (const i of [2, 3, 4]) assert.throws(() => c.decrypt(flip(i)), (e) => e instanceof CryptoError && e.code === 'auth_failed');
  const relabel = [...parts];
  relabel[1] = 'k2';
  assert.throws(() => c.decrypt(relabel.join('.')), (e) => e.code === 'auth_failed', 'a different key must not decrypt');
  assert.throws(() => c.decrypt(['v2', ...parts.slice(1)].join('.')), (e) => e.code === 'bad_format');
  assert.throws(() => c.decrypt(parts.slice(0, 4).join('.')), (e) => e.code === 'bad_format');
  assert.throws(() => c.decrypt([parts[0], 'k9', ...parts.slice(2)].join('.')), (e) => e.code === 'unknown_key');
});

test('context binding: ciphertext for one row does not decrypt as another', () => {
  const env = c.encrypt('tok', 'connection:A');
  assert.equal(c.decrypt(env, 'connection:A'), 'tok');
  assert.throws(() => c.decrypt(env, 'connection:B'), (e) => e.code === 'auth_failed');
});

test('key rotation: old envelopes still decrypt after a new primary is added', () => {
  const old = c.encrypt('legacy');
  const rotated = createCrypto({ primary: 'k2', keys: { k1, k2 } });
  assert.equal(rotated.decrypt(old), 'legacy');
  assert.match(rotated.encrypt('new'), /^v1\.k2\./);
});

test('bad key sizes are refused at construction', () => {
  assert.throws(() => createCrypto({ primary: 'k', keys: { k: randomBytes(16) } }), (e) => e.code === 'bad_key');
  assert.throws(() => createCrypto({ primary: 'zz', keys: { k1 } }), (e) => e.code === 'unknown_key');
});

test('key material is read from the environment', () => {
  const env = { LOVELEEDAY_CONNECTORS_KEYS: `a:${k1.toString('base64')},b:${k2.toString('base64')}` };
  assert.equal(keyringFromEnv(env).primary, 'b');
  assert.equal(keyringFromEnv({ ...env, LOVELEEDAY_CONNECTORS_PRIMARY_KEY_ID: 'a' }).primary, 'a');
  assert.equal(cryptoFromEnv(env).decrypt(cryptoFromEnv(env).encrypt('x')), 'x');
  assert.throws(() => keyringFromEnv({}), (e) => e.code === 'bad_key');
});
