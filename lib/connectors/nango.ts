import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { FetchLike, ViaNangoEntry } from './types.ts';

export const NANGO_API = 'https://api.nango.dev';

/** system_key -> Nango integration. Add a row here to route a catalog system through Nango; nothing else changes. */
export const NANGO_ROUTES: Record<string, ViaNangoEntry> = {};

export function viaNango(system_key: string, nango_integration_id: string): ViaNangoEntry {
  return { kind: 'via_nango', system_key, nango_integration_id };
}

export function resolveNangoRoute(system_key: string, routes: Record<string, ViaNangoEntry> = NANGO_ROUTES): ViaNangoEntry | null {
  return routes[system_key] ?? null;
}

export class NangoError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'NangoError';
    this.status = status;
  }
}

/** Prod: NANGO_SECRET_KEY env var. Dev only: the local vault file. The value is returned, never logged. */
export function nangoSecretKey(env: Record<string, string | undefined> = process.env, vaultFile = path.join(homedir(), '.arthur/vault/connectors/nango.env')): string {
  if (env.NANGO_SECRET_KEY) return env.NANGO_SECRET_KEY;
  if (env.NODE_ENV !== 'production' && existsSync(vaultFile)) {
    for (const line of readFileSync(vaultFile, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?NANGO_SECRET_KEY\s*=\s*(.*?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  throw new NangoError('NANGO_SECRET_KEY is not configured', 500);
}

export interface ConnectSession {
  token: string;
  expires_at: string;
}

export interface ConnectSessionInput {
  /** The portal tenant; becomes the Nango end user id so one tenant maps to one Nango end user. */
  tenantId: string;
  userEmail?: string;
  displayName?: string;
  /** Catalog system keys; resolved to Nango integration ids through NANGO_ROUTES. */
  systemKeys: string[];
}

async function nangoJson(fetch: FetchLike, secret: string, pathname: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const r = await fetch(`${NANGO_API}${pathname}`, {
    ...init,
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json', accept: 'application/json', ...(init.headers as Record<string, string> | undefined) },
  });
  let body: Record<string, unknown> = {};
  try { body = (await r.json()) as Record<string, unknown>; } catch { /* non-JSON proves nothing */ }
  // Vendor error text is not echoed into the message: it can include what we sent.
  if (!r.ok) throw new NangoError(`Nango request failed (HTTP ${r.status})`, r.status);
  return body;
}

export async function createConnectSession(
  input: ConnectSessionInput,
  fetch: FetchLike = globalThis.fetch,
  secret: string = nangoSecretKey(),
  routes: Record<string, ViaNangoEntry> = NANGO_ROUTES,
): Promise<ConnectSession> {
  const allowed = input.systemKeys.map((k) => {
    const route = resolveNangoRoute(k, routes);
    if (!route) throw new NangoError(`system ${k} has no via_nango route`, 400);
    return route.nango_integration_id;
  });
  const body = await nangoJson(fetch, secret, '/connect/sessions', {
    method: 'POST',
    body: JSON.stringify({
      end_user: { id: input.tenantId, ...(input.userEmail ? { email: input.userEmail } : {}), ...(input.displayName ? { display_name: input.displayName } : {}) },
      allowed_integrations: allowed,
    }),
  });
  const data = body.data as { token?: unknown; expires_at?: unknown } | undefined;
  if (typeof data?.token !== 'string' || typeof data?.expires_at !== 'string') throw new NangoError('Nango returned no connect session token', 502);
  return { token: data.token, expires_at: data.expires_at };
}

export interface NangoAccessToken {
  access_token: string;
  expires_at: string | null;
}

/** Fetches a connection's current access token (Nango refreshes it server-side). connectionId = tenant_connections.external_account_id. */
export async function getConnectionAccessToken(
  connectionId: string,
  integrationId: string,
  fetch: FetchLike = globalThis.fetch,
  secret: string = nangoSecretKey(),
): Promise<NangoAccessToken> {
  const q = new URLSearchParams({ provider_config_key: integrationId });
  const body = await nangoJson(fetch, secret, `/connection/${encodeURIComponent(connectionId)}?${q}`);
  const creds = body.credentials as { access_token?: unknown; expires_at?: unknown } | undefined;
  if (typeof creds?.access_token !== 'string') throw new NangoError('connection has no access token (not OAuth2, or not authorized)', 404);
  return { access_token: creds.access_token, expires_at: typeof creds.expires_at === 'string' ? creds.expires_at : null };
}

export interface NangoIntegration {
  unique_key: string;
  provider: string;
}

export async function listNangoIntegrations(fetch: FetchLike = globalThis.fetch, secret: string = nangoSecretKey()): Promise<NangoIntegration[]> {
  const body = await nangoJson(fetch, secret, '/integrations');
  const rows = Array.isArray(body.data) ? (body.data as Array<Record<string, unknown>>) : [];
  return rows.filter((r) => typeof r.unique_key === 'string').map((r) => ({ unique_key: String(r.unique_key), provider: String(r.provider ?? '') }));
}
