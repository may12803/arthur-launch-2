import { createHmac, randomBytes } from 'node:crypto';

// OAuth 1.0a request signing. NetSuite token-based auth (TBA) uses HMAC-SHA256 with an account realm.
// HMAC-SHA1 is supported only so the signer can be checked against the published OAuth Core 1.0 vector.

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export interface OAuth1Input {
  method: string;
  url: string;
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
  realm?: string;
  signatureMethod?: 'HMAC-SHA256' | 'HMAC-SHA1';
  /** form-encoded body params that take part in the signature (application/x-www-form-urlencoded only) */
  bodyParams?: Record<string, string>;
  nonce?: string;
  timestamp?: number;
}

export function oauth1BaseString(method: string, url: string, params: [string, string][]): string {
  const u = new URL(url);
  const base = `${u.protocol}//${u.host.toLowerCase()}${u.pathname}`.replace(/:(80|443)(?=\/|$)/, '');
  const all: [string, string][] = [...params];
  u.searchParams.forEach((v, k) => all.push([k, v]));
  const norm = all
    .map(([k, v]) => [enc(k), enc(v)] as [string, string])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  return [method.toUpperCase(), enc(base), enc(norm)].join('&');
}

export function signOAuth1(i: OAuth1Input): { header: string; signature: string; baseString: string } {
  const method = i.signatureMethod ?? 'HMAC-SHA256';
  const oauth: Record<string, string> = {
    oauth_consumer_key: i.consumerKey,
    oauth_token: i.token,
    oauth_signature_method: method,
    oauth_timestamp: String(i.timestamp ?? Math.floor(Date.now() / 1000)),
    oauth_nonce: i.nonce ?? randomBytes(16).toString('hex'),
    oauth_version: '1.0',
  };
  const params: [string, string][] = Object.entries(oauth);
  for (const [k, v] of Object.entries(i.bodyParams ?? {})) params.push([k, v]);
  const baseString = oauth1BaseString(i.method, i.url, params);
  const key = `${enc(i.consumerSecret)}&${enc(i.tokenSecret)}`;
  const signature = createHmac(method === 'HMAC-SHA1' ? 'sha1' : 'sha256', key).update(baseString).digest('base64');
  // The realm is carried in the header but is not part of the signature base string.
  const fields: [string, string][] = [...(i.realm ? ([['realm', i.realm]] as [string, string][]) : []), ...Object.entries(oauth), ['oauth_signature', signature]];
  const header = 'OAuth ' + fields.map(([k, v]) => `${k}="${k === 'realm' ? v : enc(v)}"`).join(', ');
  return { header, signature, baseString };
}
