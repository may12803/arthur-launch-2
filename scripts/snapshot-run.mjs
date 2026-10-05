#!/usr/bin/env node
// Run the Free Snapshot pipeline (map, run rules, brief) on a CSV/XLSX or on the synthetic sample, locally, no network.
//   node scripts/snapshot-run.mjs --sample [--out=result.json]
//   node scripts/snapshot-run.mjs <file.csv|xlsx> [--as-of=YYYY-MM-DD] [--out=result.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseUpload } from '../lib/connectors/upload/parse.ts';
import { suggestMapping } from '../lib/snapshot/mapper.ts';
import { runSnapshot, todayIso } from '../lib/snapshot/run.ts';
import { buildBrief } from '../lib/snapshot/brief.ts';
import { sampleCsv } from '../lib/snapshot/sample.ts';

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const file = args.find((a) => !a.startsWith('--'));
let data, name, asOf = flag('as-of'), source = 'upload';
if (args.includes('--sample')) {
  const s = await sampleCsv();
  data = Buffer.from(s.text); name = s.filename; asOf = asOf ?? s.asOf; source = 'sample';
} else if (file) { data = readFileSync(file); name = file; asOf = asOf ?? todayIso(); } else { console.error('usage: snapshot-run.mjs --sample | <file>'); process.exit(1); }

const t = parseUpload(data, name);
const sug = await suggestMapping(t.header, t.rows, process.env.CEREBRAS_API_KEY ? { apiKey: process.env.CEREBRAS_API_KEY } : undefined);
const result = runSnapshot({ header: t.header, rows: t.rows, mapping: sug.mapping, asOf, source });
const out = { mapping: sug, result, brief: buildBrief(result) };
if (flag('out')) writeFileSync(flag('out'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ mapped: Object.fromEntries(Object.entries(sug.mapping).map(([k, v]) => [k, `${v.column} (${v.confidence})`])), unmapped: sug.unmapped_columns, llm: sug.llm }, null, 1));
console.log(`score ${result.score.score}  loss $${result.quantified_loss}  coverage ${result.coverage.score}%`);
for (const f of result.findings) console.log(`  ${f.rule}: ${f.count} ${f.unit} ${f.exposure.kind} ${f.exposure.amount ?? ''}`);
for (const s of result.skipped) console.log(`  skipped ${s.rule}: ${s.reason}`);
console.log(buildBrief(result).headline);
