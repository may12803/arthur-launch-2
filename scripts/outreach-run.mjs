#!/usr/bin/env node
// Plan or run today's outreach batch. DEFAULT AND ONLY SAFE MODE = dry run: renders exactly what would go out and writes nothing.
// `--live` is honoured only when OUTREACH_SENDING_ENABLED=1; otherwise it is downgraded to a dry run and says so.
// The shipped transport is a stub that throws, so even then nothing leaves until a provider is wired in a reviewed change.
import { runBatch } from '../lib/outreach/scheduler.ts';
import { getOutreachStore } from '../lib/outreach/store.ts';

const live = process.argv.includes('--live');
const full = !process.argv.includes('--summary');
const out = await runBatch(getOutreachStore(), process.env, { mode: live ? 'live' : 'dry-run' });
console.log(JSON.stringify({ mode: out.mode, sendingEnabled: out.sendingEnabled, cap: out.plan.cap, sentToday: out.plan.sentToday, wouldSend: out.plan.items.filter((i) => i.send).length, sent: out.sent, failed: out.failed }, null, 2));
for (const it of out.plan.items) {
  if (!it.send) { console.log(`skip ${it.message.to_email} step ${it.message.step}: ${it.reason}`); continue; }
  console.log(`would send ${it.message.to_email} step ${it.message.step}: ${it.rendered.subject}`);
  if (full) console.log(JSON.stringify({ headers: it.rendered.headers, text: it.rendered.text, html: it.rendered.html }, null, 2));
}
if (live && !out.sendingEnabled) console.log('--live ignored: OUTREACH_SENDING_ENABLED is not 1, nothing was sent.');
