import { createHash, createHmac } from 'node:crypto';
import { HttpError } from '../types.ts';
import type { FetchLike } from '../types.ts';

const sha256hex = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');
const hmac = (key: string | Buffer, s: string) => createHmac('sha256', key).update(s).digest();

const uriEncode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

export interface AwsCreds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface SigV4Input {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  region: string;
  service: string;
  creds: AwsCreds;
  amzDate: string; // 20150830T123600Z
  /** S3 requires the x-amz-content-sha256 header */
  includeContentSha256?: boolean;
}

export function signV4(i: SigV4Input): { headers: Record<string, string>; signature: string; canonicalRequest: string; stringToSign: string } {
  const u = new URL(i.url);
  const date = i.amzDate.slice(0, 8);
  const payloadHash = sha256hex(i.body ?? '');
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(i.headers)) h[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  h.host = h.host ?? u.host;
  h['x-amz-date'] = i.amzDate;
  if (i.creds.sessionToken) h['x-amz-security-token'] = i.creds.sessionToken;
  if (i.includeContentSha256) h['x-amz-content-sha256'] = payloadHash;
  const names = Object.keys(h).sort();
  const canonicalHeaders = names.map((n) => `${n}:${h[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const query: [string, string][] = [];
  u.searchParams.forEach((v, k) => query.push([uriEncode(k), uriEncode(v)]));
  query.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  const canonicalQuery = query.map(([k, v]) => `${k}=${v}`).join('&');
  // Path segments are encoded once more for every service except S3 (single encoding).
  const rawPath = u.pathname || '/';
  const canonicalPath = i.service === 's3' ? rawPath.split('/').map((s) => uriEncode(decodeURIComponent(s))).join('/') : rawPath.split('/').map((s) => uriEncode(uriEncode(decodeURIComponent(s)))).join('/');
  const canonicalRequest = [i.method.toUpperCase(), canonicalPath, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${date}/${i.region}/${i.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', i.amzDate, scope, sha256hex(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + i.creds.secretAccessKey, date), i.region), i.service), 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  h.authorization = `AWS4-HMAC-SHA256 Credential=${i.creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { headers: h, signature, canonicalRequest, stringToSign };
}

export const amzDateOf = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export interface AssumeRoleInput {
  fetch: FetchLike;
  platform: AwsCreds;
  roleArn: string;
  externalId: string;
  sessionName?: string;
  region?: string;
  durationSeconds?: number;
  now?: number;
}

export interface AssumedRole extends AwsCreds {
  sessionToken: string;
  expiration: string;
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];

/** Cross-account read role: we call sts:AssumeRole with the per-customer ExternalId and never hold customer keys. */
export async function assumeRole(i: AssumeRoleInput): Promise<AssumedRole> {
  const region = i.region ?? 'us-east-1';
  const host = region === 'us-east-1' ? 'sts.amazonaws.com' : `sts.${region}.amazonaws.com`;
  const params = new URLSearchParams({
    Action: 'AssumeRole',
    Version: '2011-06-15',
    RoleArn: i.roleArn,
    RoleSessionName: i.sessionName ?? 'loveleeday-connector',
    ExternalId: i.externalId,
    DurationSeconds: String(i.durationSeconds ?? 3600),
  });
  const body = params.toString();
  const url = `https://${host}/`;
  const signed = signV4({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded; charset=utf-8', host },
    body,
    region,
    service: 'sts',
    creds: i.platform,
    amzDate: amzDateOf(i.now ?? Date.now()),
  });
  const res = await i.fetch(url, { method: 'POST', headers: signed.headers, body });
  const xml = await res.text();
  if (!res.ok) throw new HttpError(res.status, `STS AssumeRole failed (${tag(xml, 'Code') ?? res.status})`, null, xml.slice(0, 300));
  const accessKeyId = tag(xml, 'AccessKeyId');
  const secretAccessKey = tag(xml, 'SecretAccessKey');
  const sessionToken = tag(xml, 'SessionToken');
  const expiration = tag(xml, 'Expiration');
  if (!accessKeyId || !secretAccessKey || !sessionToken || !expiration) throw new HttpError(res.status, 'STS response missing credentials', null, '');
  return { accessKeyId, secretAccessKey, sessionToken, expiration };
}
