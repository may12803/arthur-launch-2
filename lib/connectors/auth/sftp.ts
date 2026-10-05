import { createHash, generateKeyPairSync } from 'node:crypto';

export interface SftpCredential {
  username: string;
  chroot: string;
  publicKey: string;
  fingerprint: string;
  keyOrigin: 'customer_supplied' | 'generated';
}

const sshString = (b: Buffer) => Buffer.concat([Buffer.from([(b.length >>> 24) & 255, (b.length >>> 16) & 255, (b.length >>> 8) & 255, b.length & 255]), b]);

function openSshEd25519(rawPublic: Buffer): { publicKey: string; fingerprint: string } {
  const blob = Buffer.concat([sshString(Buffer.from('ssh-ed25519')), sshString(rawPublic)]);
  return {
    publicKey: `ssh-ed25519 ${blob.toString('base64')}`,
    fingerprint: 'SHA256:' + createHash('sha256').update(blob).digest('base64').replace(/=+$/, ''),
  };
}

export function parseOpenSshEd25519(line: string): { publicKey: string; fingerprint: string } {
  const [type, b64] = line.trim().split(/\s+/);
  if (type !== 'ssh-ed25519' || !b64) throw new Error('only ssh-ed25519 public keys are accepted');
  const blob = Buffer.from(b64, 'base64');
  const tlen = blob.readUInt32BE(0);
  if (blob.subarray(4, 4 + tlen).toString() !== 'ssh-ed25519') throw new Error('malformed ssh-ed25519 key blob');
  const klen = blob.readUInt32BE(4 + tlen);
  const raw = blob.subarray(8 + tlen, 8 + tlen + klen);
  if (raw.length !== 32) throw new Error('ed25519 public key must be 32 bytes');
  return openSshEd25519(raw);
}

export const sftpUsername = (tenantId: string) => 'll-' + tenantId.replace(/-/g, '').slice(0, 16).toLowerCase();
export const sftpChroot = (tenantId: string) => `/tenants/${tenantId}/inbox`;

export interface IssueSftpInput {
  tenantId: string;
  /** If the customer supplies a key, no private key ever exists on our side. */
  customerPublicKey?: string;
  /** Receives the generated private key (PKCS8 PEM) exactly once; it is never part of the return value. */
  deliverPrivateKey?: (pem: string) => void;
}

export function issueSftpCredential(i: IssueSftpInput): SftpCredential {
  if (!/^[0-9a-f-]{8,64}$/i.test(i.tenantId)) throw new Error('tenant id must be a uuid-like string');
  const base = { username: sftpUsername(i.tenantId), chroot: sftpChroot(i.tenantId) };
  if (i.customerPublicKey) return { ...base, ...parseOpenSshEd25519(i.customerPublicKey), keyOrigin: 'customer_supplied' };
  if (!i.deliverPrivateKey) throw new Error('deliverPrivateKey is required when we generate the keypair');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
  i.deliverPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  return { ...base, ...openSshEd25519(Buffer.from(jwk.x, 'base64url')), keyOrigin: 'generated' };
}
