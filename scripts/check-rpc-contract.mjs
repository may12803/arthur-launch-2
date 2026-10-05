#!/usr/bin/env node
// Every supabase .rpc("name", { p_x: ... }) call in app/ and lib/ must name a function the loveleeday migrations
// define, with argument names that function accepts and every argument it requires (no default). Exit 1 on drift.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const walk = (d, out = []) => {
  for (const f of readdirSync(d)) {
    if (f === "node_modules" || f.startsWith(".")) continue;
    const p = join(d, f);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
};

const fns = new Map();
for (const f of walk(join(root, "supabase/loveleeday")).filter((p) => p.endsWith(".sql") && !p.includes("rollback") && !p.includes("__tests__"))) {
  const sql = readFileSync(f, "utf8");
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns/gi)) {
    const args = m[2].split(",").map((a) => a.trim()).filter(Boolean).map((a) => ({ name: a.split(/\s+/)[0], optional: /\sdefault\s|=/i.test(a) }));
    fns.set(m[1], args);
  }
}

const problems = [];
let calls = 0;
// Only the client portal talks to the loveleeday project; the private dashboard's routes use the arthur project.
const PORTAL = /\/(app\/client|app\/api\/client|app\/api\/connectors|app\/api\/cron|app\/trust|lib\/client-portal|lib\/connectors)\//;
for (const f of walk(root).filter((p) => /\.(ts|tsx|mjs)$/.test(p) && PORTAL.test(p) && !p.includes("__tests__"))) {
  const src = readFileSync(f, "utf8");
  // .rpc("x", {...}) and the connector store's this.call("x", {...}), which injects p_secret itself.
  for (const m of src.matchAll(/(\.rpc|this\.call(?:<[^>]*>)?)\(\s*["'`]([a-z0-9_]+)["'`]\s*(?:,\s*\{([^}]*)\})?/g)) {
    calls++;
    const rel = f.slice(root.length);
    const def = fns.get(m[2]);
    if (!def) { problems.push(`${rel}: ${m[2]} is not defined in supabase/loveleeday`); continue; }
    const passed = [...(m[3] || "").matchAll(/(p_[a-z0-9_]+)\s*[:,}]|(p_[a-z0-9_]+)\s*$/g)].map((x) => x[1] || x[2]);
    if (m[1] !== ".rpc") passed.push("p_secret");
    m[1] = m[2]; m[2] = m[3];
    const known = new Set(def.map((a) => a.name));
    for (const p of passed) if (!known.has(p)) problems.push(`${rel}: ${m[1]} has no argument ${p} (accepts ${[...known].join(", ") || "none"})`);
    if (m[2] !== undefined) for (const a of def) if (!a.optional && !passed.includes(a.name)) problems.push(`${rel}: ${m[1]} call omits required ${a.name}`);
  }
}
console.log(`${calls} rpc calls checked against ${fns.size} functions`);
for (const p of problems) console.log("DRIFT " + p);
process.exit(problems.length ? 1 : 0);
