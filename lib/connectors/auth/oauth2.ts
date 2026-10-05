import { basicAuth, formBody, requestJson } from '../http.ts';
import { HttpError, type FetchLike } from '../types.ts';
import { codeChallengeS256, generateCodeVerifier, generateState, hashState } from './pkce.ts';

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at: string | null;
  token_type: string;
  scope?: string;
  rotated_at: string;
}

export interface OAuthStateRecord {
  stateHash: string;
  tenantId: string;
  userId: string;
  connectorKey: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
}

export type ConsumeResult = { rec: OAuthStateRecord } | { reason: 'unknown' | 'used' | 'expired' };

/** Storage is injected. consume() must be atomic: it marks the row used and returns it at most once. */
export interface OAuthStateStore {
  put(rec: OAuthStateRecord): Promise<void>;
  consume(stateHash: string, now: number): Promise<ConsumeResult>;
}

export class OAuthError extends Error {
  code: 'state_unknown' | 'state_used' | 'state_expired' | 'state_binding' | 'token_error';
  constructor(code: OAuthError['code'], message: string) {
    super(message);
    this.name = 'OAuthError';
    this.code = code;
  }
}

export const STATE_TTL_MS = 10 * 60 * 1000;

export interface BeginInput {
  store: OAuthStateStore;
  tenantId: string;
  userId: string;
  connectorKey: string;
  authorizeUrl: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  extraParams?: Record<string, string>;
  scopeSeparator?: string;
  now?: number;
  ttlMs?: number;
}

export async function beginAuthorization(i: BeginInput): Promise<{ url: string; state: string }> {
  const now = i.now ?? Date.now();
  const state = generateState();
  const verifier = generateCodeVerifier();
  await i.store.put({
    stateHash: hashState(state),
    tenantId: i.tenantId,
    userId: i.userId,
    connectorKey: i.connectorKey,
    codeVerifier: verifier,
    redirectUri: i.redirectUri,
    createdAt: now,
    expiresAt: now + (i.ttlMs ?? STATE_TTL_MS),
  });
  const u = new URL(i.authorizeUrl);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', i.clientId);
  u.searchParams.set('redirect_uri', i.redirectUri);
  if (i.scopes.length) u.searchParams.set('scope', i.scopes.join(i.scopeSeparator ?? ' '));
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', codeChallengeS256(verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  for (const [k, v] of Object.entries(i.extraParams ?? {})) u.searchParams.set(k, v);
  return { url: u.toString(), state };
}

export interface CompleteInput {
  store: OAuthStateStore;
  state: string;
  code: string;
  tenantId: string;
  userId: string;
  connectorKey: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  clientAuth?: 'body' | 'basic';
  fetch: FetchLike;
  now?: number;
}

/** The state is consumed (burned) on any attempt, including a binding mismatch, so it cannot be probed. */
export async function completeAuthorization(i: CompleteInput): Promise<{ tokens: TokenSet; redirectUri: string }> {
  const now = i.now ?? Date.now();
  const r = await i.store.consume(hashState(i.state), now);
  if ('reason' in r) throw new OAuthError(`state_${r.reason}` as OAuthError['code'], `OAuth state ${r.reason}`);
  const rec = r.rec;
  if (rec.expiresAt <= now) throw new OAuthError('state_expired', 'OAuth state expired');
  if (rec.tenantId !== i.tenantId || rec.userId !== i.userId || rec.connectorKey !== i.connectorKey) {
    throw new OAuthError('state_binding', 'OAuth state is bound to a different tenant, user or connector');
  }
  const tokens = await tokenRequest({
    fetch: i.fetch,
    tokenUrl: i.tokenUrl,
    clientId: i.clientId,
    clientSecret: i.clientSecret,
    clientAuth: i.clientAuth,
    now,
    params: { grant_type: 'authorization_code', code: i.code, redirect_uri: rec.redirectUri, code_verifier: rec.codeVerifier },
  });
  return { tokens, redirectUri: rec.redirectUri };
}

export interface TokenRequestInput {
  fetch: FetchLike;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  clientAuth?: 'body' | 'basic';
  params: Record<string, string | undefined>;
  now?: number;
}

export async function tokenRequest(i: TokenRequestInput): Promise<TokenSet> {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
  const params = { ...i.params };
  if (i.clientAuth === 'basic' && i.clientSecret) headers.authorization = basicAuth(i.clientId, i.clientSecret);
  else {
    params.client_id = i.clientId;
    if (i.clientSecret) params.client_secret = i.clientSecret;
  }
  const now = i.now ?? Date.now();
  let j: any;
  try {
    j = await requestJson<any>(i.fetch, i.tokenUrl, { method: 'POST', headers, body: formBody(params) });
  } catch (error) {
    if (error instanceof HttpError) {
      try {
        if (JSON.parse(error.body).error === 'invalid_grant') throw new OAuthError('token_error', 'invalid_grant');
      } catch (parsed) {
        if (parsed instanceof OAuthError) throw parsed;
      }
    }
    throw error;
  }
  if (!j.access_token) throw new OAuthError('token_error', 'token response had no access_token');
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_in ? new Date(now + Number(j.expires_in) * 1000).toISOString() : null,
    token_type: j.token_type ?? 'Bearer',
    scope: j.scope,
    rotated_at: new Date(now).toISOString(),
  };
}

export interface TokenStore {
  get(): Promise<TokenSet>;
  /** Atomically replace the set only if the stored rotated_at is older than the new value. */
  compareAndSet(expectedRotatedAt: string, next: TokenSet): Promise<boolean>;
}

export interface RefreshInput {
  store: TokenStore;
  fetch: FetchLike;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  clientAuth?: 'body' | 'basic';
  now?: number;
}

/**
 * Refresh with rotation. The newest refresh token is always persisted (some vendors invalidate the old one
 * on first use). If the vendor returns no new refresh token the previous one is kept. If the CAS fails,
 * another worker rotated first; we return what is stored instead of overwriting it with a stale chain.
 */
export async function refreshTokens(i: RefreshInput): Promise<TokenSet> {
  const current = await i.store.get();
  if (!current.refresh_token) throw new OAuthError('token_error', 'no refresh token stored');
  const fresh = await tokenRequest({
    fetch: i.fetch,
    tokenUrl: i.tokenUrl,
    clientId: i.clientId,
    clientSecret: i.clientSecret,
    clientAuth: i.clientAuth,
    now: Math.max(i.now ?? Date.now(), Date.parse(current.rotated_at) + 1 || 0),
    params: { grant_type: 'refresh_token', refresh_token: current.refresh_token },
  });
  const next: TokenSet = { ...fresh, refresh_token: fresh.refresh_token ?? current.refresh_token };
  const ok = await i.store.compareAndSet(current.rotated_at, next);
  return ok ? next : i.store.get();
}

export function needsRefresh(t: TokenSet, now = Date.now(), skewMs = 60_000): boolean {
  return !!t.expires_at && Date.parse(t.expires_at) - skewMs <= now;
}
