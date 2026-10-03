#!/usr/bin/env node
// Tenant-isolation probe for the LOVELEEDAY client portal (bar 7: "a cross-tenant read returns 0 rows under RLS").
// Signs in as a user of tenant A (password + TOTP -> aal2, the same path the portal uses) and tries to read tenant B
// through (1) PostgREST tables, (2) SECURITY DEFINER RPCs, (3) the portal's own /api/client routes.
// Also checks anon and an aal1 (password-only) session see nothing.
//
// A pass means every planned check RAN and returned the expected answer. The probe fails (exit 1) on a leak, on any
// inconclusive result (non-200 own read, 404/5xx where a denial was expected, failed target inventory or B-fixture check, no own rows
// in a table, route positive control not exactly 200), and on any skipped check. It cannot pass vacuously.
// Output: one JSON line {mode, complete, tables_checked, rpcs_checked, routes_checked, unauthenticated_checked, expected, leaked_rows, failures, pass, ...}.
// Exit 1 on leak/failure, 2 on missing config.
//
// Env: ALL REQUIRED (a missing one is exit 2, never a silent skip).
//   PROBE_URL, PROBE_ANON_KEY            Supabase project (MUST be a branch/test db; production has no probe users)
//   PROBE_A_EMAIL, PROBE_A_PASSWORD, PROBE_A_TOTP   tenant A user
//   PROBE_A_TENANT, PROBE_B_TENANT       uuids
//   PROBE_STAFF_EMAIL, PROBE_STAFF_PASSWORD, PROBE_STAFF_TOTP   a STAFF user of the target (private.staff, MFA). Used ONLY for the
//                                        privileged read-only checks: staff_probe_inventory() (table inventory read from the target
//                                        database at probe time; never a file or env value) and staff_probe_fixture() (B's rows exist and
//                                        PROBE_B_* belong to B). Needs supabase/loveleeday/20261003_probe_staff_rpcs.sql on the target.
//   PROBE_B_DOC, PROBE_B_SHARE, PROBE_B_TASK        uuids of tenant B rows to aim route/RPC calls at
//   PROBE_BASE                           portal base URL (e.g. http://localhost:3000), running the code under test
// Fixture: scripts/tenant-isolation-fixture.sql (ids: tenant A aaaaaaaa-1111-4000-8000-00000000000a / B bbbbbbbb-1111-...,
// docs ...-4444-..., shares ...-5555-..., tasks ...-3333-...). Falsifiability: disable RLS on any table (or add a USING(true)
// policy) and re-run: leaked_rows > 0, exit 1; drop a table/grant or point at the wrong project: failures > 0, exit 1.
import crypto from "node:crypto";

const E = process.env;
const cfg = { url: E.PROBE_URL, anon: E.PROBE_ANON_KEY, email: E.PROBE_A_EMAIL, pass: E.PROBE_A_PASSWORD, totp: E.PROBE_A_TOTP,
  A: E.PROBE_A_TENANT, B: E.PROBE_B_TENANT, doc: E.PROBE_B_DOC, share: E.PROBE_B_SHARE, task: E.PROBE_B_TASK, base: E.PROBE_BASE,
  sEmail: E.PROBE_STAFF_EMAIL, sPass: E.PROBE_STAFF_PASSWORD, sTotp: E.PROBE_STAFF_TOTP };
const NAMES = { url: "PROBE_URL", anon: "PROBE_ANON_KEY", email: "PROBE_A_EMAIL", pass: "PROBE_A_PASSWORD", totp: "PROBE_A_TOTP", A: "PROBE_A_TENANT",
  B: "PROBE_B_TENANT", doc: "PROBE_B_DOC", share: "PROBE_B_SHARE", task: "PROBE_B_TASK", base: "PROBE_BASE",
  sEmail: "PROBE_STAFF_EMAIL", sPass: "PROBE_STAFF_PASSWORD", sTotp: "PROBE_STAFF_TOTP" };
const missing = Object.keys(NAMES).filter((k) => !cfg[k]);
if (missing.length) { console.error(`missing required config: ${missing.map((k) => NAMES[k]).join(", ")} (see header)`); process.exit(2); }

// Every client-data table and the column that carries its tenant. `tenants` is keyed by its own id.
// Anything exposed by PostgREST with a tenant_id column that is NOT listed here fails the probe (coverage check).
const TABLES = {
  audit_log: "tenant_id", contracts: "tenant_id", coverage_areas: "tenant_id", deliverables: "tenant_id", document_shares: "tenant_id",
  documents: "tenant_id", invites: "tenant_id", memberships: "tenant_id", staff_grants: "tenant_id", tenant_connections: "tenant_id",
  tenants: "id", workstream_decisions: "tenant_id", workstream_grades: "tenant_id", workstream_tasks: "tenant_id", workstreams: "tenant_id",
};
const GLOBAL_OK = new Set(["connectors"]); // shared platform catalog, no client data
const nTables = Object.keys(TABLES).length;

function totp(secret) {
  const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alpha.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = crypto.createHmac("sha1", key).update(ctr).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

const j = async (path, { token, method = "GET", body, headers } = {}) => {
  const r = await fetch(cfg.url + path, { method, headers: { apikey: cfg.anon, Authorization: `Bearer ${token || cfg.anon}`, "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
};

async function signIn(email = cfg.email, pass = cfg.pass, secret = cfg.totp) {
  const p = await j("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password: pass } });
  if (p.status !== 200) throw new Error(`password sign-in failed: ${p.status} ${JSON.stringify(p.data)}`);
  const aal1 = p.data;
  const f = await j("/auth/v1/factors", { token: aal1.access_token });
  const factor = (Array.isArray(f.data) ? f.data : (aal1.user?.factors || [])).find((x) => x.factor_type === "totp" && x.status === "verified") || aal1.user?.factors?.[0];
  if (!factor) throw new Error(`no verified TOTP factor for ${email}`);
  const ch = await j(`/auth/v1/factors/${factor.id}/challenge`, { token: aal1.access_token, method: "POST", body: {} });
  const v = await j(`/auth/v1/factors/${factor.id}/verify`, { token: aal1.access_token, method: "POST", body: { challenge_id: ch.data?.id, code: totp(secret) } });
  if (v.status !== 200) throw new Error(`mfa verify failed: ${v.status} ${JSON.stringify(v.data)}`);
  return { aal1: aal1.access_token, aal2: v.data };
}

const leaks = [];     // cross-tenant data or action observed
const failures = [];  // inconclusive: the check could not prove isolation (never a pass)
const leak = (where, detail, n = 1) => leaks.push({ where, detail, rows: n });
const fail = (where, detail) => failures.push({ where, detail });
const short = (x) => JSON.stringify(x)?.slice(0, 140);

// Authenticated own-tenant reads. Every table must answer 200, show tenant A its OWN rows (so an absent table, a missing
// SELECT grant or a broken session cannot look like isolation), show no other tenant's rows, and show NOTHING when aimed at B.
async function readTablesOwn(label, token) {
  let n = 0;
  for (const [t, col] of Object.entries(TABLES)) {
    n++;
    let ownSeen = false;
    for (let offset = 0; ; offset += 1000) {
      const all = await j(`/rest/v1/${t}?select=${col}&order=${col}.asc&limit=1000&offset=${offset}`, { token });
      if (all.status !== 200 || !Array.isArray(all.data)) { fail(`${label} GET ${t} (page ${offset})`, `expected 200 + array, got ${all.status} ${short(all.data)}`); break; }
      ownSeen ||= all.data.some((row) => row[col] === cfg.A);
      const bad = all.data.filter((row) => row[col] !== cfg.A);
      if (bad.length) leak(`${label} GET ${t} (page ${offset})`, `${bad.length} row(s) of tenant ${[...new Set(bad.map((x) => x[col]))].join(",")}`, bad.length);
      if (all.data.length < 1000) break;
    }
    if (!ownSeen) fail(`${label} GET ${t}`, "tenant A sees none of its own rows; table, grant, session or fixture is broken");
    const aimed = await j(`/rest/v1/${t}?select=${col}&${col}=eq.${cfg.B}`, { token });
    if (aimed.status !== 200 || !Array.isArray(aimed.data)) fail(`${label} GET ${t} (aimed-at-B)`, `expected 200 + array, got ${aimed.status} ${short(aimed.data)}`);
    else if (aimed.data.length) leak(`${label} GET ${t} (aimed-at-B)`, `${aimed.data.length} B row(s)`, aimed.data.length);
  }
  return n;
}

// anon / aal1: nothing at all may come back. A denial is 200 with no rows, or 401/403; anything else (404 absent table, 5xx) is inconclusive.
async function readTablesDenied(label, token) {
  let n = 0;
  for (const [t, col] of Object.entries(TABLES)) {
    n++;
    for (let offset = 0; ; offset += 1000) {
      const r = await j(`/rest/v1/${t}?select=${col}&order=${col}.asc&limit=1000&offset=${offset}`, { token });
      if (r.status === 200 && Array.isArray(r.data)) {
        if (r.data.length) leak(`${label} GET ${t} (page ${offset})`, `${r.data.length} row(s) visible without a strong session`, r.data.length);
        if (r.data.length < 1000) break;
      } else {
        if (r.status !== 401 && r.status !== 403) fail(`${label} GET ${t}`, `expected empty 200 or 401/403, got ${r.status} ${short(r.data)}`);
        break;
      }
    }
    const aimed = await j(`/rest/v1/${t}?select=${col}&${col}=eq.${cfg.B}`, { token });
    if (aimed.status === 200 && Array.isArray(aimed.data)) { if (aimed.data.length) leak(`${label} GET ${t} (aimed-at-B)`, `${aimed.data.length} row(s) visible`, aimed.data.length); }
    else if (aimed.status !== 401 && aimed.status !== 403) fail(`${label} GET ${t}`, `expected empty 200 or 401/403, got ${aimed.status} ${short(aimed.data)}`);

  }
  return n;
}

// P11: the table inventory is READ FROM THE TARGET DATABASE at probe time, by a staff-only SECURITY DEFINER RPC (catalog read), over the
// same connection the rest of the probe uses. It is never a file, an env value or a cached document, so it cannot be stale or describe a
// different project. Every one of the 16 named tables (15 below + the shared catalog) must exist, and ANY other relation in public fails the
// probe, with or without a tenant_id column: an unlisted tenant table must be added to TABLES (and so be tested) before the probe can pass.
async function coverage(staffToken) {
  const r = await j("/rest/v1/rpc/staff_probe_inventory", { token: staffToken, method: "POST", body: {} });
  const inv = r.status === 200 && r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : null;
  if (!inv || !Object.keys(inv).length) { fail("coverage", `staff_probe_inventory did not return an inventory (status ${r.status} ${short(r.data)}); the table list cannot be proven`); return { n: 0, source: null }; }
  for (const t of [...Object.keys(TABLES), ...GLOBAL_OK]) if (!(t in inv)) fail("coverage", `named table ${t} is not in the target database`);
  for (const [name, d] of Object.entries(inv)) {
    if (name in TABLES || GLOBAL_OK.has(name)) continue;
    const tenantCol = (d.columns || []).includes("tenant_id");
    fail("coverage", `public ${d.kind === "r" || d.kind === "p" ? "table" : "relation (kind " + d.kind + ")"} ${name}${tenantCol ? " (has tenant_id)" : ""} exists in the target database but is not in the probe's TABLES list`);
  }
  return { n: Object.keys(inv).length, source: "target-db:staff_probe_inventory" };
}

// P10: positive control for tenant B. A zero-row cross-tenant read only means isolation if B actually HAS rows there, and the ids the
// route/RPC checks aim at must really be B's. Read with the staff privileged RPC (bypasses RLS, read-only); any missing row fails the probe.
async function fixtureCheck(staffToken) {
  const r = await j("/rest/v1/rpc/staff_probe_fixture", { token: staffToken, method: "POST", body: { p_tenant: cfg.B, p_doc: cfg.doc, p_share: cfg.share, p_task: cfg.task } });
  if (r.status !== 200 || !r.data?.rows) { fail("fixture", `staff_probe_fixture did not answer (status ${r.status} ${short(r.data)}); tenant B's fixture is unconfirmed`); return null; }
  const empty = Object.entries(r.data.rows).filter(([, n]) => !(n > 0)).map(([t]) => t);
  for (const t of Object.keys(TABLES)) if (!(t in r.data.rows)) fail("fixture", `no B row count for ${t}`);
  if (empty.length) fail("fixture", `tenant B has no rows in: ${empty.join(", ")} (a zero-row cross-tenant read there proves nothing)`);
  for (const [label, got] of [["PROBE_B_DOC", r.data.doc_tenant], ["PROBE_B_SHARE", r.data.share_tenant], ["PROBE_B_TASK", r.data.task_tenant]]) {
    if (!got) fail("fixture", `${label} does not exist in the target database`);
    else if (got !== cfg.B) fail("fixture", `${label} belongs to tenant ${got}, not B (${cfg.B})`);
  }
  return { b_rows: r.data.rows, b_rows_missing: empty };
}

// Each RPC aimed at tenant B must be DENIED (a 2xx that returns/does something is a leak). 404 (function absent) and 5xx are inconclusive.
async function rpcs(token) {
  const rpc = (fn, args) => j(`/rest/v1/rpc/${fn}`, { token, method: "POST", body: args });
  let n = 0;
  const uploadArgs = { p_tenant: cfg.A, p_name: "probe-rpc.txt", p_content_type: "text/plain", p_data_b64: "cHJvYmU=" };
  const upload = await rpc("document_upload", uploadArgs);
  n++;
  const ownDoc = upload.status === 200 && typeof upload.data === "string" ? upload.data : null;
  if (!ownDoc) fail("rpc control document_upload", `own upload failed: ${upload.status} ${short(upload.data)}`);
  const taskRows = await j(`/rest/v1/workstream_tasks?select=id&tenant_id=eq.${cfg.A}&limit=1`, { token });
  const ownTask = taskRows.status === 200 ? taskRows.data?.[0]?.id : null;
  if (!ownTask) fail("rpc control workstream_decide", `own task unavailable: ${taskRows.status} ${short(taskRows.data)}`);
  const shareCreate = ownDoc ? await rpc("share_create", { p_document: ownDoc, p_email: "probe@probe.test", p_days: 1 }) : null;
  const shares = ownDoc ? await j(`/rest/v1/document_shares?select=id&document_id=eq.${ownDoc}&limit=1`, { token }) : null;
  const ownShare = shares?.status === 200 ? shares.data?.[0]?.id : null;
  if (!ownShare || shareCreate?.status !== 200) fail("rpc control share_revoke", `own share creation failed: ${shareCreate?.status} ${short(shareCreate?.data)}`);
  const calls = [
    ["list_tenant_team", { p_tenant: cfg.A }, { p_tenant: cfg.B }, (d) => Array.isArray(d) && d.length > 0],
    ["document_download", { p_id: ownDoc }, { p_id: cfg.doc }, (d) => Array.isArray(d) && d.length > 0],
    ["share_revoke", { p_share: ownShare }, { p_share: cfg.share }, (d, s) => s < 300],
    ["workstream_decide", { p_task: ownTask, p_decision: "approve" }, { p_task: cfg.task, p_decision: "approve" }, (d, s) => s < 300],
    ["document_upload", uploadArgs, { ...uploadArgs, p_tenant: cfg.B }, (d, s) => s < 300],
    ["tenant_set_external_sharing", { p_tenant: cfg.A, p_enabled: true }, { p_tenant: cfg.B, p_enabled: true }, (d, s) => s < 300],
    ["connection_request", { p_tenant: cfg.A, p_connector: "probe", p_kind: "request" }, { p_tenant: cfg.B, p_connector: "probe", p_kind: "request" }, (d, s) => s < 300],
  ];
  for (const [fn, ownArgs, otherArgs, isLeak] of calls) {
    n++;
    const control = fn === "document_upload" ? upload : await rpc(fn, ownArgs);
    if (control.status < 200 || control.status >= 300 || (fn === "list_tenant_team" || fn === "document_download") && !isLeak(control.data, control.status)) {
      fail(`rpc control ${fn}`, `own object failed: ${control.status} ${short(control.data)}`);
      continue;
    }
    const r = await rpc(fn, otherArgs);
    if (isLeak(r.data, r.status)) leak(`rpc ${fn}`, `status ${r.status}, body ${short(r.data)}`);
    else if (r.status === 404 || r.status >= 500 || r.status === 0) fail(`rpc ${fn}`, `inconclusive: status ${r.status} ${short(r.data)}`);
  }
  n++;
  const staff = await rpc("staff_list_tenants", {});
  if (staff.status >= 200 && staff.status < 300) leak("rpc staff_list_tenants", `unexpected success: ${staff.status}`);
  else if (staff.status === 404 || staff.status >= 500 || staff.status === 0) fail("rpc staff_list_tenants", `inconclusive: ${staff.status} ${short(staff.data)}`);
  if (ownDoc) {
    const cleanup = await rpc("document_delete", { p_id: ownDoc });
    if (cleanup.status < 200 || cleanup.status >= 300) fail("rpc cleanup", `own document cleanup failed: ${cleanup.status} ${short(cleanup.data)}`);
  }
  return n;
}

function sessionCookie(session) {
  const ref = new URL(cfg.url).hostname.split(".")[0];
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  const out = []; for (let i = 0; i * 3180 < value.length; i++) out.push(`${name}.${i}=${value.slice(i * 3180, (i + 1) * 3180)}`);
  return out.length === 1 ? `${name}=${value}` : out.join("; ");
}

// Routes: aimed at B each must answer 403/404 (or a 400 whose body says "not allowed"/"not found"); 2xx = tenant A acted
// on B; 401/5xx/other 400 = inconclusive (a broken session or route also "denies"). The positive control uploads a
// document as A, downloads it (exactly 200) and deletes it: that proves the session and the routes work, and cleans up.
async function routes(session) {
  const cookie = sessionCookie(session);
  const hit = (method, path, body, headers = {}) => fetch(cfg.base + path, { method, headers: { cookie, ...(body instanceof FormData ? {} : { "content-type": "application/json" }), ...headers }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: "manual" });
  const calls = [
    ["GET", `/api/client/documents/${cfg.doc}`], ["DELETE", `/api/client/documents/${cfg.doc}`],
    ["POST", `/api/client/documents/${cfg.doc}/share`, { email: "x@probe.test", days: 1 }],
    ["DELETE", `/api/client/shares/${cfg.share}`],
    ["POST", "/api/client/workstreams/decide", { task: cfg.task, decision: "approve" }],
  ];
  let n = 0;
  for (const [method, path, body] of calls) {
    n++;
    const r = await hit(method, path, body);
    const text = r.status === 400 ? await r.text() : "";
    if (r.status >= 200 && r.status < 300) leak(`route ${method} ${path}`, `status ${r.status} (tenant A acted on tenant B)`);
    else if (r.status === 400 ? !/not allowed|not found/i.test(text) : r.status !== 403 && r.status !== 404) fail(`route ${method} ${path}`, `expected a denial (403/404), got ${r.status} ${text.slice(0, 80)}`);
  }
  // positive control: A's own document, end to end (exactly 200 each), so a broken session cannot pass as isolation.
  const fd = new FormData(); fd.append("file", new Blob(["isolation probe"], { type: "text/plain" }), "probe-own.txt");
  n++;
  const up = await hit("POST", "/api/client/documents", fd);
  const upBody = up.status === 200 ? await up.json().catch(() => null) : null;
  const ownId = upBody?.id;
  if (!ownId) { fail("route control", `A could not upload its OWN document (status ${up.status}); route results are not trustworthy`); return n; }
  n++;
  const own = await hit("GET", `/api/client/documents/${ownId}`);
  if (own.status !== 200) fail("route control", `A's OWN document returned ${own.status}, expected exactly 200; route results are not trustworthy`);
  // active-tenant check (red team P1): naming a company the caller does not belong to must be refused on the same route.
  n++;
  const wrong = await hit("GET", `/api/client/documents/${ownId}`, undefined, { "x-tenant-id": cfg.B });
  if (wrong.status >= 200 && wrong.status < 300) leak("route active-tenant", `x-tenant-id=B accepted (status ${wrong.status})`);
  else if (wrong.status !== 403) fail("route active-tenant", `x-tenant-id=B expected 403, got ${wrong.status}`);
  n++;
  const del = await hit("DELETE", `/api/client/documents/${ownId}`);
  if (del.status !== 200) fail("route control", `cleanup of A's probe document returned ${del.status}`);
  return n;
}

const out = { target: new URL(cfg.url).hostname, tenant_a: cfg.A, tenant_b: cfg.B, mode: "full" };
const { aal1, aal2 } = await signIn();
const staff = await signIn(cfg.sEmail, cfg.sPass, cfg.sTotp);
out.fixture_b = await fixtureCheck(staff.aal2.access_token);
out.tables_checked = await readTablesOwn("A(aal2)", aal2.access_token);
{ const c = await coverage(staff.aal2.access_token); out.exposed_tables_seen = c.n; out.inventory_source = c.source; }
out.rpcs_checked = await rpcs(aal2.access_token);
out.routes_checked = await routes(aal2);
out.unauthenticated_checked = (await readTablesDenied("anon", cfg.anon)) + (await readTablesDenied("A(aal1, no MFA)", aal1));
out.session_aal = JSON.parse(Buffer.from(aal2.access_token.split(".")[1], "base64url").toString()).aal;
if (out.session_aal !== "aal2") fail("session", `expected aal2, got ${out.session_aal}`);
out.inventory_from_target_db = out.inventory_source === "target-db:staff_probe_inventory";
// Nothing may be skipped: the planned number of checks must equal the number that ran.
out.expected = { tables: nTables, rpcs: 9, routes: 9, unauthenticated: nTables * 2 };
for (const [k, got] of [["tables", out.tables_checked], ["rpcs", out.rpcs_checked], ["routes", out.routes_checked], ["unauthenticated", out.unauthenticated_checked]]) {
  if (got !== out.expected[k]) fail("completeness", `${k}: ran ${got}, expected ${out.expected[k]} (a check was skipped)`);
}
out.complete = !failures.some((f) => f.where === "completeness");
out.leaked_rows = leaks.reduce((s, l) => s + l.rows, 0);
out.leaks = leaks;
out.failures = failures;
out.pass = out.leaked_rows === 0 && failures.length === 0;
console.log(JSON.stringify(out));
process.exit(out.pass ? 0 : 1);
