import { createHash } from 'node:crypto';

/** Stable JSON: object keys sorted recursively, so equal content always hashes equal. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  const o = v as Record<string, unknown>;
  return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
}

export const sha256Hex = (data: string | Buffer | Uint8Array) => createHash('sha256').update(data).digest('hex');
export const payloadSha256 = (payload: unknown) => sha256Hex(canonicalJson(payload));
