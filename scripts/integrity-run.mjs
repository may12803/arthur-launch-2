#!/usr/bin/env node
// Run the data-integrity rules over a directory of CSVs and write findings.json plus report.md.
//
//   node scripts/integrity-run.mjs <dir> [--out=<outDir>] [--as-of=YYYY-MM-DD] [--title="..."] [--note="..."]
//
// Expects any of customers.csv products.csv costs.csv inventory.csv prices.csv sales.csv (column names in
// lib/integrity/schema.ts). Rules whose tables are missing are skipped and reported, not guessed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tablesFromCsv, TABLE_COLUMNS } from '../lib/integrity/csv.ts';
import { analyze } from '../lib/integrity/rules.ts';
import { renderReport } from '../lib/integrity/report.ts';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = args.find((a) => !a.startsWith('--'));
if (!dir) {
  console.error('usage: node scripts/integrity-run.mjs <dir of CSVs> [--out=<dir>] [--as-of=YYYY-MM-DD] [--title=...] [--note=...]');
  process.exit(1);
}
const root = resolve(dir);
const texts = {};
for (const name of Object.keys(TABLE_COLUMNS)) {
  const f = join(root, `${name}.csv`);
  if (existsSync(f)) texts[name] = readFileSync(f, 'utf8');
}
if (Object.keys(texts).length === 0) {
  console.error(`no known CSVs in ${root} (looked for ${Object.keys(TABLE_COLUMNS).map((n) => `${n}.csv`).join(', ')})`);
  process.exit(1);
}
const tables = tablesFromCsv(texts);

let asOf = flag('as-of');
if (!asOf) {
  const dates = [...tables.sales.map((s) => s.sale_date), ...tables.prices.map((p) => p.effective_date)].sort();
  asOf = dates.at(-1);
  if (!asOf) { console.error('cannot infer --as-of from empty data; pass --as-of=YYYY-MM-DD'); process.exit(1); }
  console.error(`as-of not given; using latest date in the data: ${asOf}`);
}

const result = analyze(tables, { asOf });
const outDir = resolve(flag('out') ?? join(root, 'integrity-out'));
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'findings.json'), JSON.stringify(result, null, 2));
writeFileSync(join(outDir, 'report.md'), renderReport(result, { title: flag('title'), note: flag('note') }));

console.log(`integrity score ${result.score.score}/100, quantified leakage $${result.quantifiedExposure.toFixed(2)}`);
for (const f of result.findings) console.log(`  ${f.rule}: ${f.count} ${f.unit}${f.exposure.amount === null ? '' : `, $${f.exposure.amount.toFixed(2)}`}`);
for (const s of result.skipped) console.log(`  skipped ${s.rule}: ${s.reason}`);
console.log(`wrote ${join(outDir, 'findings.json')} and report.md`);
