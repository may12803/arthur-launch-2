// Persistence for anonymous snapshot runs. Production = Supabase (service role, REST + Storage) on the LOVELEEDAY
// project; the table has RLS on and no anon policy, so only this server can touch it. Tests and local dev without
// a service key use the in-memory store (refused in production).
import { randomBytes } from 'node:crypto';

export interface RunRow {
  id: string;
  status: 'mapping' | 'done' | 'failed';
  created_at: string;
  expires_at: string;
  source: 'upload' | 'sample';
  filename: string | null;
  file_bytes: number | null;
  file_sha256: string | null;
  storage_path: string | null;
  header: string[] | null;
  rows_total: number | null;
  mapping: unknown;
  mapping_meta: unknown;
  result: unknown;
  error: string | null;
  as_of: string | null;
}

export interface SnapshotStore {
  create(row: RunRow, file: Buffer | null): Promise<void>;
  get(id: string): Promise<RunRow | null>;
  update(id: string, patch: Partial<RunRow>): Promise<void>;
  getFile(path: string): Promise<Buffer | null>;
  purgeExpired(now?: Date): Promise<number>;
  countExpired(now?: Date): Promise<number>;
}

export const RETENTION_DAYS = 7;
export const newRunId = () => randomBytes(24).toString('base64url');
export const validRunId = (id: string) => /^[A-Za-z0-9_-]{32,64}$/.test(id);

export class MemoryStore implements SnapshotStore {
  rows = new Map<string, RunRow>();
  files = new Map<string, Buffer>();
  async create(row: RunRow, file: Buffer | null) {
    this.rows.set(row.id, { ...row });
    if (file && row.storage_path) this.files.set(row.storage_path, file);
  }
  async get(id: string) { const r = this.rows.get(id); return r ? { ...r } : null; }
  async update(id: string, patch: Partial<RunRow>) {
    const r = this.rows.get(id);
    if (!r) throw new Error('unknown run');
    Object.assign(r, patch);
  }
  async getFile(path: string) { return this.files.get(path) ?? null; }
  async countExpired(now = new Date()) {
    let n = 0;
    for (const r of this.rows.values()) if (new Date(r.expires_at) <= now) n++;
    return n;
  }
  async purgeExpired(now = new Date()) {
    let n = 0;
    for (const [id, r] of this.rows) {
      if (new Date(r.expires_at) <= now) {
        this.rows.delete(id);
        if (r.storage_path) this.files.delete(r.storage_path);
        n++;
      }
    }
    return n;
  }
}

const BUCKET = 'snapshot-uploads';

export class SupabaseStore implements SnapshotStore {
  private url: string;
  private key: string;
  private doFetch: typeof fetch;
  constructor(url: string, key: string, doFetch: typeof fetch = fetch) { this.url = url; this.key = key; this.doFetch = doFetch; }
  private h(extra: Record<string, string> = {}) {
    return { apikey: this.key, Authorization: `Bearer ${this.key}`, ...extra };
  }
  private async rest(path: string, init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {}) {
    const res = await this.doFetch(`${this.url}/rest/v1/${path}`, { ...init, cache: 'no-store', headers: this.h({ 'Content-Type': 'application/json', ...(init.headers ?? {}) }) });
    if (!res.ok) throw new Error(`snapshot store ${init.method ?? 'GET'} ${path.split('?')[0]} -> ${res.status}`);
    return res;
  }
  async create(row: RunRow, file: Buffer | null) {
    if (file && row.storage_path) {
      const up = await this.doFetch(`${this.url}/storage/v1/object/${BUCKET}/${row.storage_path}`, {
        method: 'POST', cache: 'no-store', headers: this.h({ 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' }), body: new Uint8Array(file),
      });
      if (!up.ok) throw new Error(`snapshot file upload -> ${up.status}`);
    }
    try {
      await this.rest('snapshot_runs', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
    } catch (e) {
      // The row is the only handle the purge can find, so an upload without a row would live forever. Remove it now.
      if (file && row.storage_path) {
        await this.doFetch(`${this.url}/storage/v1/object/${BUCKET}`, {
          method: 'DELETE', cache: 'no-store', headers: this.h({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [row.storage_path] }),
        }).catch(() => {});
      }
      throw e;
    }
  }
  async countExpired(now = new Date()) {
    const res = await this.rest(`snapshot_runs?expires_at=lt.${encodeURIComponent(now.toISOString())}&select=id&limit=1`, { headers: { Prefer: 'count=exact' } });
    const m = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
    return m ? Number(m[1]) : 0;
  }
  async get(id: string) {
    const res = await this.rest(`snapshot_runs?id=eq.${encodeURIComponent(id)}&select=*`);
    const rows = (await res.json()) as RunRow[];
    return rows[0] ?? null;
  }
  async update(id: string, patch: Partial<RunRow>) {
    await this.rest(`snapshot_runs?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) });
  }
  async getFile(path: string) {
    const res = await this.doFetch(`${this.url}/storage/v1/object/${BUCKET}/${path}`, { cache: 'no-store', headers: this.h() });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  }
  async purgeExpired(now = new Date()) {
    const res = await this.rest(`snapshot_runs?expires_at=lt.${encodeURIComponent(now.toISOString())}&select=id,storage_path&limit=200`);
    const rows = (await res.json()) as { id: string; storage_path: string | null }[];
    if (!rows.length) return 0;
    const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
    if (paths.length) {
      const del = await this.doFetch(`${this.url}/storage/v1/object/${BUCKET}`, {
        method: 'DELETE', cache: 'no-store', headers: this.h({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: paths }),
      });
      if (!del.ok) throw new Error(`snapshot file purge -> ${del.status}`);
    }
    const ids = rows.map((r) => `"${r.id}"`).join(',');
    await this.rest(`snapshot_runs?id=in.(${ids})`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return rows.length;
  }
}

let singleton: SnapshotStore | null = null;
export function getStore(env: Record<string, string | undefined> = process.env): SnapshotStore {
  if (singleton) return singleton;
  // Direct process.env reference so Next inlines it at build: the URL is a fly.toml build arg, not a runtime secret.
  const url = env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL ?? process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  const key = env.LOVELEEDAY_SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) singleton = new SupabaseStore(url, key);
  else if (env.NODE_ENV !== 'production' && env.SNAPSHOT_STORE === 'memory') singleton = new MemoryStore();
  else throw new Error('snapshot storage is not configured');
  return singleton;
}
export function setStoreForTests(s: SnapshotStore | null) { singleton = s; }
