// Parity: the portal engine (lib/engine) is a port of ~/arthur lib/tenant/pipeline.mjs + lib/figures/gate.mjs verdictFor.
// This runs ONE fixture set through both copies and fails on any difference, so the two cannot drift silently.
// Both pipelines get the same storage (a scratch SQLite file each, through ~/arthur's ontology) so a difference can only come
// from the pipeline logic itself. Postgres storage is covered by engine.test.mjs and the live proof (scripts/engine-pipeline-live-proof.mjs).
// Needs the engine checkout: ARTHUR_ENGINE_DIR (default ~/arthur). Without it the test is SKIPPED with the reason printed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as Portal from "../pipeline.ts";
import * as PV from "../verdict.ts";

const ENGINE = process.env.ARTHUR_ENGINE_DIR || path.join(os.homedir(), "arthur");
const have = fs.existsSync(path.join(ENGINE, "lib/tenant/pipeline.mjs"));
const skip = have ? false : `engine checkout not found at ${ENGINE} (set ARTHUR_ENGINE_DIR)`;
const imp = (p) => import(pathToFileURL(path.join(ENGINE, p)).href);

const T = "tenant-parity";
const base = { tenant: T, source_system: "stripe", object: "invoice", observed_at: "2026-10-05T12:00:00Z" };
const FIXTURES = [
  { ...base, seq: 1, source_ref: "in_1", payload: { name: "Acme Corp", amount: 1200, proposed_action: { title: "Collect Acme invoice", workstream_id: "finance" } } },
  { ...base, seq: 2, source_ref: "in_2", payload: { name: "Acme Corp", amount: "$1,350.50", currency: "usd" } },
  { ...base, seq: 3, object: "message", source_ref: "m_1", payload: { customer_name: "Bolt Ltd", unread: 3, proposed_action: { title: "Reply to Bolt", gate: "auto" } } },
  { ...base, seq: 4, object: "contract", source_ref: "c_1", payload: { company: "Cedar LLC", value: 50000 } },
  { ...base, seq: 5, object: "note", source_ref: "n_1", payload: { name: "Dune Co", score: 7, proposed_action: { title: "Escalate Dune", gate: "money", recommendation: "call" } } },
  { ...base, seq: 6, object: "note", source_ref: "n_2", payload: { name: "Echo Inc", score: 2, proposed_action: { title: "Garbage gate", gate: "nonsense" } } },
  { ...base, seq: 7, source_ref: "", payload: { name: "No Lineage", amount: 1 } },
  { ...base, seq: 8, source_ref: "in_8", observed_at: null, payload: { name: "No Observed", amount: 1 } },
  { ...base, seq: 9, tenant: "someone-else", source_ref: "in_9", payload: { name: "Foreign", amount: 9 } },
  { ...base, seq: 10, source_ref: "in_10", payload: { amount: 10 } },
  { ...base, seq: 11, source_ref: "in_11", payload: { name: "Only Objects", nested: { a: 1 } } },
  { ...base, seq: 12, object: "customer", source_ref: "cu_1", payload: { name: "Fjord AS", status: "active", proposed_action: { title: "Welcome Fjord" } } },
  { ...base, seq: 13, object: "vendor_payment", source_ref: "vp_1", payload_sha256: "abc123", payload: { vendor_name: "Gale GmbH", total: 99.99, proposed_action: { title: "Pay Gale", gate: "send" } } },
  { ...base, seq: 14, source_ref: "in_14", valid_from: "2026-09-01T00:00:00Z", payload: { name: "Acme Corp", amount: 1200, proposed_action: { title: "Collect Acme invoice", workstream_id: "finance" } } },
];

function memIO(records) {
  const tasks = [], approvals = [];
  return { reader: { async readNew({ tenant, cursor }) { const rows = records.filter((r) => r.tenant === tenant || r.seq === 9).filter((r) => cursor == null || r.seq > cursor); return { records: rows, nextCursor: rows.length ? rows.at(-1).seq : cursor }; } },
    sink: { tasks, approvals, async proposeTask(t) { tasks.push(t); }, async proposeApproval(a) { approvals.push(a); } } };
}
const norm = (out, sink) => JSON.parse(JSON.stringify({
  read: out.read, cursor: out.cursor, rejected: out.rejected, unverified: out.unverified,
  tasks: out.tasks.map(({ evidence, ...t }) => ({ ...t, lineage: evidence.lineage })),
  approvals: out.approvals.map(({ proposed, ...a }) => ({ ...a, action: proposed.action, source: proposed.source })),
  sunk: [sink.tasks.length, sink.approvals.length],
}));

test("parity: gateFor / floorGate / lineageProblem agree with ~/arthur on every case", { skip }, async () => {
  const M = await imp("lib/tenant/pipeline.mjs");
  const objects = ["invoice", "bill", "vendor_payment", "message", "email_reply", "contract", "nda", "note", "customer", "", "LICENSE", "subscription_change", "post"];
  const gates = [undefined, "auto", "send", "money", "legal", "MONEY", "nonsense", ""];
  for (const o of objects) {
    assert.equal(Portal.floorGate(o), M.floorGate(o), `floorGate(${o})`);
    for (const g of gates) { const r = { object: o, payload: { proposed_action: g === undefined ? undefined : { gate: g } } }; assert.equal(Portal.gateFor(r), M.gateFor(r), `gateFor(${o}, ${g})`); }
  }
  for (const r of FIXTURES) assert.equal(Portal.lineageProblem(r), M.lineageProblem(r));
});

test("parity: verdictFor agrees with ~/arthur lib/figures/gate.mjs on every case", { skip }, async () => {
  const G = await imp("lib/figures/gate.mjs");
  const rows = [
    { canonical_name: "Acme Corp", prop: "amount", value: "1200", value_num: 1200, source_system: "stripe", source_ref: "invoice:in_1" },
    { canonical_name: "Bolt Ltd", prop: "open_balance", value: "$5,000", value_num: null, source_system: "xero", source_ref: "inv:9" },
    { canonical_name: "Cedar", prop: "guests", value: "70", value_num: 70, source_system: null, source_ref: null },
    { canonical_name: "Dune", prop: "score", value: "7", value_num: 7, source_system: "crm", source_ref: "x" },
  ];
  const claims = [[1200, "Acme Corp amount"], [1200, "something else"], [1205, "Acme amount"], [1250, "Acme amount"], [1206.5, "Acme amount"],[5000, "Bolt Ltd balance"], [70, "a 70-guest buyout"], [7, "Dune score"], [7, "the scores"], [1, "nothing"], [0, "zero"]];
  for (const [n, claim] of claims) assert.deepEqual(PV.verdictFor({ n }, claim, rows), G.verdictFor({ n }, claim, rows), `verdictFor(${n}, ${claim})`);
});

test("parity: the full pipeline gives identical tasks, approvals, rejections and verdicts on the same fixtures", { skip }, async () => {
  const M = await imp("lib/tenant/pipeline.mjs");
  const O = await imp("lib/ontology/index.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-parity-"));
  const dbM = O.open(path.join(dir, "mac.sqlite")), dbP = O.open(path.join(dir, "portal.sqlite"));
  // The portal pipeline's graph, over the SAME ontology code the Mac pipeline uses, so storage cannot be the difference.
  const graph = {
    resolve: async (name) => O.resolve(dbP, name, { tenant: T }),
    upsertObject: async (a) => O.upsertObject(dbP, { ...a, tenant: T }),
    setProp: async (id, prop, value, o) => O.setProp(dbP, id, prop, value, o),
    currentRows: async () => dbP.prepare(`SELECT o.canonical_name, p.prop, p.value, p.value_num, p.source_system, p.source_ref, p.observed_at FROM onto_props p JOIN onto_objects o ON o.object_id = p.object_id WHERE p.superseded_by IS NULL AND o.tenant = ? AND p.tenant = ?`).all(T, T),
  };
  const ioM = memIO(FIXTURES), ioP = memIO(FIXTURES);
  const outM = await M.runTenantPipeline({ tenant: T, reader: ioM.reader, sink: ioM.sink, db: dbM });
  const outP = await Portal.runTenantPipeline({ tenant: T, reader: ioP.reader, sink: ioP.sink, graph });
  assert.equal(outP.unrouted.length, 0);
  const a = norm(outM, ioM.sink), b = norm(outP, ioP.sink);
  assert.ok(a.tasks.length >= 5 && a.approvals.length >= 3 && a.rejected.length >= 4, `fixtures must exercise every branch (got ${a.tasks.length} tasks, ${a.approvals.length} approvals, ${a.rejected.length} rejected)`);
  assert.deepEqual(b, a);
});
