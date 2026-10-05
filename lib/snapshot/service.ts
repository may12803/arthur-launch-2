// Orchestration for the anonymous snapshot API, independent of Next so it can be tested directly.
import { createHash } from 'node:crypto';
import { parseUpload, toCsv, UploadError, type ParsedTable } from '../connectors/upload/parse.ts';
import { FIELDS, normalizeUserMapping, suggestMapping, type LlmOptions, type Mapping } from './mapper.ts';
import { runSnapshot, todayIso, type SnapshotResult } from './run.ts';
import { buildBrief } from './brief.ts';
import { buildMarket, type MarketExposure } from './market.ts';
import { sampleCsv, SAMPLE_LABEL } from './sample.ts';
import { RETENTION_DAYS, newRunId, type RunRow, type SnapshotStore } from './store.ts';
import type { CatalogLite } from './coverage.ts';

export const PUBLIC_LIMITS = { maxBytes: 10 * 1024 * 1024, maxRows: 100_000, maxColumns: 100 };
export const PREVIEW_ROWS = 5;
export const VIEW_ROWS_PER_FINDING = 100;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'bad_request') { super(message); this.status = status; this.code = code; }
}

export interface Deps {
  store: SnapshotStore;
  llm?: LlmOptions;
  catalog?: () => CatalogLite[];
  now?: () => Date;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
}

const asApiError = (e: unknown): ApiError => {
  if (e instanceof ApiError) return e;
  if (e instanceof UploadError) return new ApiError(e.code === 'too_large' ? 413 : 422, e.message, e.code);
  return new ApiError(500, 'Something went wrong on our side.', 'server_error');
};
export { asApiError };

const iso = (d: Date) => d.toISOString();

function parseOrThrow(data: Buffer, filename: string): ParsedTable {
  try {
    return parseUpload(data, filename, PUBLIC_LIMITS);
  } catch (e) {
    throw asApiError(e);
  }
}

function mappingPayload(sug: Awaited<ReturnType<typeof suggestMapping>>) {
  return {
    fields: FIELDS.map((f) => ({ id: f.id, label: f.label, required: !!f.required })),
    mapping: sug.mapping,
    unmapped_columns: sug.unmapped_columns,
    missing_required: sug.missing_required,
    llm: sug.llm,
  };
}

export interface StartInput {
  data: Buffer;
  filename: string;
  source: 'upload' | 'sample';
  asOf?: string;
  /** field id -> column name. When present the rules run immediately. */
  mapping?: unknown;
}

export async function startRun(deps: Deps, input: StartInput) {
  const now = (deps.now ?? (() => new Date()))();
  const table = parseOrThrow(input.data, input.filename);
  const id = newRunId();
  const row: RunRow = {
    id, status: 'mapping', created_at: iso(now), expires_at: iso(new Date(now.getTime() + RETENTION_DAYS * 86400_000)), source: input.source,
    filename: input.filename.slice(0, 120), file_bytes: input.data.length, file_sha256: createHash('sha256').update(input.data).digest('hex'),
    storage_path: `${id}`, header: table.header, rows_total: table.rows.length, mapping: null, mapping_meta: null, result: null, error: null,
    as_of: validAsOf(input.asOf) ?? null,
  };
  await deps.store.create(row, input.data);
  if (input.mapping !== undefined) return { id, ...(await executeRun(deps, row, table, input.mapping)) };
  const sug = await suggestMapping(table.header, table.rows, deps.llm);
  await deps.store.update(id, { mapping_meta: sug });
  return {
    id, status: 'mapping' as const, expires_at: row.expires_at, filename: row.filename, source: row.source, rows_total: table.rows.length,
    header: table.header, preview_rows: table.rows.slice(0, PREVIEW_ROWS).map((r) => r.map((c) => c.slice(0, 48))), ...mappingPayload(sug),
  };
}

function validAsOf(v: string | undefined): string | undefined {
  if (!v) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new ApiError(400, 'as_of must be a date like 2026-09-30.');
  return v;
}

async function executeRun(deps: Deps, row: RunRow, table: ParsedTable, mappingInput: unknown) {
  const { mapping, errors } = normalizeUserMapping(mappingInput, table.header);
  if (errors.length) throw new ApiError(422, errors.join('; '), 'bad_mapping');
  const asOf = row.as_of ?? (row.source === 'sample' ? (await sampleCsv()).asOf : todayIso((deps.now ?? (() => new Date()))()));
  const result = runSnapshot({
    header: table.header, rows: table.rows, mapping: reconcile(mapping, row), asOf, source: row.source,
    label: row.source === 'sample' ? SAMPLE_LABEL : null, catalog: deps.catalog?.() ?? [],
  });
  await deps.store.update(row.id, { status: 'done', mapping, result, as_of: asOf, error: null });
  return { status: 'done' as const, expires_at: row.expires_at };
}

/** Keep the suggestion's confidence and source for columns the person left as suggested. */
function reconcile(user: Mapping, row: RunRow): Mapping {
  const meta = row.mapping_meta as { mapping?: Mapping } | null;
  const out: Mapping = {};
  for (const [f, m] of Object.entries(user) as [keyof Mapping, NonNullable<Mapping[keyof Mapping]>][]) {
    const s = meta?.mapping?.[f];
    out[f] = s && s.column === m.column ? s : m;
  }
  return out;
}

export async function rerun(deps: Deps, id: string, mappingInput: unknown) {
  const row = await loadLive(deps, id);
  if (!row.storage_path) throw new ApiError(410, 'The file for this run is gone.', 'gone');
  const file = await deps.store.getFile(row.storage_path);
  if (!file) throw new ApiError(410, 'The file for this run is gone.', 'gone');
  const table = parseOrThrow(file, row.filename ?? 'upload.csv');
  const r = await executeRun(deps, row, table, mappingInput);
  return { id, ...r };
}

async function loadLive(deps: Deps, id: string): Promise<RunRow> {
  const row = await deps.store.get(id);
  const now = (deps.now ?? (() => new Date()))();
  if (!row || new Date(row.expires_at) <= now) throw new ApiError(404, 'This snapshot was not found or has expired.', 'not_found');
  return row;
}

/** Category counts come from the stored findings' rows only if the file mapped a category; otherwise from the file. */
async function categoryCounts(deps: Deps, row: RunRow, result: SnapshotResult): Promise<{ name: string; rows: number }[]> {
  const m = (row.mapping ?? {}) as Mapping;
  const catCol = m.category?.column ?? m.description?.column;
  void result;
  if (!catCol || !row.storage_path) return [];
  const file = await deps.store.getFile(row.storage_path);
  if (!file) return [];
  const t = parseOrThrow(file, row.filename ?? 'upload.csv');
  const i = t.header.indexOf(catCol);
  if (i < 0) return [];
  const counts = new Map<string, number>();
  for (const r of t.rows) {
    const v = (r[i] ?? '').trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, rows]) => ({ name, rows }));
}

export async function viewRun(deps: Deps, id: string) {
  const row = await loadLive(deps, id);
  if (row.status !== 'done' || !row.result) {
    const sug = (row.mapping_meta ?? null) as Awaited<ReturnType<typeof suggestMapping>> | null;
    return {
      id, status: row.status, expires_at: row.expires_at, filename: row.filename, source: row.source, rows_total: row.rows_total,
      header: row.header, ...(sug ? mappingPayload(sug) : {}),
    };
  }
  const result = row.result as SnapshotResult;
  const hasCost = !!result.columns_found.cost;
  const market: MarketExposure = await buildMarket(hasCost, hasCost ? await categoryCounts(deps, row, result) : [], deps.env, deps.fetch);
  const view: SnapshotResult = { ...result, findings: result.findings.map((f) => ({ ...f, rows: f.rows.slice(0, VIEW_ROWS_PER_FINDING) })) };
  return {
    id, status: 'done' as const, expires_at: row.expires_at, filename: row.filename, source: row.source,
    header: row.header, mapping: row.mapping, fields: FIELDS.map((f) => ({ id: f.id, label: f.label, required: !!f.required })),
    result: view, brief: buildBrief(result), market,
    // Plan and checkout buttons stay hidden until Daniel confirms public tier prices and sets PUBLIC_PRICING_ENABLED=1.
    pricing_enabled: (deps.env ?? process.env).PUBLIC_PRICING_ENABLED === '1',
    retention: `The file and this result are deleted ${RETENTION_DAYS} days after upload.`,
  };
}

export async function rowsPage(deps: Deps, id: string, rule: string, offset: number, limit: number) {
  const row = await loadLive(deps, id);
  const result = row.result as SnapshotResult | null;
  const f = result?.findings.find((x) => x.rule === rule);
  if (!f) throw new ApiError(404, 'No such finding on this snapshot.', 'not_found');
  const o = Math.max(0, Math.floor(offset) || 0);
  const l = Math.min(500, Math.max(1, Math.floor(limit) || 100));
  return { rule, rows_total: f.rows_total, rows_truncated: f.rows_truncated, offset: o, rows: f.rows.slice(o, o + l), exposure: f.exposure };
}

export async function exportCsv(deps: Deps, id: string, rule?: string) {
  const row = await loadLive(deps, id);
  const result = row.result as SnapshotResult | null;
  if (!result) throw new ApiError(409, 'This snapshot has not been run yet.', 'not_ready');
  const findings = rule ? result.findings.filter((f) => f.rule === rule) : result.findings;
  if (rule && !findings.length) throw new ApiError(404, 'No such finding on this snapshot.', 'not_found');
  const header = ['rule', 'finding', 'row_in_your_file', 'id', 'item', 'customer', 'exposure', 'exposure_kind', 'details'];
  const out: unknown[][] = [header];
  for (const f of findings) {
    for (const r of f.rows) {
      const { id: rid, exposure, ...rest } = r;
      const m = /^r(\d+)$/.exec(String(rid));
      out.push([f.rule, f.title, m ? m[1] : '', rid, rest.sku ?? '', rest.customer_name ?? rest.customer_id ?? '', exposure ?? '', exposure === undefined ? '' : f.exposure.kind, JSON.stringify(rest)]);
    }
    if (f.rows_truncated) out.push([f.rule, f.title, '', '', '', '', '', '', `truncated: first ${f.rows.length} of ${f.rows_total} rows, sorted as the engine ranks them`]);
  }
  return { csv: toCsv(out), filename: `snapshot-${rule ?? 'all-findings'}.csv` };
}
