#!/usr/bin/env node
/**
 * sign-verify.smoke.js — smoke test for Telnyx signature verification.
 * Uses Node crypto to generate a real Ed25519 keypair, signs a test payload,
 * and verifies that the verifier accepts valid + rejects invalid/missing.
 *
 * Run: node lib/telnyx/__tests__/sign-verify.smoke.js
 */

'use strict';

const { generateKeyPairSync, sign: cryptoSign, verify: cryptoVerify } = require('crypto');

// Generate a test Ed25519 keypair
const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding:  { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// Extract the base64 public key body for the env var format
const pubKeyBase64 = publicKey
  .replace(/-----BEGIN PUBLIC KEY-----/, '')
  .replace(/-----END PUBLIC KEY-----/, '')
  .replace(/\n/g, '')
  .trim();

// Set env so verifyTelnyxSignature picks it up
process.env.TELNYX_PUBLIC_KEY = pubKeyBase64;

function verifyTelnyxSignature(rawBody, signature, timestamp) {
  const pubKey = process.env.TELNYX_PUBLIC_KEY;
  if (!pubKey) { console.warn('no key'); return false; }
  if (!signature || !timestamp) return false;

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;

  try {
    const signedPayload = Buffer.from(`${timestamp}|${rawBody}`, 'utf8');
    const sigBuffer     = Buffer.from(signature, 'base64');
    const pemKey = pubKey.includes('BEGIN')
      ? pubKey
      : `-----BEGIN PUBLIC KEY-----\n${pubKey.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
    return cryptoVerify(null, signedPayload, pemKey, sigBuffer);
  } catch (err) {
    console.error('verify error:', err);
    return false;
  }
}

function sign(rawBody, timestamp) {
  const payload = Buffer.from(`${timestamp}|${rawBody}`, 'utf8');
  // Ed25519 in Node v15+ uses crypto.sign(null, ...) — pure EdDSA, no digest
  return cryptoSign(null, payload, privateKey).toString('base64');
}

let passed = 0;
let failed = 0;

function assert(label, result, expected) {
  if (result === expected) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label} — got ${result}, expected ${expected}`);
    failed++;
  }
}

const body      = JSON.stringify({ data: { event_type: 'message.received', payload: { text: 'hello' } } });
const timestamp = String(Math.floor(Date.now() / 1000));
const validSig  = sign(body, timestamp);

console.log('\ntelnyx sign-verify smoke tests\n');

// 1. Valid signature
assert('accepts valid signature',   verifyTelnyxSignature(body, validSig, timestamp), true);

// 2. Bad signature (corrupted)
assert('rejects corrupted signature', verifyTelnyxSignature(body, 'AAAA' + validSig.slice(4), timestamp), false);

// 3. Missing signature
assert('rejects null signature',   verifyTelnyxSignature(body, null, timestamp), false);

// 4. Missing timestamp
assert('rejects null timestamp',   verifyTelnyxSignature(body, validSig, null), false);

// 5. Stale timestamp (> 5 min old)
const staleTs = String(Math.floor(Date.now() / 1000) - 400);
assert('rejects stale timestamp',  verifyTelnyxSignature(body, sign(body, staleTs), staleTs), false);

// 6. Missing public key
process.env.TELNYX_PUBLIC_KEY = '';
assert('rejects when key missing', verifyTelnyxSignature(body, validSig, timestamp), false);
process.env.TELNYX_PUBLIC_KEY = pubKeyBase64;

// 7. Body tampered after signing
assert('rejects tampered body',    verifyTelnyxSignature(body + ' ', validSig, timestamp), false);

console.log(`\n${passed} passed · ${failed} failed\n`);
if (failed > 0) process.exit(1);
