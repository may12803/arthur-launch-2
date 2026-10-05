// The automated audit report. A pure function of one parsed file plus its confirmed column mapping: it runs the same
// rules engine as the free Snapshot, keeps EVERY flagged row, and then refuses to publish any figure it cannot re-add
// from those rows. The executive brief is template text with numbered slots; each slot is filled from the figure table,
// never from a model, and the templates themselves contain no digits.
import { runSnapshot, type SnapshotFinding, type SnapshotResult } from '../snapshot/run.ts';
import type { CatalogLite } from '../snapshot/coverage.ts';
import type { Mapping } from '../snapshot/mapper.ts';
import { TRAILING_MONTHS, SCORE_WEIGHTS, ACTION_LABEL } from '../integrity/rules.ts';
import type { Action, FlaggedRow, RuleId, Severity } from '../integrity/schema.ts';

export const AUDIT_VERSION = 1;
/** Rows kept per finding. The parser already caps a file at 100,000 rows, so every flagged row fits. */
export const AUDIT_ROW_CAP = 200_000;

export const MONEY_LABEL = {
  loss: 'Loss: per-unit gap multiplied by units your file shows sold',
  exposure: 'Exposure: per unit only, never added together',
  none: 'Counted, not priced',
} as const;

export const RULE_TITLES: Record<RuleId, string> = {
  below_cost: 'Prices below current cost',
  cost_lag: 'Prices not updated after a cost increase',
  duplicate_customer: 'Duplicate customers',
  inactive_customer_prices: 'Inactive customers still holding price records',
  stale_price: 'Stale price records',
  dead_sku: 'Dead SKUs',
};

export interface AuditMoney {
  kind: 'loss' | 'exposure' | 'none';
  /** USD. Present only for a volume-backed loss that was re-added from its rows. */
  amount: number | null;
  formula: string;
  basis: string;
  /** How many rows feed the figure (the engine's own list of input ids, counted). */
  input_rows: number;
  /** The same sum recomputed from the stored rows; null when it could not be (truncated or not a loss). */
  recomputed: number | null;
}

export interface AuditFinding {
  rule: RuleId;
  title: string;
  severity: Severity;
  action: Action;
  unit: string;
  count: number;
  population: number;
  rows: FlaggedRow[];
  rows_total: number;
  rows_truncated: boolean;
  money: AuditMoney;
}

export interface AuditFigure {
  id: string;
  label: string;
  /** The exact text injected into the brief. */
  text: string;
  value: number | string | null;
  kind: 'loss' | 'exposure' | 'count' | 'score' | 'text';
  rule: RuleId | null;
  /** Rows of the file this figure is built from. */
  rows: number;
  formula: string;
  verified: boolean;
}

export interface BriefPara { template: string; text: string; figure_ids: string[] }
export interface AuditBrief { headline: BriefPara; paragraphs: BriefPara[]; generated_by: 'template' }

export interface AuditReport {
  version: number;
  as_of: string;
  offer_key: string | null;
  record_limit: number | null;
  source: { filename: string; document_id: string | null; rows_total: number; rows_used: number; over_limit: boolean };
  columns_found: SnapshotResult['columns_found'];
  columns_missing: SnapshotResult['columns_missing'];
  row_issues: SnapshotResult['row_issues'];
  notes: string[];
  score: SnapshotResult['score'];
  score_weights: { rule: RuleId; weight: number; saturation_share: number; basis: string }[];
  loss_total: number;
  findings: AuditFinding[];
  skipped: SnapshotResult['skipped'];
  coverage: SnapshotResult['coverage'];
  refused: { rule: RuleId; reason: string }[];
  figures: AuditFigure[];
  brief: AuditBrief;
}

export class RefusedFigureError extends Error {}

export const usd = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const num = (n: number) => n.toLocaleString('en-US');
const cents = (n: number) => Math.round(n * 100);

/** Re-adds a loss from its stored rows, in cents, by a code path separate from the engine's own running total. */
export function recomputeLoss(rows: FlaggedRow[]): number {
  let c = 0;
  for (const r of rows) c += cents(typeof r.exposure === 'number' ? r.exposure : 0);
  return c / 100;
}

function toAuditFinding(f: SnapshotFinding, refused: AuditReport['refused']): AuditFinding {
  const e = f.exposure;
  let kind = e.kind;
  let amount = e.amount;
  let basis = e.basis;
  let rows = f.rows.map((r) => {
    const { sale_ids: _s, ...rest } = r; // the sale rows of a flat file are the price rows themselves
    void _s;
    return rest as FlaggedRow;
  });
  let recomputed: number | null = null;
  if (kind === 'loss' && amount !== null) {
    if (f.rows_truncated) {
      kind = 'none'; amount = null; basis = 'refused: more flagged rows than could be stored, so the figure cannot be re-added from the rows';
      refused.push({ rule: f.rule, reason: basis });
    } else {
      recomputed = recomputeLoss(rows);
      if (cents(recomputed) !== cents(amount)) {
        kind = 'none'; amount = null; basis = `refused: the rows add to ${usd(recomputed)}, not the ${usd(e.amount as number)} the engine reported`;
        refused.push({ rule: f.rule, reason: basis });
      }
    }
  }
  if (kind !== 'loss') {
    // Not a volume-backed loss: a row's "exposure" of zero, or one that failed re-adding, is not a dollar figure, so it is not shown as one.
    rows = rows.map((r) => { const { exposure: _x, ...rest } = r; void _x; return rest as FlaggedRow; });
  }
  if (kind === 'exposure') {
    rows = rows.map((r) => { const { units_t12m: _u, ...rest } = r; void _u; return rest as FlaggedRow; });
    basis = 'The file has no units sold column, so volume is unknown. Each flagged record shows its gap per unit. The gaps are not added together, because they are not dollars lost.';
    amount = null;
  }
  return {
    rule: f.rule, title: f.title, severity: f.severity, action: f.action, unit: f.unit, count: f.count, population: f.population,
    rows, rows_total: f.rows_total, rows_truncated: f.rows_truncated,
    money: { kind, amount, formula: e.formula, basis, input_rows: e.inputRowIds.length, recomputed },
  };
}

function buildFigures(snap: SnapshotResult, findings: AuditFinding[], lossTotal: number, filename: string): AuditFigure[] {
  const figs: AuditFigure[] = [];
  const add = (f: Omit<AuditFigure, 'verified'> & { verified?: boolean }) => figs.push({ verified: true, ...f });
  add({ id: 'score', label: 'Integrity score', text: String(snap.score.score), value: snap.score.score, kind: 'score', rule: null, rows: snap.rows_used, formula: 'one hundred minus one penalty per check; see the score table' });
  add({ id: 'score_max', label: 'Integrity score scale', text: '100', value: 100, kind: 'count', rule: null, rows: 0, formula: 'fixed scale' });
  add({ id: 'rows_used', label: 'Rows read', text: num(snap.rows_used), value: snap.rows_used, kind: 'count', rule: null, rows: snap.rows_used, formula: 'rows with an item and a usable price' });
  add({ id: 'rows_total', label: 'Rows in the file', text: num(snap.rows_total), value: snap.rows_total, kind: 'count', rule: null, rows: snap.rows_total, formula: 'data rows in the uploaded file' });
  add({ id: 'as_of', label: 'As of', text: snap.as_of, value: snap.as_of, kind: 'text', rule: null, rows: 0, formula: 'the purchase date' });
  add({ id: 'file', label: 'File', text: filename, value: filename, kind: 'text', rule: null, rows: 0, formula: 'the file name as uploaded' });
  add({ id: 'checks_run', label: 'Checks run', text: num(findings.length), value: findings.length, kind: 'count', rule: null, rows: 0, formula: 'checks the columns found could support' });
  add({ id: 'checks_total', label: 'Checks available', text: num(findings.length + snap.skipped.length), value: findings.length + snap.skipped.length, kind: 'count', rule: null, rows: 0, formula: 'checks run plus checks skipped' });
  add({ id: 'trailing_months', label: 'Trailing window, months', text: String(TRAILING_MONTHS), value: TRAILING_MONTHS, kind: 'count', rule: null, rows: 0, formula: 'engine constant' });
  add({ id: 'coverage', label: 'Coverage', text: String(snap.coverage.score), value: snap.coverage.score, kind: 'count', rule: null, rows: 0, formula: snap.coverage.basis });
  add({ id: 'coverage_basis', label: 'Coverage basis', text: snap.coverage.basis, value: snap.coverage.basis, kind: 'text', rule: null, rows: 0, formula: 'checks unlocked over checks available' });
  const found = Object.entries(snap.columns_found).map(([field, c]) => `${c!.column} as ${field.replace(/_/g, ' ')}`);
  add({ id: 'cols_found', label: 'Columns found', text: found.join('; '), value: found.join('; '), kind: 'text', rule: null, rows: 0, formula: 'header synonyms and value shapes' });
  const missing = snap.columns_missing.map((c) => c.label.toLowerCase());
  add({ id: 'cols_missing', label: 'Columns not found', text: missing.length ? missing.join('; ') : 'none', value: missing.join('; '), kind: 'text', rule: null, rows: 0, formula: 'fields with no matching column' });
  add({ id: 'loss_total', label: 'Total margin loss (volume-backed)', text: usd(lossTotal), value: lossTotal, kind: 'loss', rule: null, rows: findings.filter((f) => f.money.kind === 'loss').reduce((a, f) => a + f.rows_total, 0), formula: 'sum of the loss figures below; per-unit exposure is never included' });
  for (const f of findings) {
    const r = f.rule;
    add({ id: `title.${r}`, label: `${f.title}: name`, text: f.title, value: f.title, kind: 'text', rule: r, rows: 0, formula: 'check name' });
    add({ id: `titlel.${r}`, label: `${f.title}: name, lower case`, text: f.title.toLowerCase(), value: f.title, kind: 'text', rule: r, rows: 0, formula: 'check name' });
    add({ id: `unit.${r}`, label: `${f.title}: unit`, text: f.unit, value: f.unit, kind: 'text', rule: r, rows: 0, formula: 'what the count counts' });
    add({ id: `action.${r}`, label: `${f.title}: action`, text: ACTION_LABEL[f.action], value: f.action, kind: 'text', rule: r, rows: 0, formula: 'recommended action' });
    add({ id: `count.${r}`, label: `${f.title}: flagged`, text: num(f.rows_total), value: f.rows_total, kind: 'count', rule: r, rows: f.rows_total, formula: 'flagged rows listed in this report', verified: f.rows_total === f.count && (f.rows_truncated || f.rows.length === f.rows_total) });
    add({ id: `population.${r}`, label: `${f.title}: scanned`, text: num(f.population), value: f.population, kind: 'count', rule: r, rows: f.population, formula: 'rows (or records) the check scanned' });
    if (f.money.kind === 'loss' && f.money.amount !== null) {
      add({ id: `loss.${r}`, label: `${f.title}: margin loss`, text: usd(f.money.amount), value: f.money.amount, kind: 'loss', rule: r, rows: f.rows_total, formula: f.money.formula, verified: f.money.recomputed !== null && cents(f.money.recomputed) === cents(f.money.amount) });
    }
    if (f.money.kind === 'exposure') {
      let best: FlaggedRow | null = null;
      for (const row of f.rows) if (typeof row.gap_per_unit === 'number' && (!best || row.gap_per_unit > (best.gap_per_unit as number))) best = row;
      if (best) add({ id: `max_gap.${r}`, label: `${f.title}: largest gap per unit`, text: usd(best.gap_per_unit as number), value: best.gap_per_unit as number, kind: 'exposure', rule: r, rows: 1, formula: `gap per unit on row ${String(best.id).replace(/^r/, '')} of your file (current cost minus price)` });
    }
  }
  for (const b of snap.coverage.blocked) {
    add({ id: `cap_title.${b.id}`, label: `${b.title}: name`, text: b.title.toLowerCase(), value: b.title, kind: 'text', rule: null, rows: 0, formula: 'coverage catalog' });
    add({ id: `cap_unlocks.${b.id}`, label: `${b.title}: what it unlocks`, text: b.unlocks, value: b.unlocks, kind: 'text', rule: null, rows: 0, formula: 'coverage catalog' });
    add({ id: `cap_how.${b.id}`, label: `${b.title}: how to unlock`, text: b.how, value: b.how, kind: 'text', rule: null, rows: 0, formula: 'missing fields and the connectors that can be connected today' });
  }
  for (const s of snap.skipped) {
    add({ id: `skip_title.${s.rule}`, label: `${RULE_TITLES[s.rule]}: name`, text: RULE_TITLES[s.rule].toLowerCase(), value: RULE_TITLES[s.rule], kind: 'text', rule: s.rule, rows: 0, formula: 'check name' });
    add({ id: `skip_reason.${s.rule}`, label: `${RULE_TITLES[s.rule]}: why skipped`, text: s.reason, value: s.reason, kind: 'text', rule: s.rule, rows: 0, formula: 'engine skip reason' });
  }
  return figs;
}

const SLOT = /\{\{([a-z0-9_.:-]+)\}\}/g;

/** Fills every slot from the figure table. A slot with no figure refuses the whole sentence rather than printing a blank. */
export function renderTemplate(template: string, figures: Map<string, AuditFigure>): BriefPara {
  const ids: string[] = [];
  const text = template.replace(SLOT, (_m, id: string) => {
    const f = figures.get(id);
    if (!f) throw new RefusedFigureError(`no sourced figure for slot "${id}"`);
    if (!f.verified) throw new RefusedFigureError(`figure "${id}" could not be traced to rows`);
    ids.push(id);
    return f.text;
  });
  return { template, text, figure_ids: ids };
}

function buildBrief(snap: SnapshotResult, findings: AuditFinding[], figures: AuditFigure[], lossTotal: number, refused: AuditReport['refused'], overLimit: boolean): AuditBrief {
  const fig = new Map(figures.map((f) => [f.id, f]));
  const out: BriefPara[] = [];
  const p = (t: string) => out.push(renderTemplate(t, fig));
  const lossFindings = findings.filter((f) => f.money.kind === 'loss' && (f.money.amount ?? 0) > 0);
  const flagged = findings.filter((f) => f.count > 0);

  p('We read {{rows_used}} of the {{rows_total}} rows in {{file}} as of {{as_of}} and ran {{checks_run}} of {{checks_total}} checks. The integrity score is {{score}} out of {{score_max}}.');
  if (lossFindings.length) {
    const each = lossFindings.map((f) => `{{loss.${f.rule}}} from {{titlel.${f.rule}}} ({{count.${f.rule}}} {{unit.${f.rule}}})`).join('; ');
    p(`Margin loss traced to specific rows comes to {{loss_total}}: ${each}. Loss means the gap per unit multiplied by the units your file shows sold in the last {{trailing_months}} months. Every figure lists the rows behind it, by row number in your file.`);
  } else {
    p('No dollar loss could be traced from this file, so none is claimed.');
  }
  for (const f of findings.filter((x) => x.money.kind === 'loss' && x.money.amount === 0 && x.count > 0)) {
    p(`{{count.${f.rule}}} {{unit.${f.rule}}} fall under {{titlel.${f.rule}}}, with {{loss.${f.rule}}} of loss because none of them sold in the last {{trailing_months}} months.`);
  }
  for (const f of findings.filter((x) => x.money.kind === 'exposure' && x.count > 0)) {
    const gap = fig.has(`max_gap.${f.rule}`) ? ` The largest gap is {{max_gap.${f.rule}}} per unit.` : '';
    p(`{{count.${f.rule}}} {{unit.${f.rule}}} fall under {{titlel.${f.rule}}}, but your file has no units sold column, so volume is unknown. This is exposure per unit, not a loss: each row shows its own gap and the gaps are not added together.${gap}`);
  }
  for (const f of flagged.filter((x) => x.money.kind === 'none')) {
    p(`{{title.${f.rule}}}: {{count.${f.rule}}} {{unit.${f.rule}}} flagged of {{population.${f.rule}}} scanned, recommended action {{action.${f.rule}}}. Counted, not priced, because the file holds no dollar basis for it.`);
  }
  if (!flagged.length) p('None of the checks that could run flagged a record.');
  p('Columns found: {{cols_found}}. Columns not found: {{cols_missing}}.');
  for (const s of snap.skipped) p(`The check for {{skip_title.${s.rule}}} could not run: {{skip_reason.${s.rule}}}.`);
  p('Coverage is {{coverage}} percent: {{coverage_basis}}.');
  for (const b of snap.coverage.blocked.slice(0, 5)) p(`To unlock {{cap_title.${b.id}}}, which {{cap_unlocks.${b.id}}}: {{cap_how.${b.id}}}`);
  if (refused.length) p(`Some figures were withheld because they could not be traced to rows: ${refused.map((r) => `{{title.${r.rule}}}`).join('; ')}.`);
  if (overLimit) p('This file holds more records than this audit includes. The whole file was still analyzed.');

  const headline = lossFindings.length
    ? renderTemplate('{{loss_total}} of margin loss traced to specific rows, integrity score {{score}} out of {{score_max}}', fig)
    : renderTemplate('Integrity score {{score}} out of {{score_max}}, no dollar loss traced from this file', fig);
  void lossTotal;
  return { headline, paragraphs: out, generated_by: 'template' };
}

export interface GenerateInput {
  header: string[];
  rows: string[][];
  mapping: Mapping;
  asOf: string;
  filename: string;
  documentId?: string | null;
  offerKey?: string | null;
  recordLimit?: number | null;
  catalog?: CatalogLite[];
}

export function generateAudit(input: GenerateInput): AuditReport {
  const snap = runSnapshot({
    header: input.header, rows: input.rows, mapping: input.mapping, asOf: input.asOf, source: 'upload', label: null,
    catalog: input.catalog ?? [], maxRowsPerFinding: AUDIT_ROW_CAP,
  });
  const refused: AuditReport['refused'] = [];
  const findings = snap.findings.map((f) => toAuditFinding(f, refused));
  const lossTotal = Math.round(findings.reduce((a, f) => a + (f.money.kind === 'loss' ? cents(f.money.amount ?? 0) : 0), 0)) / 100;
  const figures = buildFigures(snap, findings, lossTotal, input.filename);
  const overLimit = input.recordLimit != null && snap.rows_total > input.recordLimit;
  const brief = buildBrief(snap, findings, figures, lossTotal, refused, overLimit);
  return {
    version: AUDIT_VERSION, as_of: snap.as_of, offer_key: input.offerKey ?? null, record_limit: input.recordLimit ?? null,
    source: { filename: input.filename, document_id: input.documentId ?? null, rows_total: snap.rows_total, rows_used: snap.rows_used, over_limit: overLimit },
    columns_found: snap.columns_found, columns_missing: snap.columns_missing, row_issues: snap.row_issues, notes: snap.notes,
    score: snap.score, loss_total: lossTotal,
    score_weights: snap.score.lines.map((l) => ({ rule: l.rule, weight: l.weight, saturation_share: l.saturationShare, basis: SCORE_WEIGHTS[l.rule].basis })),
    findings, skipped: snap.skipped, coverage: snap.coverage, refused, figures, brief,
  };
}

/** Independent re-check of a finished report. Returns one line per problem; an empty list means every figure ties out. */
export function verifyReport(r: AuditReport): string[] {
  const problems: string[] = [];
  const fig = new Map(r.figures.map((f) => [f.id, f]));
  let lossCents = 0;
  for (const f of r.findings) {
    if (f.money.kind === 'loss') {
      if (f.money.amount === null) problems.push(`${f.rule}: loss with no amount`);
      else if (!f.rows_truncated && cents(recomputeLoss(f.rows)) !== cents(f.money.amount)) problems.push(`${f.rule}: rows do not add to the loss`);
      lossCents += cents(f.money.amount ?? 0);
    }
    if (f.money.kind === 'exposure') {
      if (f.money.amount !== null) problems.push(`${f.rule}: exposure carries a dollar total`);
      if (f.rows.some((row) => 'exposure' in row)) problems.push(`${f.rule}: exposure rows carry a dollar field`);
    }
    if (!f.rows_truncated && f.rows.length !== f.rows_total) problems.push(`${f.rule}: row count mismatch`);
    if (fig.get(`count.${f.rule}`)?.value !== f.rows_total) problems.push(`${f.rule}: count figure does not match rows`);
  }
  if (lossCents !== cents(r.loss_total)) problems.push('loss total does not equal the sum of its parts');
  if (cents(Number(fig.get('loss_total')?.value ?? 0)) !== lossCents) problems.push('loss_total figure does not equal the sum of its parts');
  for (const f of r.figures) if (!f.verified) problems.push(`figure ${f.id} is not verified`);
  for (const para of [r.brief.headline, ...r.brief.paragraphs]) {
    try {
      if (renderTemplate(para.template, fig).text !== para.text) problems.push(`brief text drifted from its template: ${para.template.slice(0, 40)}`);
    } catch (e) {
      problems.push(`brief slot unsourced: ${(e as Error).message}`);
    }
    if (/\d/.test(para.template)) problems.push(`brief template contains a literal digit: ${para.template.slice(0, 40)}`);
  }
  return problems;
}
