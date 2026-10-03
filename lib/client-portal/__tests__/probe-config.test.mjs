// Red team PORTAL-1 P3: the isolation probe must refuse to run with any fixture id or the portal base missing
// (a silent skip of RPC/route checks used to still print pass: true). Offline: it exits before any network call.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const probe = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/tenant-isolation-probe.mjs");
const FULL = {
  PROBE_URL: "https://example.invalid", PROBE_ANON_KEY: "k", PROBE_A_EMAIL: "a@probe.test", PROBE_A_PASSWORD: "p", PROBE_A_TOTP: "JBSWY3DPEHPK3PXP",
  PROBE_A_TENANT: "a", PROBE_B_TENANT: "b", PROBE_B_DOC: "d", PROBE_B_SHARE: "s", PROBE_B_TASK: "t", PROBE_BASE: "http://localhost:1",
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
