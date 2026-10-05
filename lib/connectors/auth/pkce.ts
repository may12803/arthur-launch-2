import { createHash, randomBytes } from 'node:crypto';

// RFC 7636: verifier = 43..128 chars of unreserved characters; challenge = BASE64URL(SHA256(verifier)).
export function generateCodeVerifier(bytes = 32): string {
  if (bytes < 32 || bytes > 96) throw new Error('verifier entropy must be 32..96 bytes');
  return randomBytes(bytes).toString('base64url');
}

export function codeChallengeS256(verifier: string): string {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) throw new Error('invalid code_verifier (RFC 7636 section 4.1)');
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

export function generateState(): string {
  return randomBytes(32).toString('base64url');
}

export function hashState(state: string): string {
  return createHash('sha256').update(state, 'utf8').digest('hex');
}
