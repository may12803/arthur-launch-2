import { createHash, createPublicKey, createSign, randomBytes } from 'node:crypto';
import { formBody, requestJson } from '../http.ts';
import type { FetchLike } from '../types.ts';

const b64u = (v: string | Buffer) => Buffer.from(v).toString('base64url');

export function signJwtRS256(claims: Record<string, unknown>, privateKeyPem: string, header: Record<string, unknown> = {}): string {
  const h = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT', ...header }));
  const p = b64u(JSON.stringify(claims));
  const sig = createSign('RSA-SHA256').update(`${h}.${p}`).sign(privateKeyPem);
  return `${h}.${p}.${b64u(sig)}`;
}

export interface GoogleAssertionInput {
  clientEmail: string;
  privateKey: string;
  privateKeyId?: string;
  scope: string;
  subject?: string;
  tokenUri?: string;
  now?: number;
  ttlSeconds?: number;
}

/** Google service account JWT bearer assertion (RFC 7523 profile): iss, scope, aud, iat, exp <= 1h, optional sub for delegation. */
export function googleServiceAccountAssertion(i: GoogleAssertionInput): string {
  const iat = Math.floor((i.now ?? Date.now()) / 1000);
  const ttl = Math.min(i.ttlSeconds ?? 3600, 3600);
  const claims: Record<string, unknown> = {
    iss: i.clientEmail,
    scope: i.scope,
    aud: i.tokenUri ?? 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + ttl,
  };
  if (i.subject) claims.sub = i.subject;
  return signJwtRS256(claims, i.privateKey, i.privateKeyId ? { kid: i.privateKeyId } : {});
}

export interface BoxAssertionInput {
  clientId: string;
  /** enterprise id (box_sub_type enterprise) or user id (box_sub_type user) */
  subject: string;
  subType: 'enterprise' | 'user';
  privateKey: string;
  publicKeyId: string;
  now?: number;
  ttlSeconds?: number;
}

/** Box JWT app assertion: iss = client id, sub = enterprise/user id, box_sub_type, aud, unique jti, exp <= 60s. */
export function boxAssertion(i: BoxAssertionInput): string {
  const iat = Math.floor((i.now ?? Date.now()) / 1000);
  const claims = {
    iss: i.clientId,
    sub: i.subject,
    box_sub_type: i.subType,
    aud: 'https://api.box.com/oauth2/token',
    jti: randomBytes(16).toString('hex'),
    exp: iat + Math.min(i.ttlSeconds ?? 45, 60),
  };
  return signJwtRS256(claims, i.privateKey, { kid: i.publicKeyId });
}

export interface JwtBearerInput {
  fetch: FetchLike;
  tokenUrl: string;
  assertion: string;
  /** Google: grant_type jwt-bearer. Box: same grant plus client_id and client_secret. */
  extra?: Record<string, string>;
}

export async function exchangeJwtBearer(i: JwtBearerInput): Promise<{ access_token: string; expires_in?: number; token_type?: string }> {
  return requestJson(i.fetch, i.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: i.assertion, ...i.extra }),
  });
}

/** SHA256 fingerprint of the public key DER (SPKI), as Snowflake reports it: "SHA256:<base64>". */
export function publicKeyFingerprint(privateKeyPem: string): string {
  const der = createPublicKey(privateKeyPem).export({ type: 'spki', format: 'der' });
  return 'SHA256:' + createHash('sha256').update(der).digest('base64');
}

export interface SnowflakeJwtInput {
  account: string;
  user: string;
  privateKey: string;
  now?: number;
  ttlSeconds?: number;
}

/**
 * Snowflake key-pair JWT. Qualified name = ACCOUNT.USER, uppercased, account identifier without any
 * region/cloud suffix (everything after the first dot). iss = ACCOUNT.USER.SHA256:<fingerprint>.
 */
export function snowflakeJwt(i: SnowflakeJwtInput): string {
  const account = i.account.split('.')[0].toUpperCase();
  const qualified = `${account}.${i.user.toUpperCase()}`;
  const iat = Math.floor((i.now ?? Date.now()) / 1000);
  return signJwtRS256({ iss: `${qualified}.${publicKeyFingerprint(i.privateKey)}`, sub: qualified, iat, exp: iat + Math.min(i.ttlSeconds ?? 3540, 3600) }, i.privateKey);
}
