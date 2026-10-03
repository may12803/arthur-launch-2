// Red team PORTAL-1 P3: the isolation probe must refuse to run with any fixture id or the portal base missing
// (a silent skip of RPC/route checks used to still print pass: true). Offline: it exits before any network call.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const probe = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/tenant-isolation-probe.mjs");
const anon = (ref) => "h." + Buffer.from(JSON.stringify({ ref })).toString("base64url") + ".s";
const FULL = {
  PROBE_URL: "https://probefixture.invalid", PROBE_ANON_KEY: anon("probefixture"), PROBE_A_EMAIL: "a@probe.test", PROBE_A_PASSWORD: "p", PROBE_A_TOTP: "JBSWY3DPEHPK3PXP",
  PROBE_A_TENANT: "a", PROBE_B_TENANT: "b", PROBE_B_DOC: "d", PROBE_B_SHARE: "s", PROBE_B_TASK: "t", PROBE_BASE: "http://localhost:1",
  PROBE_STAFF_EMAIL: "s@probe.test", PROBE_STAFF_PASSWORD: "p", PROBE_STAFF_TOTP: "JBSWY3DPEHPK3PXP",
};
const run = (env) => spawnSync(process.execPath, [probe], { env: { PATH: process.env.PATH, ...env }, encoding: "utf8", timeout: 20000 });

for (const k of Object.keys(FULL)) {
  test(`probe exits 2 and names ${k} when it is missing`, () => {
    const { [k]: _omit, ...rest } = FULL;
    const r = run(rest);
    assert.equal(r.status, 2);
    assert.match(r.stderr, new RegExp(k));
  });
}

test("a complete config gets past the config gate (fails later on the network, never as a silent pass)", () => {
  const r = run(FULL);
  assert.notEqual(r.status, 2);
  assert.notEqual(r.status, 0);
});

// PORTAL-2 P11: the table inventory is read from the target database, never from a caller-supplied value or file.
import { readFileSync, readdirSync } from "node:fs";
test("probe takes no caller-supplied inventory and reads it from the target via the staff RPC", () => {
  const src = readFileSync(probe, "utf8");
  assert.ok(!/PROBE_DB_INVENTORY|readFileSync/.test(src.replace(/\/\/.*$/gm, "")));
  assert.match(src, /rpc\/staff_probe_inventory/);
  assert.match(src, /rpc\/staff_probe_fixture/);
});

// Codex round 4.
test("P23: the production project is refused before any network call", () => {
  const r = run({ ...FULL, PROBE_URL: "https://eydcfgoklajcztpoprsl.supabase.co", PROBE_ANON_KEY: anon("eydcfgoklajcztpoprsl") });
  assert.equal(r.status, 2); assert.match(r.stderr, /production project/);
});
test("P23: an anon key from another project than the URL is refused", () => {
  const r = run({ ...FULL, PROBE_ANON_KEY: anon("someotherproject") });
  assert.equal(r.status, 2); assert.match(r.stderr, /anon key belongs to project/);
});
test("P23: the runner checks the target-side fixture marker before any write", () => {
  const src = readFileSync(probe, "utf8");
  assert.match(src, /rpc\/staff_probe_target/);
  assert.ok(src.indexOf("staff_probe_target") < src.indexOf("await rpcs("), "marker is read before the RPC controls write");
});
test("P19: the table scan no longer depends on a page size", () => {
  const src = readFileSync(probe, "utf8").replace(/\/\/.*$/gm, "");
  assert.ok(!/\.length < 1000/.test(src) && !/offset/.test(src));
  assert.match(src, /neq\.\$\{cfg\.A\}/); assert.match(src, /is\.null/);
});
test("P20: every executable public function must be classified; the list comes from the target database", () => {
  const src = readFileSync(probe, "utf8");
  assert.match(src, /staff_probe_function_inventory/);
  assert.match(src, /but not classified in the probe/);
  const sql = readFileSync(path.join(path.dirname(probe), "../supabase/loveleeday/20261004_probe_staff_rpcs_r4.sql"), "utf8");
  assert.match(sql, /pg_proc/); assert.match(sql, /has_function_privilege\('authenticated'/); assert.match(sql, /has_function_privilege\('anon'/);
});
test("P20: every supabase.rpc() the routes call is classified in the probe", () => {
  const dir = path.join(path.dirname(probe), "../app/api/client"); const names = new Set();
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else for (const m of readFileSync(p, "utf8").matchAll(/\.rpc\("(\w+)"/g)) names.add(m[1]); } };
  walk(dir);
  const src = readFileSync(probe, "utf8");
  const block = src.slice(src.indexOf("const CLASSES"), src.indexOf("const CLASS_OF"));
  assert.ok(names.size >= 10);
  for (const n of names) assert.ok(block.includes(`"${n}"`), `${n} is called by a route but not classified in the probe`);
});
test("P21/P22: own-tenant controls exist for share, revoke and decide routes, and fixture state is reset around the RPC controls", () => {
  const src = readFileSync(probe, "utf8");
  for (const s of ["route control share", "route control share revoke", "route control decide"]) assert.ok(src.includes(s), s);
  assert.match(src, /reset\("before"\)/); assert.match(src, /reset\("after"\)/);
  assert.ok(!/p_decision: "approve"/.test(src), "controls never flip a task to in_progress");
});
