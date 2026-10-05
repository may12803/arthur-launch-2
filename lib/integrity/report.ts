// Plain-language markdown report for an IntegrityResult. Every figure is injected from the engine; nothing is generated.
import type { Finding, FlaggedRow, IntegrityResult } from './schema.ts';
import { ACTION_LABEL, SCORE_WEIGHTS } from './rules.ts';

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString('en-US');

function cell(v: unknown): string {
  if (v === null || v === undefined) return '-';
  if (Array.isArray(v)) return v.join(' / ');
  return String(v).replace(/\|/g, '/');
}

function table(rows: FlaggedRow[], cols: string[]): string {
  if (rows.length === 0) return '';
  const head = `| ${cols.join(' | ')} |`;
  const sep = `| ${cols.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${cols.map((c) => cell(c === 'id' ? r.id : r[c])).join(' | ')} |`);
  return [head, sep, ...body].join('\n');
}

const SAMPLE_COLUMNS: Record<string, string[]> = {
  below_cost: ['id', 'customer_id', 'sku', 'price', 'current_cost', 'units_t12m', 'exposure'],
  cost_lag: ['id', 'customer_id', 'sku', 'price', 'cost_at_price_date', 'current_cost', 'cost_increase_pct', 'units_since_increase', 'exposure'],
  duplicate_customer: ['member_ids', 'member_names', 'member_addresses', 'price_records'],
  stale_price: ['id', 'customer_id', 'sku', 'price', 'price_date', 'last_sale_date'],
  inactive_customer_prices: ['id', 'customer_id', 'customer_name', 'sku', 'price', 'price_date'],
  dead_sku: ['id', 'description', 'category', 'last_sale_date', 'on_hand'],
};

function headline(r: IntegrityResult): string {
  const loss = r.findings.filter((f) => f.exposure.kind === 'loss' && (f.exposure.amount ?? 0) > 0);
  const flagged = r.findings.reduce((a, f) => a + f.count, 0);
  const parts = loss.map((f) => `${usd(f.exposure.amount as number)} from ${f.title.toLowerCase()}`);
  const money = loss.length ? `${usd(r.quantifiedExposure)} of margin leakage traced to specific rows (${parts.join('; ')}), ` : 'no dollar leakage could be traced from the supplied data, ';
  return `Integrity score ${r.score.score} out of 100: ${money}and ${num(flagged)} flagged items across ${r.findings.filter((f) => f.count > 0).length} of ${r.findings.length} checks.`;
}

function section(f: Finding, asOf: string): string {
  const e = f.exposure;
  const money = e.amount === null ? 'No dollar figure (see basis below).' : `${e.kind === 'loss' ? 'Margin loss' : 'Exposure'}: ${usd(e.amount)}.`;
  const lines = [
    `### ${f.title}`,
    '',
    `Severity ${f.severity}. ${num(f.count)} ${f.unit} flagged of ${num(f.population)} scanned. Recommended action: ${ACTION_LABEL[f.action]}. ${money}`,
    '',
    `Formula: ${e.formula}.`,
    `Basis: ${e.basis}.`,
    `Input rows: ${num(e.inputRowIds.length)} ids, all listed in findings.json under this rule.`,
    '',
  ];
  if (f.count > 0) {
    lines.push(`Largest ${f.sample.length} (as of ${asOf}):`, '', table(f.sample, SAMPLE_COLUMNS[f.rule] ?? ['id']), '');
  }
  return lines.join('\n');
}

export function renderReport(r: IntegrityResult, meta: { title?: string; note?: string } = {}): string {
  const out: string[] = [];
  out.push(`# ${meta.title ?? 'Data Integrity and Pricing Leakage Review'}`, '');
  if (meta.note) out.push(`> ${meta.note}`, '');
  out.push(`As of ${r.asOf}. ${headline(r)}`, '');
  out.push('## What was scanned', '');
  const t = r.tableSizes;
  out.push(`${num(t.customers)} customers, ${num(t.products)} products, ${num(t.prices)} customer price records, ${num(t.sales)} sales rows, ${num(t.costs)} cost-change rows, ${num(t.inventory)} inventory rows.`, '');
  if (r.skipped.length) {
    out.push('Checks that could not run:', '');
    for (const s of r.skipped) out.push(`- ${s.rule}: ${s.reason}`);
    out.push('');
  }
  out.push('## Scorecard', '');
  out.push('| Check | Flagged | Scanned | Severity | Dollar figure | Action |', '| --- | --- | --- | --- | --- | --- |');
  for (const f of r.findings) {
    out.push(`| ${f.title} | ${num(f.count)} ${f.unit} | ${num(f.population)} | ${f.severity} | ${f.exposure.amount === null ? 'not quantified' : usd(f.exposure.amount)} | ${ACTION_LABEL[f.action]} |`);
  }
  out.push('');
  out.push('## Findings', '');
  for (const f of [...r.findings].sort((a, b) => (b.exposure.amount ?? 0) - (a.exposure.amount ?? 0) || b.count - a.count)) out.push(section(f, r.asOf));
  out.push('## How the score is computed', '');
  out.push('Score = 100 minus the sum of one penalty per check. Penalty = weight x min(1, share / saturation), where share is flagged items divided by items scanned. A check that could not run adds no penalty.', '');
  out.push('| Check | Weight | Saturates at | Share found | Penalty | Why this weight |', '| --- | --- | --- | --- | --- | --- |');
  for (const l of r.score.lines) {
    out.push(`| ${l.rule} | ${l.weight} | ${(l.saturationShare * 100).toFixed(0)}% | ${(l.share * 100).toFixed(2)}% | ${l.penalty.toFixed(2)} | ${SCORE_WEIGHTS[l.rule].basis} |`);
  }
  out.push('', `Final score: ${r.score.score}.`, '');
  out.push('## What this does not say', '');
  out.push('Dollar figures appear only where the files contain a basis for them: sales rows for volume and the cost history for cost. Stale prices, dead SKUs, duplicate customers and inactive-customer prices are shown as counts with no dollar figure because the data holds no dollar basis for them.', '');
  return out.join('\n');
}
