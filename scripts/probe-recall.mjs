#!/usr/bin/env node
/**
 * probe-recall.mjs — assert dashboard semantic recall actually returns hits.
 *
 * WHY: recall was silently dead for weeks. embedUrl was unset, fell back to
 * http://localhost:11434 (unresolvable from Fly), and every turn returned zero
 * hits with no error — indistinguishable from "the corpus had no match".
 * A 200 proves nothing here. This probe asserts REAL HITS come back for a
 * query whose answer is known to be in the corpus.
 *
 *   node scripts/probe-recall.mjs
 *
 * Exits non-zero on: transport failure, memory_error set, or zero hits.
 */
import fs from "fs";
import os from "os";
import path from "path";

const VAULT = path.join(os.homedir(), ".arthur/vault/arthur-online-dashboard.env");
const HOST = process.env.PROBE_HOST || "https://arthur-online.fly.dev";

// A phrase drawn from a row known to be present in arthur_corpus_embeddings.
// If the corpus is ever rebuilt, update this to any phrase still in it.
const QUERY = process.env.PROBE_QUERY || "get ready for a battle test";

function creds() {
  const env = {};
  for (const line of fs.readFileSync(VAULT, "utf8").split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*)$/.exec(line);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return Buffer.from(`${env.ARTHUR_ONLINE_USER}:${env.ARTHUR_ONLINE_PASSWORD}`).toString("base64");
}

const res = await fetch(`${HOST}/api/chat`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    Authorization: `Basic ${creds()}`,
  },
  body: JSON.stringify({ prompt: QUERY, stream: true }),
});

if (!res.ok || !res.body) {
  console.error(`FAIL: HTTP ${res.status}`);
  process.exit(1);
}

const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = "";
let done = null;
for (;;) {
  const { done: fin, value } = await reader.read();
  if (fin) break;
  buf += dec.decode(value, { stream: true });
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line.startsWith("data:")) continue;
    try {
      const ev = JSON.parse(line.slice(5).trim());
      if (ev.type === "done") done = ev;
    } catch { /* partial */ }
  }
}

if (!done) {
  console.error("FAIL: stream ended with no done event");
  process.exit(1);
}
if (done.memory_error) {
  console.error(`FAIL: recall errored — ${done.memory_error}`);
  process.exit(1);
}
if (!done.memory_hits || done.memory_hits < 1) {
  console.error(
    `FAIL: recall returned ${done.memory_hits ?? 0} hits for a query known to be in the corpus. ` +
    `This is the silent-zero failure mode — a broken embedder looks identical to an empty corpus.`
  );
  process.exit(1);
}

console.log(`PASS: recall returned ${done.memory_hits} hit(s) for "${QUERY}" (model=${done.model_used}, ${done.latency_ms}ms)`);
