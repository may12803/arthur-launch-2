#!/usr/bin/env node
// Load a JSONL file of outreach rows as DRAFTS. Nothing is approved and nothing is sent.
//   node scripts/outreach-import.mjs rows.jsonl            # report only (default): reads suppression, writes nothing
//   node scripts/outreach-import.mjs rows.jsonl --apply    # insert contacts + draft messages
//   node scripts/outreach-import.mjs rows.jsonl --local    # use an in-memory store (no credentials; suppression NOT checked)
// Env: NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL, NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY,
//      LOVELEEDAY_CONNECTORS_SERVER_SECRET (names only; values are never printed),
//      OUTREACH_BLOCKED_SEGMENTS (comma list, default: wire, cable, electrical supply, electrical distribution, Superior Essex, Essex).
import { readFileSync } from 'node:fs';
import { loadConfig } from '../lib/outreach/config.ts';
import { importRows, parseJsonl } from '../lib/outreach/import.ts';
import { MemoryStore, getOutreachStore } from '../lib/outreach/store.ts';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) { console.error('usage: outreach-import.mjs <rows.jsonl> [--apply] [--local]'); process.exit(1); }
const apply = args.includes('--apply');
const local = args.includes('--local');

const { rows, errors } = parseJsonl(readFileSync(file, 'utf8'));
const store = local ? new MemoryStore() : getOutreachStore();
if (local) console.error('note: --local uses an empty in-memory store; the live suppression list was NOT consulted.');
const summary = await importRows(store, loadConfig(process.env), rows, { apply });

console.log(JSON.stringify({ file, parseErrors: errors, applied: summary.applied, total: summary.total, counts: summary.counts }, null, 2));
for (const r of summary.results.filter((x) => x.outcome.startsWith('skipped'))) console.log(`skip ${r.id ?? '-'}: ${r.outcome}${r.detail ? ` (${r.detail})` : ''}`);
if (!apply) console.log('report only; re-run with --apply to write drafts.');
