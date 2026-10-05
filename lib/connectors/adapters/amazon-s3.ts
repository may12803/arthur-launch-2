import { amzDateOf, assumeRole, signV4 } from '../auth/aws.ts';
import { HttpError } from '../types.ts';
import type { Adapter, Creds, FetchLike, PulledRecord } from '../types.ts';
import { advance, decodeCursor, need } from './common.ts';
import { parseRetryAfter } from '../http.ts';

// Customer grants a cross-account read role; we call sts:AssumeRole with a per-customer ExternalId and never hold
// customer keys. creds carries OUR platform AWS identity (aws_access_key_id / aws_secret_access_key) plus the
// customer's role_arn, external_id, bucket, region, prefix. Incremental = ListObjectsV2 with StartAfter on the last key
// (vendor JSON also lists S3 Event Notifications and S3 Inventory, both UNVERIFIED). StartAfter assumes new keys sort
// after old ones (date-prefixed layouts); re-uploads under a lower key are not seen until a full pass.
const PAGE = 1000;
const BUCKET_RE = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

function target(creds: Creds): { origin: string; pathPrefix: string; region: string } {
  need(creds, 'bucket', 'region', 'role_arn', 'external_id', 'aws_access_key_id', 'aws_secret_access_key');
  if (!BUCKET_RE.test(creds.bucket) || !REGION_RE.test(creds.region)) throw new Error('invalid bucket or region');
  return creds.bucket.includes('.')
    ? { origin: `https://s3.${creds.region}.amazonaws.com`, pathPrefix: `/${creds.bucket}`, region: creds.region }
    : { origin: `https://${creds.bucket}.s3.${creds.region}.amazonaws.com`, pathPrefix: '', region: creds.region };
}

async function list(creds: Creds, fetch: FetchLike, params: Record<string, string>): Promise<string> {
  const t = target(creds);
  const role = await assumeRole({ fetch, platform: { accessKeyId: creds.aws_access_key_id, secretAccessKey: creds.aws_secret_access_key, sessionToken: creds.aws_session_token }, roleArn: creds.role_arn, externalId: creds.external_id, region: t.region });
  const query = Object.entries({ 'list-type': '2', ...params }).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&');
  const url = `${t.origin}${t.pathPrefix}/?${query}`;
  const signed = signV4({ method: 'GET', url, headers: {}, region: t.region, service: 's3', creds: role, amzDate: amzDateOf(Date.now()), includeContentSha256: true });
  const res = await fetch(url, { method: 'GET', headers: signed.headers });
  const xml = await res.text();
  if (!res.ok) throw new HttpError(res.status, `S3 ListObjectsV2 failed (${xml.match(/<Code>([^<]*)<\/Code>/)?.[1] ?? res.status})`, parseRetryAfter(res.headers.get('retry-after')), xml.slice(0, 300));
  return xml;
}

const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const tag = (x: string, n: string) => x.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`))?.[1];

export const amazonS3: Adapter = {
  key: 'amazon-s3',
  objects: ['objects'],
  async validate(creds, fetch) {
    await list(creds, fetch, { 'max-keys': '1', ...(creds.prefix ? { prefix: creds.prefix } : {}) });
    return { ok: true, detail: 'role assumed and bucket listable', account: creds.bucket };
  },
  async pull(_object, cursor, creds, fetch) {
    const state = decodeCursor(cursor);
    const after = state.pg ?? state.hw;
    const xml = await list(creds, fetch, { 'max-keys': String(PAGE), ...(creds.prefix ? { prefix: creds.prefix } : {}), ...(after ? { 'start-after': after } : {}) });
    const records: PulledRecord[] = [];
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = unxml(tag(m[1], 'Key') ?? '');
      const lm = tag(m[1], 'LastModified');
      records.push({ source_ref: `${creds.bucket}/${key}`, payload: { bucket: creds.bucket, key, size: Number(tag(m[1], 'Size') ?? 0), etag: unxml(tag(m[1], 'ETag') ?? '').replace(/"/g, ''), last_modified: lm }, observed_at: lm });
    }
    const last = records.length ? (records[records.length - 1].payload.key as string) : undefined;
    const truncated = tag(xml, 'IsTruncated') === 'true' && last !== undefined;
    return advance(state, records, last ?? state.hw, truncated ? last : undefined);
  },
};
