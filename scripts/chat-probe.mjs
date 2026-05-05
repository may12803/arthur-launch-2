#!/usr/bin/env node
// Battery of chat probes against the live /api/chat endpoint.
// Auth: Bearer ARTHUR_SECRET (set in env).
// Usage:
//   ARTHUR_SECRET=... node scripts/chat-probe.mjs

const SECRET = process.env.ARTHUR_SECRET || "";
const BASE   = process.env.ARTHUR_BASE_URL || "https://arthur-online.fly.dev";

if (!SECRET) {
  console.error("✗ ARTHUR_SECRET not set");
  process.exit(2);
}

const PROBES = [
  // [class, prompt, expectations]
  { id: "P1", cls: "chat-only",   prompt: "what is 2 + 2", expect: { contains: ["4"], minLen: 1, toolCalls: 0 } },
  { id: "P2", cls: "tool/weather",prompt: "what is the weather", expect: { contains: ["°", "Kalamazoo"], minLen: 30, toolCalls: 1 } },
  { id: "P3", cls: "tool/web",    prompt: "who is the current US president", expect: { contains: ["Trump"], minLen: 20, toolCalls: 1 } },
  { id: "P4", cls: "tool/web",    prompt: "what is the current price of WTI crude oil", expect: { contains: ["$", "barrel"], minLen: 30, toolCalls: 1 } },
  { id: "P5", cls: "tool/inbox",  prompt: "any recent emails about leases", expect: { minLen: 20, toolCalls: 1 } },
  { id: "P6", cls: "tool/recent", prompt: "what have you done in the last 24 hours", expect: { minLen: 30, toolCalls: 1 } },
  { id: "P7", cls: "chat-only",   prompt: "in one sentence describe yourself", expect: { minLen: 20, toolCalls: 0 } },
  { id: "P8", cls: "tool/web",    prompt: "what is the score of the latest NBA finals game", expect: { minLen: 20, toolCalls: 1 } },
];

async function probe(p) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: p.prompt }),
      signal: AbortSignal.timeout(60000),
    });
    const elapsed = Date.now() - t0;
    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    const response = json?.response ?? json?.text ?? json?.message ?? "";
    const toolCallsUsed = json?.tool_calls_used ?? json?.routing?.tool_calls_used ?? 0;
    const provider = json?.routing?.model ?? json?.model ?? "?";

    // Evaluate expectations
    const issues = [];
    if (r.status !== 200) issues.push(`HTTP ${r.status}`);
    if (response.length < (p.expect.minLen ?? 1)) issues.push(`response too short (${response.length} chars)`);
    if (p.expect.contains) {
      for (const needle of p.expect.contains) {
        if (!response.toLowerCase().includes(needle.toLowerCase())) issues.push(`missing "${needle}"`);
      }
    }
    if (p.expect.toolCalls != null && toolCallsUsed !== p.expect.toolCalls) {
      issues.push(`expected ${p.expect.toolCalls} tool calls, got ${toolCallsUsed}`);
    }

    const verdict = issues.length === 0 ? "PASS" : "FAIL";
    return { ...p, verdict, issues, response, toolCallsUsed, provider, elapsed, status: r.status };
  } catch (e) {
    return { ...p, verdict: "ERROR", issues: [String(e.message || e)], response: "", toolCallsUsed: 0, provider: "?", elapsed: Date.now() - t0, status: 0 };
  }
}

const results = [];
for (const p of PROBES) {
  process.stdout.write(`[${p.id}] ${p.cls.padEnd(14)} ${p.prompt.slice(0, 50).padEnd(52)} ... `);
  const r = await probe(p);
  results.push(r);
  console.log(`${r.verdict} (${r.elapsed}ms, tools=${r.toolCallsUsed}, ${r.provider}) ${r.issues.length ? "- " + r.issues.join("; ") : ""}`);
}

// Detail block
console.log("\n--- responses ---");
for (const r of results) {
  console.log(`\n[${r.id}] ${r.prompt}`);
  console.log(`verdict: ${r.verdict}  status: ${r.status}  elapsed: ${r.elapsed}ms  tool_calls: ${r.toolCallsUsed}  provider: ${r.provider}`);
  console.log(`response (${r.response.length} chars):`);
  console.log(r.response.slice(0, 600) + (r.response.length > 600 ? "..." : ""));
  if (r.issues.length) console.log("ISSUES: " + r.issues.join(", "));
}

const passed = results.filter(r => r.verdict === "PASS").length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
