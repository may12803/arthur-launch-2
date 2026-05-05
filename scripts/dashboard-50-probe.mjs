#!/usr/bin/env node
// Drives the arthur-online /dashboard chat in Daniel's authed Chrome.
// Uses pbcopy + Cmd+V (System Events keystroke) so React's controlled-input
// state actually updates — direct JS value-setter injection is unreliable.

import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';

const PROMPTS = [
  ['identity', 'who are you'],
  ['identity', 'describe yourself'],
  ['identity', 'what model are you running on'],
  ['identity', 'describe your model hierarchy'],
  ['identity', 'are you claude or arthur'],
  ['status', 'hi arthur how are you'],
  ['status', 'what are you working on'],
  ['status', "what's the current cash position"],
  ['status', 'what nightly crons do you run'],
  ['status', 'how many training pairs do you have'],
  ['live-world', 'who is the president'],
  ['live-world', 'what is the price of bitcoin right now'],
  ['live-world', "what's the latest tariff news"],
  ['live-world', 'find me news on iran today'],
  ['live-world', 'is openai launching anything new this week'],
  ['live-world', 'price of gold today'],
  ['live-world', 'how is anthropic doing financially'],
  ['live-world', 'tesla stock price'],
  ['local', 'what is the price of gas'],
  ['local', "what's the weather"],
  ['local', "what's the weather in fort wayne"],
  ['local', 'restaurants near me open now'],
  ['local', "what's a good cocktail bar near downtown kalamazoo"],
  ['tv', 'what time does real housewives of atlanta come on'],
  ['tv', 'when does the new season of the bachelor start'],
  ['tv', 'is snl new tonight'],
  ['sports', "what's the cavs score"],
  ['sports', 'is the lions game on'],
  ['sports', 'who won the masters this year'],
  ['memory', 'what do you know about kronos'],
  ['memory', 'what did i decide about pricing for olldae'],
  ['memory', "what's my current dabney status"],
  ['memory', 'what feedback rules do i have on email'],
  ['inbox', 'check my inbox for any catering inquiries'],
  ['inbox', 'check my dabney inbox'],
  ['inbox', 'how many unread emails do i have'],
  ['calendar', "what's on my calendar tomorrow"],
  ['calendar', 'create a calendar event tomorrow at 3pm called arthur smoke test ending at 3:30pm'],
  ['calendar', 'any meetings this week'],
  ['action', 'send a test email to blackmarble.m.g@gmail.com with subject 50-probe and body hello from arthur smoke'],
  ['action', 'convert 250 USD to EUR'],
  ['action', 'validate this email: noreply@example.com'],
  ['math', 'what is 2+2'],
  ['math', 'what is the square root of pi'],
  ['math', 'what was the gross margin if revenue is 50000 and cogs is 32000'],
  ['math', 'how many days until christmas'],
  ['edge', 'youre wrong'],
  ['edge', 'no actually i meant tuesday'],
  ['edge', 'thanks'],
  ['edge', "what's the meaning of life"],
];

let SECRET = process.env.ARTHUR_SECRET;
if (!SECRET) {
  try {
    const env = readFileSync(`${process.env.HOME}/.arthur/.env`, 'utf8');
    SECRET = env.match(/^ARTHUR_SECRET=(.+)$/m)?.[1].trim();
  } catch {}
}
if (!SECRET) { console.error('No ARTHUR_SECRET'); process.exit(1); }

const HOST = 'https://arthur-online.fly.dev';
const OUT_LOG = '/tmp/dashboard-50-probe.jsonl';
const OUT_REPORT = '/tmp/dashboard-50-probe-report.md';
writeFileSync(OUT_LOG, '');

function sh(cmd, opts = {}) {
  return spawnSync('bash', ['-c', cmd], { encoding: 'utf8', ...opts });
}

function osa(script) {
  const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8' });
  return (r.stdout || '').trim();
}

function setClipboard(text) {
  spawnSync('pbcopy', [], { input: text });
}

// 1. Bring dashboard tab to front
function focusDashboardTab() {
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    repeat with i from 1 to count tabs of w
      set t to tab i of w
      if URL of t starts with "https://arthur-online.fly.dev/dashboard" then
        set active tab index of w to i
        set index of w to 1
        activate
        return "ok"
      end if
    end repeat
  end repeat
  tell window 1
    make new tab at end of tabs with properties {URL: "https://arthur-online.fly.dev/dashboard"}
    set active tab index to (count tabs)
  end tell
  activate
  return "opened"
end tell
`;
  return osa(script);
}

// 2. Type into composer via clipboard + Cmd+V
function pasteIntoComposer(prompt) {
  setClipboard(prompt);
  // Focus textarea, clear it, paste, then press Enter (which sends per dashboard's handleKey)
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if URL of t starts with "https://arthur-online.fly.dev/dashboard" then
        execute t javascript "(() => { const ta = document.querySelector('textarea'); if (ta) { ta.focus(); ta.select(); } })()"
        delay 0.2
        tell application "System Events"
          keystroke "v" using command down
        end tell
        delay 0.4
        tell application "System Events"
          key code 36
        end tell
        return "sent"
      end if
    end repeat
  end repeat
  return "no tab"
end tell
`;
  return osa(script);
}

function score(prompt, category, response) {
  const r = (response || '').toLowerCase();
  const issues = [];
  if (/\bi'?m claude\b|\bi am claude\b|\bas an ai\b|\blanguage model\b/.test(r)) issues.push('IDENTITY_LEAK');
  if (/\[(?:web_search|live_sports_score|get_weather|query_inbox|query_legal|query_brain_graph|query_memory)\]\s*[{(]/.test(response || '')) issues.push('TOOL_LEAK');
  if (/want me to (?:check|pull|look that up|search|verify)/.test(r)) issues.push('PERMISSION_ASK');
  if (/i tried to answer that but ended up writing the tool call/.test(r)) issues.push('SANITIZER_FALLBACK');
  if (/waiting (?:on|for) the (?:result|search|tool)/.test(r)) issues.push('ASYNC_PRETEND');
  if (/check espn|check nba\.com|check the official|check directly/.test(r)) issues.push('PUNT_TO_OTHER_SOURCE');
  if (category === 'local' && /\b(virginia|west virginia|roanoke)\b/i.test(response || '')) issues.push('WRONG_REGION_VIRGINIA');
  if (category === 'memory' && /nothing in your notes|no notes|don'?t have anything/.test(r) && /kronos|olldae|dabney|loveleeday/i.test(prompt)) issues.push('MEMORY_AMNESIA');
  if (category === 'identity' && /\b(haiku|cerebras|qwen)\b/.test(r) && !/\bi'?m arthur\b|\bi am arthur\b/i.test(r.slice(0, 100))) issues.push('LEADS_WITH_MODEL_NOT_ARTHUR');
  return { issues, pass: issues.length === 0 };
}

// 3. Independent API probe for objective scoring
async function apiProbe(prompt, idx) {
  const sessionId = `dash-50-probe-${Date.now()}-${idx}`;
  const t0 = Date.now();
  let json;
  try {
    const res = await fetch(`${HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ prompt, session_id: sessionId }),
    });
    json = await res.json();
  } catch (e) {
    json = { error: e.message };
  }
  return { dt: Date.now() - t0, json };
}

console.log(focusDashboardTab());
await new Promise(r => setTimeout(r, 1500));

console.log(`\nRunning 50 probes — watch Chrome dashboard.\n`);
const results = [];

for (let i = 0; i < PROMPTS.length; i++) {
  const [cat, p] = PROMPTS[i];

  // Visual: paste + Enter into the dashboard chat (Daniel sees this)
  pasteIntoComposer(p);

  // In parallel: run independent API probe for objective scoring
  const { dt, json } = await apiProbe(p, i);

  const tier = json.tier_used || 'T?';
  const tools = json.tool_calls_used ?? 0;
  const response = json.response || json.error || '(empty)';
  const sc = score(p, cat, response);
  const row = { idx: i, category: cat, prompt: p, tier, tools, dt_ms: dt, response_preview: response.slice(0, 240).replace(/\n/g, ' '), issues: sc.issues, pass: sc.pass };
  appendFileSync(OUT_LOG, JSON.stringify(row) + '\n');
  results.push(row);

  const flag = sc.pass ? '✓' : '✗ ' + sc.issues.join('|');
  console.log(`[${String(i + 1).padStart(2)}/50] ${cat.padEnd(10)} ${tier.padEnd(4)} ${String(tools).padStart(2)}t ${String(dt).padStart(5)}ms  ${flag}  "${p.slice(0, 60)}"`);

  // Pace so Daniel can read each one stream in
  await new Promise(r => setTimeout(r, 4500));
}

const passCount = results.filter(r => r.pass).length;
const failCount = results.length - passCount;
const tierDist = {};
for (const r of results) tierDist[r.tier] = (tierDist[r.tier] || 0) + 1;
const issueCounts = {};
for (const r of results) for (const it of r.issues) issueCounts[it] = (issueCounts[it] || 0) + 1;

let report = `# Dashboard 50-prompt probe — ${new Date().toISOString()}\n\n`;
report += `**PASS=${passCount} / FAIL=${failCount} / total=${results.length}**\n\n`;
report += `## Tier distribution\n`;
for (const [t, n] of Object.entries(tierDist).sort()) report += `- ${t}: ${n}\n`;
report += `\n## Issue counts (lower = better)\n`;
for (const [k, n] of Object.entries(issueCounts).sort((a, b) => b[1] - a[1])) report += `- ${k}: ${n}\n`;
report += `\n## Failures\n`;
for (const r of results.filter(x => !x.pass)) {
  report += `\n### [${r.category}] "${r.prompt}" — ${r.issues.join(', ')}\n`;
  report += `- Tier ${r.tier}, ${r.tools} tools, ${r.dt_ms}ms\n`;
  report += `- Response: ${r.response_preview}\n`;
}
writeFileSync(OUT_REPORT, report);

console.log(`\n=========================`);
console.log(`PASS=${passCount}/${results.length}  FAIL=${failCount}`);
console.log(`Tiers: ${JSON.stringify(tierDist)}`);
console.log(`Issues: ${JSON.stringify(issueCounts)}`);
console.log(`Report: ${OUT_REPORT}`);
