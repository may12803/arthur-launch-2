import { requestJson } from '../http.ts';
import { guardedFetch } from '../net/safe-url.ts';
import type { Adapter, Creds, FetchLike, ValidateResult } from '../types.ts';
import { advance, decodeCursor, maxOf, toRecords } from './common.ts';

export interface RestCtx {
  base: string;
  creds: Creds;
  hw?: string;
  pg?: string;
}

export interface RestObjectSpec {
  /** build the request for this page; hw = last completed high-water mark, pg = in-pass pagination token */
  req(c: RestCtx): { url: string; init?: RequestInit };
  list(json: any): any[];
  id(rec: any, creds: Creds): string;
  /** comparable timestamp string used to advance the high-water mark */
  ts?(rec: any, creds: Creds): string | undefined;
  /** a cursor-like value taken straight from the response (stream position, delta token) that becomes the high-water mark */
  hwOf?(json: any, c: RestCtx): string | undefined;
  numericTs?: boolean;
  /** next pagination token, or undefined when the pass is complete */
  next(json: any, c: RestCtx): string | undefined;
}

export interface RestSpec {
  key: string;
  base(creds: Creds): string;
  /** true when the base host comes from customer-supplied credentials: every request goes through the SSRF guard */
  guard?: boolean;
  headers(creds: Creds, fetch: FetchLike): Promise<Record<string, string>> | Record<string, string>;
  validate: { url(base: string, creds: Creds): string; init?: RequestInit; account?(json: any): string | undefined };
  objects: Record<string, RestObjectSpec>;
}

export function makeRestAdapter(spec: RestSpec): Adapter {
  return {
    key: spec.key,
    objects: Object.keys(spec.objects),
    async validate(creds, rawFetch): Promise<ValidateResult> {
      const fetch = spec.guard ? guardedFetch(rawFetch) : rawFetch;
      const base = spec.base(creds);
      const headers = await spec.headers(creds, fetch);
      const j = await requestJson(fetch, spec.validate.url(base, creds), { ...spec.validate.init, headers: { ...headers, ...(spec.validate.init?.headers as Record<string, string> | undefined) } });
      return { ok: true, detail: 'credentials accepted', account: spec.validate.account?.(j) };
    },
    async pull(object, cursor, creds, rawFetch) {
      const fetch = spec.guard ? guardedFetch(rawFetch) : rawFetch;
      const o = spec.objects[object];
      if (!o) throw new Error(`${spec.key}: unknown object ${object}`);
      const state = decodeCursor(cursor);
      const ctx: RestCtx = { base: spec.base(creds), creds, hw: state.hw, pg: state.pg };
      const r = o.req(ctx);
      const headers = await spec.headers(creds, fetch);
      const json = await requestJson(fetch, r.url, { ...r.init, headers: { ...headers, ...(r.init?.headers as Record<string, string> | undefined) } });
      const items = o.list(json);
      const records = toRecords(items, (x) => o.id(x, creds), o.ts ? (x) => o.ts!(x, creds) : undefined);
      const computed = o.ts ? maxOf(items.map((x) => o.ts!(x, creds)), state.mx, o.numericTs) : state.mx;
      const mx = o.hwOf?.(json, ctx) ?? computed;
      return advance(state, records, mx, o.next(json, ctx));
    },
  };
}

/** helpers shared by the offset-paged specs */
export const offsetOf = (c: RestCtx) => Number(c.pg ?? 0);
export const nextOffset = (c: RestCtx, count: number, pageSize: number) => (count >= pageSize ? String(offsetOf(c) + count) : undefined);
export const qs = (params: Record<string, string | number | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') u.set(k, String(v));
  return u.toString();
};
