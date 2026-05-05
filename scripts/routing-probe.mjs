#!/usr/bin/env node
// Routing verification probe.
// Sends a battery of representative prompts to the live arthur-online /api/chat,
// captures `tier_used` + `model_used` from the response, and asserts the route
// matches what the 18-tier ladder + Phase 6 promotion table should produce.
//
// Run:  node scripts/routing-probe.mjs
//   or: ARTHUR_HOST=https://arthur-online.fly.dev node scripts/routing-probe.mjs

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOST = process.env.ARTHUR_HOST || 'https://arthur-online.fly.dev';

function loadSecret() {
  if (process.env.ARTHUR_SECRET) return process.env.ARTHUR_SECRET;
  if (process.env.AUTOMATION_SECRET) return process.env.AUTOMATION_SECRET;
  try {
    const env = readFileSync(join(homedir(), '.arthur/.env'), 'utf8');
    const m = env.match(/^ARTHUR_SECRET=(.+)$/m) || env.match(/^AUTOMATION_SECRET=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch {}
  throw new Error('No ARTHUR_SECRET found');
}

// Tier expectations — what we *should* see for each prompt class.
// Today (day 0): patterns aren't yet promoted, so all tool-needing prompts route to T11 (Haiku).
// Conversational / arthur-meta prompts may route to chat-only tiers (Pioneer, Sonnet, etc.).
// Acceptable tiers per prompt = a SET (not a single value) so we don't fail on graceful fallbacks.
const PROBES = [
  // category, prompt, expected_tier_set, requires_tools
  { class: 'weather',       prompt: 'whats the weather',                                        accept: ['T4', 'T11', 'T12', 'T14'], tools: true },
  { class: 'live_sports',   prompt: 'whats the cavs score right now',                           accept: ['T4', 'T11', 'T12', 'T14'], tools: true },
  { class: 'web_search',    prompt: 'find the latest tariff news from china today',             accept: ['T4', 'T11', 'T12', 'T14'], tools: true },
  { class: 'inbox',         prompt: 'check my inbox for any catering inquiries',                accept: ['T4', 'T11', 'T12', 'T14'], tools: true },
  { class: 'memory',        prompt: 'what do you know about kronos',                            accept: ['T4', 'T11', 'T12', 'T14'], tools: true },
  { class: 'general_chat',  prompt: 'who are you',                                              accept: ['T3','T4','T5','T6','T7','T11','T14'], tools: false },
  { class: 'general_chat',  prompt: 'hi arthur how are you',                                    accept: ['T3','T4','T5','T6','T7','T11','T14'], tools: false },
  { class: 'meta_arthur',   prompt: 'describe your model hierarchy',                            accept: ['T3','T4','T6','T7','T11','T14'],      tools: false },
  // These should NEVER land in chat-only tiers when tools are required.
  { class: 'tool_required', prompt: 'whats happening in dabneys inbox right now',               forbid_chat_only: true,              tools: true },
  { class: 'tool_required', prompt: 'live score of the lions game',                             forbid_chat_only: true,              tools: true },
];

const CHAT_ONLY_TIERS = new Set(['T1','T2','T3','T5','T6','T7','T8','T9','T10']);

async function probe(p) {
  const t0 = Date.now();
  const res = await fetch(`${HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({ prompt: p.prompt, session_id: `routing-probe-${Date.now()}-${Math.random().toString(36).slice(2,6)}` }),
  });
  const dt = Date.now() - t0;
  if (!res.ok) return { ...p, ok: false, status: res.status, dt };
  const j = await res.json();
  const tier = j.tier_used || 'T?';
  const model = j.model_used || 'unknown';
  const tools = j.tool_calls_used || 0;
  return {
    ...p,
    ok: true,
    tier_used: tier,
    model_used: model,
    tools_used: tools,
    dt,
    sample: (j.response || '').slice(0, 80).replace(/\n/g, ' '),
  };
}

const SECRET = loadSecret();

console.log(`Routing probe → ${HOST}\n`);
console.log('class             tier  model                              tools  dt(ms) verdict');
console.log('────────────────────────────────────────────────────────────────────────────────');

let pass = 0, fail = 0, errors = 0;
const results = [];
for (const p of PROBES) {
  const r = await probe(p);
  results.push(r);
  if (!r.ok) {
    errors++;
    console.log(`${(p.class+'                ').slice(0,17)} ❌ HTTP ${r.status} (${r.dt}ms)`);
    continue;
  }
  let verdict = 'PASS';
  let why = '';
  if (p.accept && !p.accept.includes(r.tier_used)) {
    verdict = 'FAIL'; fail++;
    why = ` (expected ${p.accept.join('|')})`;
  } else if (p.forbid_chat_only && CHAT_ONLY_TIERS.has(r.tier_used)) {
    verdict = 'FAIL'; fail++;
    why = ' (chat-only tier on tool-required prompt!)';
  } else {
    pass++;
  }
  console.log(
    `${(p.class+'                ').slice(0,17)} ${(r.tier_used+'   ').slice(0,5)} ${(r.model_used+'                              ').slice(0,34)} ${String(r.tools_used).padStart(2)}     ${String(r.dt).padStart(5)}  ${verdict}${why}`
  );
}

console.log('────────────────────────────────────────────────────────────────────────────────');
console.log(`PASS=${pass}  FAIL=${fail}  ERRORS=${errors}  total=${PROBES.length}\n`);

// Per-tier histogram
const byTier = {};
for (const r of results) if (r.ok) byTier[r.tier_used] = (byTier[r.tier_used] || 0) + 1;
console.log('Tier distribution:');
for (const [t, n] of Object.entries(byTier).sort()) console.log(`  ${t}: ${n}`);

process.exit(fail > 0 || errors > 0 ? 1 : 0);
