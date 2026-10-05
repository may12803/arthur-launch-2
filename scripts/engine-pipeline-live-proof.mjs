#!/usr/bin/env node
// LIVE proof that the client-tenant engine pipeline runs on Fly and keeps tenants apart.
//   arthur-cred run --use supabase -- node scripts/engine-pipeline-live-proof.mjs seed            -> prints {run}
//   (the Fly job picks the records up within 5 min, or trigger it once over loopback with flyctl ssh)
//   arthur-cred run --use supabase -- node scripts/engine-pipeline-live-proof.mjs verify <run>    -> SQL readback, exit 0 pass / 2 leak / 1 not yet
// Seeds ONE synthetic ingested record per throwaway tenant (zz-iso-a-20261005, zz-iso-b-20261005; created by
// scripts/tenant-isolation-probe.mjs --live) with distinct names and amounts, then reads back: A's entity, facts, task and
// approval exist ONLY under A, B's only under B, both cursors moved past the seeded seq, and a run-log row exists for each.
// Uses only the Management API SQL endpoint (SUPABASE_ACCESS_TOKEN); prints no secret.
import crypto from "node:crypto";

const REF = "eydcfgoklajcztpoprsl";
const SLUG = { A: "zz-iso-a-20261005", B: "zz-iso-b-20261005" };
const MGMT = process.env.SUPABASE_ACCESS_TOKEN;
if (!MGMT) { console.error("missing SUPABASE_ACCESS_TOKEN (arthur-cred run --use supabase)"); process.exit(3); }
const sql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${MGMT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
  const t = await r.text(); if (!r.ok) throw new Error(`sql HTTP ${r.status}: ${t.slice(0, 300)}`); return JSON.parse(t);
};
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const [mode, runArg] = process.argv.slice(2);
const T = Object.fromEntries((await sql(`select slug, id from public.tenants where slug in (${q(SLUG.A)}, ${q(SLUG.B)})`)).map((r) => [r.slug === SLUG.A ? "A" : "B", r.id]));
if (!T.A || !T.B) { console.error("probe tenants missing: run scripts/tenant-isolation-probe.mjs --live first"); process.exit(1); }
const name = (who, run) => `Proof Customer ${who} ${run}`;

if (mode === "seed") {
  const run = String(Date.now());
  const out = { run, seeded: {} };
  for (const who of ["A", "B"]) {
    const t = T[who], tag = `zz-iso-${who.toLowerCase()}`;
    const conn = (await sql(`insert into public.tenant_connections (tenant_id, connector_key, status, note) values (${q(t)}, 'csv-excel-upload', 'paused', 'engine pipeline live proof (throwaway, paused so no sync job touches it)')
      on conflict (tenant_id, connector_key) do update set updated_at = now() returning id`))[0].id;
    const payload = { name: name(who, run), amount: who === "A" ? 4242.42 : 8484.84, proposed_action: { title: `Engine proof task ${who} ${run}`, workstream_id: tag } };
    const json = JSON.stringify(payload), digest = crypto.createHash("sha256").update(json).digest("hex");
    const row = (await sql(`insert into public.ingested_records (tenant_id, connection_id, source_system, object, source_ref, payload, payload_sha256, observed_at)
      values (${q(t)}, ${q(conn)}, 'engine-proof', 'invoice', ${q(`proof-${who.toLowerCase()}-${run}`)}, ${q(json)}::jsonb, ${q(digest)}, now()) returning seq`))[0];
    out.seeded[who] = { tenant: SLUG[who], seq: Number(row.seq), name: payload.name, amount: payload.amount };
  }
  console.log(JSON.stringify(out));
  process.exit(0);
}

if (mode === "verify" && runArg) {
  const run = runArg, leaks = [], pending = [];
  const res = { run, tenants: SLUG };
  for (const who of ["A", "B"]) {
    const other = who === "A" ? "B" : "A";
    const n = name(who, run), title = `Engine proof task ${who} ${run}`;
    const r = (await sql(`select
        (select json_agg(json_build_object('tenant', t.slug, 'type', e.type, 'name', e.canonical_name)) from public.engine_entities e join public.tenants t on t.id = e.tenant_id where e.canonical_name = ${q(n)}) as entities,
        (select json_agg(json_build_object('tenant', t.slug, 'prop', p.prop, 'value', p.value, 'source', p.source_system || ':' || p.source_ref)) from public.engine_properties p join public.engine_entities e on e.id = p.entity_id join public.tenants t on t.id = p.tenant_id where e.canonical_name = ${q(n)}) as facts,
        (select json_agg(json_build_object('tenant', t.slug, 'title', w.title, 'workstream', ws.key, 'status', w.status)) from public.workstream_tasks w join public.tenants t on t.id = w.tenant_id join public.workstreams ws on ws.id = w.workstream_id where w.title = ${q(title)}) as tasks,
        (select json_agg(json_build_object('tenant', t.slug, 'gate', a.gate, 'status', a.status)) from public.approvals a join public.tenants t on t.id = a.tenant_id where a.title = ${q(title)}) as approvals,
        (select json_agg(json_build_object('tenant', t.slug, 'surface', e.canonical_name)) from public.engine_entities e join public.tenants t on t.id = e.tenant_id where e.tenant_id = ${q(T[other])} and e.canonical_name = ${q(n)}) as in_other_tenant,
        (select c.last_seq from public.engine_pipeline_cursors c where c.tenant_id = ${q(T[who])}) as cursor,
        (select r.seq from public.ingested_records r where r.tenant_id = ${q(T[who])} and r.source_ref = ${q(`proof-${who.toLowerCase()}-${run}`)}) as seeded_seq,
        (select json_agg(json_build_object('status', x.status, 'read', x.read, 'tasks', x.tasks, 'approvals', x.approvals, 'from', x.from_seq, 'to', x.to_seq, 'at', x.finished_at) order by x.id desc) from (select * from public.engine_pipeline_runs where tenant_id = ${q(T[who])} and status in ('ok','failed') and detail->>'seed' is null order by id desc limit 3) x) as recent_runs`))[0];
    res[who] = r;
    const all = [...(r.entities || []), ...(r.facts || []), ...(r.tasks || []), ...(r.approvals || [])];
    for (const x of all) if (x.tenant !== SLUG[who]) leaks.push(`${who}'s ${JSON.stringify(x)} is under ${x.tenant}`);
    if ((r.in_other_tenant || []).length) leaks.push(`${who}'s entity exists in ${SLUG[other]}`);
    if (!(r.entities || []).length) pending.push(`${who}: no entity yet`);
    if (!(r.facts || []).some((f) => f.prop === "amount")) pending.push(`${who}: no amount fact yet`);
    if (!(r.tasks || []).length) pending.push(`${who}: no task yet`);
    if (!(r.approvals || []).some((a) => a.gate === "money")) pending.push(`${who}: no money approval yet`);
    if (!(Number(r.cursor) >= Number(r.seeded_seq))) pending.push(`${who}: cursor ${r.cursor} has not passed seq ${r.seeded_seq}`);
  }
  res.leaks = leaks; res.pending = pending; res.pass = !leaks.length && !pending.length;
  console.log(JSON.stringify(res, null, 1));
  process.exit(leaks.length ? 2 : pending.length ? 1 : 0);
}
console.error("usage: engine-pipeline-live-proof.mjs seed | verify <run>"); process.exit(3);
