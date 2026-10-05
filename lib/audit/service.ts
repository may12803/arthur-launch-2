// Delivers an audit with no person in the loop: claim the job, find the tenant's best price file among its uploaded
// documents, map its columns deterministically (no model call), run the rules engine, verify every figure, save.
// A tenant with no usable file is not an error: the audit waits in needs_data and re-runs by itself when a new
// document arrives (audit_pending only offers it again after a document newer than its last attempt).
import { parseUpload, UploadError, type ParsedTable } from '../connectors/upload/parse.ts';
import { FIELDS, heuristicMapping, type Mapping } from '../snapshot/mapper.ts';
import type { CatalogLite } from '../snapshot/coverage.ts';
import { liveCatalog } from '../snapshot/catalog.ts';
import { AUDIT_VERSION, generateAudit, verifyReport } from './report.ts';
import type { AuditStore } from './store.ts';

export const AUDIT_LIMITS = { maxBytes: 20 * 1024 * 1024, maxRows: 100_000, maxColumns: 100 };
const MAX_DOCS_TRIED = 10;

export type GenerateOutcome = 'ready' | 'needs_data' | 'failed' | 'skipped';

export interface ServiceDeps {
  store: AuditStore;
  now?: () => Date;
  catalog?: () => CatalogLite[];
  log?: (msg: string) => void;
}

interface Candidate { id: string; name: string; table: ParsedTable; mapping: Mapping; mapped: number }

const NEEDS_FILE = 'No price file has been uploaded yet. Upload your price export on the Data page and this audit will run on its own.';

export async function generateForAudit(deps: ServiceDeps, auditId: string): Promise<GenerateOutcome> {
  const { store } = deps;
  const log = deps.log ?? (() => {});
  const job = await store.claim(auditId);
  if (!job) return 'skipped';
  try {
    const docs = await store.listDocuments(job.tenant_id);
    const rejected: string[] = [];
    let best: Candidate | null = null;
    for (const doc of docs.slice(0, MAX_DOCS_TRIED)) {
      const bytes = await store.readDocument(job.tenant_id, doc.id);
      if (!bytes) { rejected.push(`${doc.name}: could not be opened`); continue; }
      let table: ParsedTable;
      try {
        table = parseUpload(bytes, doc.name, AUDIT_LIMITS);
      } catch (e) {
        rejected.push(`${doc.name}: ${e instanceof UploadError ? e.message : 'could not be read'}`);
        continue;
      }
      const mapping = heuristicMapping(table.header, table.rows);
      const missing = FIELDS.filter((f) => f.required && !mapping[f.id]).map((f) => f.label.toLowerCase());
      if (missing.length) { rejected.push(`${doc.name}: no ${missing.join(' or ')} column found`); continue; }
      const mapped = Object.keys(mapping).length;
      if (!best || mapped > best.mapped) best = { id: doc.id, name: doc.name, table, mapping, mapped };
    }
    if (!best) {
      const reason = rejected.length ? `We looked at ${rejected.length === 1 ? 'your upload' : 'your uploads'} and could not run the audit. ${rejected.join('. ')}. Upload a price export with an item column and a price column and it will run on its own.` : NEEDS_FILE;
      await store.save({ auditId, status: 'needs_data', reason, documentId: null, filename: null, asOf: null, score: null, lossTotal: null, headline: null, result: null, version: AUDIT_VERSION });
      return 'needs_data';
    }
    const asOf = (deps.now ?? (() => new Date()))().toISOString().slice(0, 10);
    const report = generateAudit({
      header: best.table.header, rows: best.table.rows, mapping: best.mapping, asOf, filename: best.name, documentId: best.id,
      offerKey: job.offer_key, recordLimit: job.record_limit, catalog: deps.catalog?.() ?? liveCatalog(),
    });
    const problems = verifyReport(report);
    if (problems.length) {
      log(`audit ${auditId} failed verification: ${problems.slice(0, 5).join(' | ')}`);
      await store.save({ auditId, status: 'failed', reason: 'The report did not pass its own checks, so nothing was published. We have been told and will rerun it.', documentId: best.id, filename: best.name, asOf, score: null, lossTotal: null, headline: null, result: null, version: AUDIT_VERSION });
      return 'failed';
    }
    await store.save({
      auditId, status: 'ready', reason: null, documentId: best.id, filename: best.name, asOf, score: report.score.score, lossTotal: report.loss_total,
      headline: report.brief.headline.text, result: report, version: AUDIT_VERSION,
    });
    return 'ready';
  } catch (e) {
    log(`audit ${auditId} failed: ${e instanceof Error ? e.message : 'error'}`);
    try {
      await store.save({ auditId, status: 'failed', reason: 'Something went wrong on our side while building this report. It will be retried automatically.', documentId: null, filename: null, asOf: null, score: null, lossTotal: null, headline: null, result: null, version: AUDIT_VERSION });
    } catch { /* the stale-claim sweep picks it up */ }
    return 'failed';
  }
}

/** Runs whatever is waiting, oldest first, one at a time. Safe to call from anywhere: claiming is atomic in the database. */
export async function runPendingAudits(deps: ServiceDeps, opts: { tenantId?: string; limit?: number } = {}): Promise<Record<GenerateOutcome, number>> {
  const counts: Record<GenerateOutcome, number> = { ready: 0, needs_data: 0, failed: 0, skipped: 0 };
  const ids = await deps.store.pending(opts.limit ?? 5, opts.tenantId);
  for (const id of ids) counts[await generateForAudit(deps, id)]++;
  return counts;
}
