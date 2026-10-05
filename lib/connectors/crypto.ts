import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Envelope: v1.<keyId>.<iv b64url>.<tag b64url>.<ciphertext b64url>
// AES-256-GCM, random 12-byte IV per message, keyId + version bound in as AAD so a ciphertext cannot be
// re-labelled to another key id or format version without failing authentication.
const VERSION = 'v1';

export interface Keyring {
  primary: string;
  keys: Record<string, Buffer>;
}

export class CryptoError extends Error {
  code: 'bad_format' | 'unknown_key' | 'auth_failed' | 'bad_key';
  constructor(code: CryptoError['code'], message: string) {
    super(message);
    this.name = 'CryptoError';
    this.code = code;
  }
}

const b64u = (b: Buffer) => b.toString('base64url');

function aad(keyId: string, context?: string): Buffer {
  return Buffer.from(`${VERSION}|${keyId}|${context ?? ''}`, 'utf8');
}

export function createCrypto(ring: Keyring) {
  for (const [id, k] of Object.entries(ring.keys)) {
    if (k.length !== 32) throw new CryptoError('bad_key', `key ${id} must be 32 bytes`);
    if (id.includes('.')) throw new CryptoError('bad_key', 'key id must not contain a dot');
  }
  if (!ring.keys[ring.primary]) throw new CryptoError('unknown_key', `primary key ${ring.primary} not in keyring`);

  return {
    encrypt(plaintext: string | Buffer, context?: string): string {
      const iv = randomBytes(12);
      const c = createCipheriv('aes-256-gcm', ring.keys[ring.primary], iv);
      c.setAAD(aad(ring.primary, context));
      const ct = Buffer.concat([c.update(typeof plaintext === 'string' ? Buffer.from(plaintext, 'utf8') : plaintext), c.final()]);
      return [VERSION, ring.primary, b64u(iv), b64u(c.getAuthTag()), b64u(ct)].join('.');
    },
    decrypt(envelope: string, context?: string): string {
      const parts = envelope.split('.');
      if (parts.length !== 5 || parts[0] !== VERSION) throw new CryptoError('bad_format', 'unsupported envelope');
      const [, keyId, ivS, tagS, ctS] = parts;
      const key = ring.keys[keyId];
      if (!key) throw new CryptoError('unknown_key', `unknown key id ${keyId}`);
      const iv = Buffer.from(ivS, 'base64url');
      const tag = Buffer.from(tagS, 'base64url');
      if (iv.length !== 12 || tag.length !== 16) throw new CryptoError('bad_format', 'bad iv or tag length');
      try {
        const d = createDecipheriv('aes-256-gcm', key, iv);
        d.setAAD(aad(keyId, context));
        d.setAuthTag(tag);
        return Buffer.concat([d.update(Buffer.from(ctS, 'base64url')), d.final()]).toString('utf8');
      } catch {
        throw new CryptoError('auth_failed', 'ciphertext failed authentication');
      }
    },
  };
}

/**
 * Key material comes from the environment, never from code:
 *   LOVELEEDAY_CONNECTORS_KEYS = "k1:<base64 32 bytes>,k2:<base64 32 bytes>"
 *   LOVELEEDAY_CONNECTORS_PRIMARY_KEY_ID = "k2"   (defaults to the last key listed)
 */
export function keyringFromEnv(env: Record<string, string | undefined> = process.env): Keyring {
  const raw = env.LOVELEEDAY_CONNECTORS_KEYS;
  if (!raw) throw new CryptoError('bad_key', 'LOVELEEDAY_CONNECTORS_KEYS is not set');
  const keys: Record<string, Buffer> = {};
  let last = '';
  for (const part of raw.split(',')) {
    const i = part.indexOf(':');
    if (i < 1) throw new CryptoError('bad_key', 'LOVELEEDAY_CONNECTORS_KEYS entries must be id:base64');
    const id = part.slice(0, i).trim();
    keys[id] = Buffer.from(part.slice(i + 1).trim(), 'base64');
    last = id;
  }
  return { primary: env.LOVELEEDAY_CONNECTORS_PRIMARY_KEY_ID || last, keys };
}

export function cryptoFromEnv(env: Record<string, string | undefined> = process.env) {
  return createCrypto(keyringFromEnv(env));
}
