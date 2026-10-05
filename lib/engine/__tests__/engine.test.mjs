// Portal engine (lib/engine): tenant isolation, gates, lineage, idempotent proposals, per-tenant failure isolation, Postgres-only
// storage. Every "must not" assertion has a positive control next to it so the test can fail.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTenantPipeline, gateFor } from "../pipeline.ts";
import { clientTenant } from "../context.ts";
import { pgClient, pgGraph, ingestReader, portalSink } from "../pg.ts";
import { runClientTenants } from "../run.ts";
import { isLoopback } from "../loopback.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const TA = "11111111-1111-1111-1111-111111111111", TB = "22222222-2222-2222-2222-222222222222";

// Minimal in-memory graph with the same contract as pgGraph (test double only; production has no non-Postgres graph).
export function memGraph() {
  const objs = new Map(), props = [];
  return {
    objs, props,
    async resolve(name) { for (const [id, o] of objs) if (o.name.toLowerCase() === String(name).toLowerCase()) return { object_id: id }; return null; },
    async upsertObject({ type, name }) { const id = `${type}:${name.toLowerCase()}`; objs.set(id, { type, name }); return id; },
    async setProp(id, prop, value, o) { if (!o.sourceSystem || !o.sourceRef) throw new Error("lineage required"); props.push({ id, prop, value: String(value), ...o }); },
    async currentRows() { return props.map((p) => ({ canonical_name: objs.get(p.id).name, prop: p.prop, value: p.value, value_num: Number.isFinite(Number(p.value)) ? Number(p.value) : null, source_system: p.sourceSystem, source_ref: p.sourceRef })); },
  };
}
export function memIO(records) {
  const asked = [], tasks = new Map(), approvals = new Map();
  return {
    reader: { asked, async readNew({ tenant, cursor }) { asked.push(tenant); const rows = records.filter((r) => r.tenant === tenant && (cursor == null || r.seq > cursor)); return { records: rows, nextCursor: rows.length ? rows.at(-1).seq : cursor }; } },
    sink: { tasks, approvals, async proposeTask(t) { if (!tasks.has(t.dedupe_key)) tasks.set(t.dedupe_key, t); }, async proposeApproval(a) { if (!approvals.has(a.source_ref)) approvals.set(a.source_ref, a); } },
  };
}
const rec = (tenant, over = {}) => ({ seq: 1, tenant, source_system: "stripe", object: "invoice", source_ref: "in_1", observed_at: "2026-10-05T12:00:00Z",
  payload: { name: "Acme Corp", amount: 1200, proposed_action: { title: "Collect Acme invoice", gate: "auto", workstream_id: "finance" } }, ...over });

test("context: missing tenant and house tenants are refused; a client slug passes (positive control)", () => {
  assert.throws(() => clientTenant(undefined, "t"), /tenant required/);
  for (const h of ["aspen-may", "dabney-and-co"]) assert.throws(() => clientTenant(h, "t"), /house tenant/);
  assert.throws(() => clientTenant("../x", "t"), /invalid tenant/);
  assert.equal(clientTenant("acme-co", "t"), "acme-co");
});

test("pipeline: refuses a house tenant before reading anything", async () => {
  const io = memIO([rec("dabney-and-co")]);
  await assert.rejects(runTenantPipeline({ tenant: "dabney-and-co", ...io, graph: memGraph() }), /house tenant/);
  assert.deepEqual(io.reader.asked, []);
});

test("pipeline: asks only for its tenant; a foreign record a leaky reader returns is dropped", async () => {
  const io = memIO([rec("tenant-a"), rec("tenant-b", { seq: 2, source_ref: "in_B" })]);
  const out = await runTenantPipeline({ tenant: "tenant-a", ...io, graph: memGraph() });
  assert.deepEqual(io.reader.asked, ["tenant-a"]);
  assert.equal(out.tasks.length, 1);
  const leaky = { async readNew() { return { records: [rec("tenant-b", { source_ref: "in_X" })] }; } };
  const o2 = await runTenantPipeline({ tenant: "tenant-a", reader: leaky, sink: io.sink, graph: memGraph() });
  assert.equal(o2.tasks.length, 0);
  assert.match(o2.rejected[0].reason, /belongs to tenant tenant-b/);
});

test("pipeline: gates route money/send/legal to approvals; a payload cannot lower a gate; unreadable gate fails strict", async () => {
  const mk = (object, ref, gate, i) => rec("tenant-a", { seq: i, object, source_ref: ref, payload: { name: `Co ${ref}`, amount: 10, proposed_action: { title: ref, ...(gate ? { gate } : {}) } } });
  const io = memIO([mk("invoice", "m", "auto", 1), mk("message", "s", null, 2), mk("contract", "l", null, 3), mk("note", "a", "auto", 4), mk("note", "esc", "money", 5)]);
  const out = await runTenantPipeline({ tenant: "tenant-a", ...io, graph: memGraph() });
  assert.deepEqual(Object.fromEntries(out.tasks.map((t) => [t.title, t.gate])), { m: "money", s: "send", l: "legal", a: "auto", esc: "money" });
  assert.deepEqual(out.approvals.map((a) => a.title).sort(), ["esc", "l", "m", "s"]);
  assert.equal(gateFor({ object: "note", payload: { proposed_action: { gate: "garbage" } } }), "legal");
});

test("pipeline: records without lineage are rejected; an unsupported figure never reaches a task", async () => {
  const g = memGraph();
  const io = memIO([rec("tenant-a", { source_ref: "" }), rec("tenant-a", { seq: 2, source_ref: "x", observed_at: null }), rec("tenant-a", { seq: 3, source_ref: "good" })]);
  const out = await runTenantPipeline({ tenant: "tenant-a", ...io, graph: g });
  assert.equal(out.rejected.length, 2);
  assert.equal(out.tasks.length, 1, "positive control: the good record becomes a task");
  // a graph that silently drops writes makes every figure UNSUPPORTED
  const lossy = { ...memGraph(), async setProp() {} };
  const o2 = await runTenantPipeline({ tenant: "tenant-a", ...memIO([rec("tenant-a")]), graph: lossy });
  assert.equal(o2.tasks.length, 0); assert.match(o2.unverified[0].reason, /amount: UNSUPPORTED/);
});

test("pipeline: an unrouted task is counted, not thrown, and its approval is still proposed", async () => {
  const io = memIO([rec("tenant-a", { object: "invoice" })]);
  const sink = { ...io.sink, async proposeTask() { return { unrouted: "no workstream" }; } };
  const out = await runTenantPipeline({ tenant: "tenant-a", reader: io.reader, sink, graph: memGraph() });
  assert.equal(out.tasks.length, 0); assert.equal(out.unrouted.length, 1); assert.equal(out.approvals.length, 1);
});

// ---- Postgres adapter against a recording fake PostgREST
function fakePg(handler) {
  const calls = [];
  const fetchImpl = async (u, init) => {
    const url = new URL(u); calls.push({ path: url.pathname.replace("/rest/v1/", ""), search: decodeURIComponent(url.search), method: init.method, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    const { status = 200, body = [] } = (await handler(calls.at(-1))) || {};
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

test("pg: every graph and reader query names the tenant_id; the key never appears in an error", async () => {
  const f = fakePg((c) => c.path === "engine_properties" ? { body: [] } : c.path === "ingested_records" ? { body: [{ seq: 7, tenant_id: TA, source_system: "s", object: "o", source_ref: "r", payload: {}, observed_at: "2026-10-05" }, { seq: 8, tenant_id: TB, source_system: "s", object: "o", source_ref: "r2", payload: {}, observed_at: "2026-10-05" }] } : c.path === "rpc/engine_resolve" ? { status: 500, body: { message: "boom sk-SECRET-KEY" } } : {});
  const db = pgClient({ url: "https://x.supabase.co", key: "sk-SECRET-KEY", fetchImpl: f.fetchImpl });
  const g = pgGraph(db, TA);
  await g.currentRows(); await g.lineage("e1", "amount"); await g.watches(); await g.links("e1");
  const r = await ingestReader(db, TA, "tenant-a").readNew({ cursor: 3, limit: 10 });
  for (const c of f.calls) assert.match(c.search, new RegExp(`tenant_id=eq\\.${TA}`), `${c.path} must filter on the tenant`);
  assert.match(f.calls.find((c) => c.path === "ingested_records").search, /seq=gt\.3/);
  assert.equal(r.records[0].tenant, "tenant-a", "positive control: own row stamped with the slug");
  assert.notEqual(r.records[1].tenant, "tenant-a", "a row of another tenant is stamped foreign so the pipeline rejects it");
  assert.equal(r.nextCursor, 8);
  await assert.rejects(g.resolve("x"), (e) => !/sk-SECRET-KEY/.test(e.message) && /\[redacted\]/.test(e.message));
  const rpcBody = f.calls.find((c) => c.path === "rpc/engine_resolve").body;
  assert.equal(rpcBody.p_tenant, TA);
});

test("pg sink: unknown workstream is unrouted, other errors throw, and a task of another tenant is refused", async () => {
  let mode = "unknown";
  const f = fakePg(() => mode === "unknown" ? { status: 400, body: { message: "unknown workstream" } } : mode === "down" ? { status: 503, body: { message: "down" } } : { body: "id" });
  const s = portalSink({ url: "https://x.supabase.co", anonKey: "anon", secret: "SEC", tenantId: TA, slug: "tenant-a", fetchImpl: f.fetchImpl });
  const task = { tenant: "tenant-a", workstream_id: "nope", title: "t", detail: "d", recommendation: null, evidence: { object_id: "e", lineage: [] }, gate: "auto", kind: "insight", dedupe_key: "k", proof: "p" };
  assert.deepEqual(await s.proposeTask(task), { unrouted: 'workstream "nope" does not exist in tenant-a' });
  assert.deepEqual(await s.proposeTask({ ...task, workstream_id: null }), { unrouted: "no workstream named in the record" });
  mode = "down"; await assert.rejects(s.proposeTask(task), (e) => /503/.test(e.message) && !/SEC/.test(e.message));
  mode = "ok"; assert.equal(await s.proposeTask(task), undefined, "positive control: a routed task returns nothing");
  await assert.rejects(s.proposeTask({ ...task, tenant: "tenant-b" }), /handed a task of tenant-b/);
  const sent = f.calls.filter((c) => c.path === "rpc/workstream_task_propose").at(-1).body;
  assert.equal(sent.p_tenant_slug, "tenant-a"); assert.equal(sent.p_workstream_key, "nope");
});

// ---- runner: per-tenant isolation
test("run: a failing tenant does not stop the others; cursor advances only on success; house tenants are skipped", async () => {
  const records = [rec("tenant-a", { seq: 5 }), rec("tenant-c", { seq: 9, source_ref: "c1" })];
  const advanced = [], logged = [], lines = [];
  const engine = {
    state: {
      async due() { return [{ tenant_id: TA, slug: "tenant-a", after_seq: 0, max_seq: 5 }, { tenant_id: TB, slug: "tenant-b", after_seq: 2, max_seq: 4 }, { tenant_id: TB, slug: "dabney-and-co", after_seq: 0, max_seq: 1 }, { tenant_id: TA, slug: "tenant-c", after_seq: 0, max_seq: 9 }]; },
      async advance(t, from, to) { advanced.push([t, from, to]); return true; },
      async logRun(r) { logged.push(r); },
    },
    graphFor: () => memGraph(),
    readerFor: (id, slug) => slug === "tenant-b" ? { async readNew() { throw new Error("b is broken"); } } : memIO(records).reader,
    sinkFor: () => memIO([]).sink,
  };
  const res = await runClientTenants(engine, { log: (s) => lines.push(s) });
  assert.deepEqual(res.map((r) => [r.tenant, r.status]), [["tenant-a", "ok"], ["tenant-b", "failed"], ["dabney-and-co", "skipped"], ["tenant-c", "ok"]]);
  assert.deepEqual(advanced, [[TA, 0, 5], [TA, 0, 9]], "b never advanced; a and c did");
  assert.ok(lines.includes("[tenant-pipeline] tenant=tenant-a read=1 tasks=1 approvals=1 rejected=0 unverified=0 unrouted=0 cursor=0->5"));
  assert.ok(lines.some((l) => /tenant=tenant-b FAILED: b is broken/.test(l)));
  assert.equal(logged.filter((l) => l.status === "failed").length, 1);
});

test("loopback: proxy headers or a public host are refused; 127.0.0.1 without proxy headers passes", () => {
  const h = (o) => ({ get: (k) => o[k.toLowerCase()] ?? null });
  assert.equal(isLoopback(h({ host: "127.0.0.1:3000" })), true);
  assert.equal(isLoopback(h({ host: "localhost:3000" })), true);
  assert.equal(isLoopback(h({ host: "127.0.0.1:3000", "fly-client-ip": "1.2.3.4" })), false);
  assert.equal(isLoopback(h({ host: "portal.loveleedaystudios.com" })), false);
  assert.equal(isLoopback(h({ host: "127.0.0.1:3000", "fly-forwarded-port": "443" })), false);
  // Next's server adds x-forwarded-for to its own loopback requests; it must not turn the scheduler away.
  assert.equal(isLoopback(h({ host: "127.0.0.1:3000", "x-forwarded-for": "127.0.0.1" })), true);
});

test("engine source is Postgres-only: no node:sqlite, no ~/.arthur paths, no Mac URLs", () => {
  const dir = path.join(here, "..");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
    assert.doesNotMatch(src, /node:sqlite|better-sqlite|\.sqlite|\.arthur|homedir|localhost:\d|ngrok|tailscale/i, `${f} must not reach the Mac or SQLite`);
  }
  const route = fs.readFileSync(path.join(here, "../../../app/api/cron/tenant-pipeline/route.ts"), "utf8");
  assert.match(route, /isLoopback\(req\.headers\)/); assert.match(route, /safeEqual\(given, secret\)/);
});
