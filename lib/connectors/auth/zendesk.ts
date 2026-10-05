// Zendesk OAuth is per customer account: every URL lives on the customer's own subdomain, so the subdomain is collected
// at connect time, validated here, stored on the connection (tenant_connections.config.subdomain) and used for the
// authorize URL, the token exchange and every API call.
export const ZENDESK_SUBDOMAIN_RE = /^[a-z0-9-]+$/;

/** Returns the normalised subdomain, or null when it is not a plain Zendesk subdomain label. */
export function parseZendeskSubdomain(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let s = input.trim().toLowerCase();
  s = s.replace(/^https:\/\//, '').replace(/\.zendesk\.com\/?$/, '');
  if (s.length < 1 || s.length > 63 || !ZENDESK_SUBDOMAIN_RE.test(s)) return null;
  return s;
}

export function zendeskUrls(subdomain: string) {
  const host = `https://${subdomain}.zendesk.com`;
  return { authorizeUrl: `${host}/oauth/authorizations/new`, tokenUrl: `${host}/oauth/tokens`, apiBase: `${host}/api/v2` };
}

export interface ZendeskEndpoints {
  authorizeUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

/** Client id, secret and scopes come from CONNECTOR_OAUTH_ZENDESK_*; the URLs come from the subdomain. Null when unconfigured or invalid. */
export function zendeskEndpoints(subdomain: unknown, env: Record<string, string | undefined> = process.env): ZendeskEndpoints | null {
  const sub = parseZendeskSubdomain(subdomain);
  const clientId = env.CONNECTOR_OAUTH_ZENDESK_CLIENT_ID, clientSecret = env.CONNECTOR_OAUTH_ZENDESK_CLIENT_SECRET;
  if (!sub || !clientId || !clientSecret) return null;
  const { authorizeUrl, tokenUrl } = zendeskUrls(sub);
  const scopes = (env.CONNECTOR_OAUTH_ZENDESK_SCOPES || 'read').split(/[ ,]+/).filter(Boolean);
  return { authorizeUrl, tokenUrl, clientId, clientSecret, scopes };
}
