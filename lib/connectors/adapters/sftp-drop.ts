import { sha256Hex } from '../hash.ts';
import { sftpChroot } from '../auth/sftp.ts';
import { parseUpload } from '../upload/parse.ts';
import type { Adapter, Creds, PulledRecord } from '../types.ts';
import { decodeCursor, encodeCursor, need } from './common.ts';

export interface SftpFile {
  name: string;
  size: number;
  mtimeMs: number;
}

export interface SftpLister {
  list(dir: string): Promise<SftpFile[]>;
  read(path: string): Promise<Buffer>;
}

/**
 * Files land in /tenants/<tenant_id>/inbox/<object>/. A file is complete when `<name>.done` exists next to it
 * (set creds.require_done_marker = 'false' to accept files without one). Each file is one delivery: rows are
 * ingested with source_ref = file sha256 + ':' + row, so replaying a file is a no-op. The cursor is the last
 * processed "<mtime>|<name>" key.
 */
export function createSftpAdapter(lister: SftpLister): Adapter {
  const dirOf = (creds: Creds, object: string) => {
    need(creds, 'tenant_id');
    if (!/^[A-Za-z0-9_.-]+$/.test(object)) throw new Error('invalid folder name');
    return `${sftpChroot(creds.tenant_id)}/${object}`;
  };
  return {
    key: 'sftp-drop',
    objects: [],
    async validate(creds) {
      need(creds, 'tenant_id');
      await lister.list(sftpChroot(creds.tenant_id));
      return { ok: true, detail: 'inbox reachable', account: creds.tenant_id };
    },
    async pull(object, cursor, creds) {
      const dir = dirOf(creds, object);
      const state = decodeCursor(cursor);
      const all = await lister.list(dir);
      const done = new Map(all.filter((f) => f.name.endsWith('.done')).map((f) => [f.name.slice(0, -5), f.mtimeMs]));
      const needMarker = creds.require_done_marker !== 'false';
      // Ordered by completion time (the later of file and marker), so a late marker never sorts behind work already done.
      const key = (f: SftpFile) => `${String(Math.max(f.mtimeMs, done.get(f.name) ?? 0)).padStart(15, '0')}|${f.name}`;
      const ready = all
        .filter((f) => !f.name.endsWith('.done') && (!needMarker || done.has(f.name)))
        .sort((a, b) => (key(a) < key(b) ? -1 : 1))
        .filter((f) => state.hw === undefined || key(f) > state.hw);
      if (!ready.length) return { records: [], nextCursor: null, hasMore: false };
      const file = ready[0];
      const data = await lister.read(`${dir}/${file.name}`);
      const sha = sha256Hex(data);
      const table = parseUpload(data, file.name);
      const records: PulledRecord[] = table.rows.map((cells, i) => ({
        source_ref: `${sha}:${i + 2}`,
        payload: Object.fromEntries(table.header.map((h, c) => [h, cells[c] ?? ''])),
        observed_at: new Date(file.mtimeMs).toISOString(),
      }));
      return { records, nextCursor: encodeCursor({ hw: key(file) }), hasMore: ready.length > 1 };
    },
  };
}

const unwired: SftpLister = {
  async list() {
    throw new Error('sftp-drop: no SftpLister wired; use createSftpAdapter(lister)');
  },
  async read() {
    throw new Error('sftp-drop: no SftpLister wired; use createSftpAdapter(lister)');
  },
};

export const sftpDrop = createSftpAdapter(unwired);
