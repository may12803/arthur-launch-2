#!/usr/bin/env node
// Tenant-isolation probe for the LOVELEEDAY client portal (bar 7: "a cross-tenant read returns 0 rows under RLS").
// Signs in as a user of tenant A (password + TOTP -> aal2, the same path the portal uses) and tries to read tenant B
// through (1) PostgREST tables, (2) SECURITY DEFINER RPCs, (3) the portal's own /api/client routes (if PROBE_BASE set).
// Also checks anon and an aal1 (password-only) session see nothing.
// Output: one JSON line {tables_checked, rpcs_checked, routes_checked, unauthenticated_checked, leaked_rows, pass, ...}. Exit 1 on leak.
//
// Env (JSON in PROBE_CONFIG or individual vars):
//   PROBE_URL, PROBE_ANON_KEY            Supabase project (MUST be a branch/test db; production has no probe users)
//   PROBE_A_EMAIL, PROBE_A_PASSWORD, PROBE_A_TOTP   tenant A user
//   PROBE_A_TENANT, PROBE_B_TENANT       uuids
//   PROBE_B_DOC, PROBE_B_SHARE, PROBE_B_TASK        uuids of tenant B rows to aim route/RPC calls at
//   PROBE_BASE                           portal base URL (e.g. http://localhost:3000) for route checks; optional
// Fixture: scripts/tenant-isolation-fixture.sql. Falsifiability: disable RLS on any table (or add a USING(true) policy) and
// re-run: leaked_rows > 0, exit 1.
import crypto from "node:crypto";

const E = process.env;
const cfg = { url: E.PROBE_URL, anon: E.PROBE_ANON_KEY, email: E.PROBE_A_EMAIL, pass: E.PROBE_A_PASSWORD, totp: E.PROBE_A_TOTP,
  A: E.PROBE_A_TENANT, B: E.PROBE_B_TENANT, doc: E.PROBE_B_DOC, share: E.PROBE_B_SHARE, task: E.PROBE_B_TASK, base: E.PROBE_BASE };
for (const k of ["url", "anon", "email", "pass", "totp", "A", "B"]) if (!cfg[k]) { console.error(`missing config: ${k} (see header)`); process.exit(2); }

// Every client-data table and the column that carries its tenant. `tenants` is keyed by its own id.
// Anything exposed by PostgREST with a tenant_id column that is NOT listed here fails the probe (coverage check).
const TABLES = {
  audit_log: "tenant_id", contracts: "tenant_id", coverage_areas: "tenant_id", deliverables: "tenant_id", document_shares: "tenant_id",
  documents: "tenant_id", invites: "tenant_id", memberships: "tenant_id", staff_grants: "tenant_id", tenant_connections: "tenant_id",
  tenants: "id", workstream_decisions: "tenant_id", workstream_grades: "tenant_id", workstream_tasks: "tenant_id", workstreams: "tenant_id",
};
const GLOBAL_OK = new Set(["connectors"]); // shared platform catalog, no client data

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

async function signIn() {
  const p = await j("/auth/v1/token?grant_type=password", { method: "POST", body: { email: cfg.email, password: cfg.pass } });
  if (p.status !== 200) throw new Error(`password sign-in failed: ${p.status} ${JSON.stringify(p.data)}`);
  const aal1 = p.data;
  const f = await j("/auth/v1/factors", { token: aal1.access_token });
  const factor = (Array.isArray(f.data) ? f.data : (aal1.user?.factors || [])).find((x) => x.factor_type === "totp" && x.status === "verified") || aal1.user?.factors?.[0];
  if (!factor) throw new Error("no verified TOTP factor for tenant A user");
  const ch = await j(`/auth/v1/factors/${factor.id}/challenge`, { token: aal1.access_token, method: "POST", body: {} });
  const v = await j(`/auth/v1/factors/${factor.id}/verify`, { token: aal1.access_token, method: "POST", body: { challenge_id: ch.data?.id, code: totp(cfg.totp) } });
  if (v.status !== 200) throw new Error(`mfa verify failed: ${v.status} ${JSON.stringify(v.data)}`);
  return { aal1: aal1.access_token, aal2: v.data };
}

const leaks = [];
const leak = (where, detail, n = 1) => leaks.push({ where, detail, rows: n });

// Rows whose tenant key is not tenant A are a leak. Fetch unfiltered (what a malicious client would do) AND aimed at B.
async function readTables(label, token, allowedTenant, own = true) {
  let n = 0;
  for (const [t, col] of Object.entries(TABLES)) {
    n++;
    const all = await j(`/rest/v1/${t}?select=${col}&limit=1000`, { token });
    const aimed = await j(`/rest/v1/${t}?select=${col}&${col}=eq.${cfg.B}`, { token });
    for (const [kind, r] of [["unfiltered", all], ["aimed-at-B", aimed]]) {
      if (own && r.status === 200 && Array.isArray(r.data)) {
        const bad = r.data.filter((row) => row[col] !== allowedTenant);
        if (bad.length) leak(`${label} GET ${t} (${kind})`, `${bad.length} row(s) of tenant ${[...new Set(bad.map((x) => x[col]))].join(",")}`, bad.length);
      }
    }
    if (own === false) { /* anon / aal1: nothing at all should come back */
      for (const r of [all, aimed]) if (r.status === 200 && r.data.length) leak(`${label} GET ${t}`, `${r.data.length} row(s) visible without a strong session`, r.data.length);
    }
  }
  return n;
}

async function coverage(token) {
  const spec = await j("/rest/v1/", { token });
  const defs = spec.data?.definitions || {};
  const missing = Object.entries(defs).filter(([name, d]) => !(name in TABLES) && !GLOBAL_OK.has(name) && d.properties && ("tenant_id" in d.properties)).map(([name]) => name);
  for (const m of missing) leak("coverage", `exposed table ${m} has a tenant_id column but is not in the probe's TABLES list`);
  return Object.keys(defs).length;
}

async function rpcs(token) {
  const calls = [
    ["list_tenant_team", { p_tenant: cfg.B }, (d) => Array.isArray(d) && d.length > 0],
    ["document_download", { p_id: cfg.doc }, (d) => Array.isArray(d) && d.length > 0],
    ["share_revoke", { p_share: cfg.share }, (d, s) => s < 300],
    ["workstream_decide", { p_task: cfg.task, p_decision: "approve" }, (d, s) => s < 300],
    ["document_upload", { p_tenant: cfg.B, p_name: "probe.txt", p_content_type: "text/plain", p_data_b64: "cHJvYmU=" }, (d, s) => s < 300],
    ["tenant_set_external_sharing", { p_tenant: cfg.B, p_enabled: true }, (d, s) => s < 300],
    ["connection_request", { p_tenant: cfg.B, p_connector: "probe", p_kind: "request" }, (d, s) => s < 300],
    ["staff_list_tenants", {}, (d, s) => s < 300],
  ];
  let n = 0;
  for (const [fn, args, isLeak] of calls) {
    if (Object.values(args).some((v) => v === undefined)) continue;
    n++;
    const r = await j(`/rest/v1/rpc/${fn}`, { token, method: "POST", body: args });
    if (isLeak(r.data, r.status)) leak(`rpc ${fn}`, `status ${r.status}, body ${JSON.stringify(r.data).slice(0, 120)}`);
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

async function routes(session) {
  if (!cfg.base) return 0;
  const cookie = sessionCookie(session);
  const calls = [
    ["GET", `/api/client/documents/${cfg.doc}`], ["DELETE", `/api/client/documents/${cfg.doc}`],
    ["POST", `/api/client/documents/${cfg.doc}/share`, { email: "x@probe.test", days: 1 }],
    ["DELETE", `/api/client/shares/${cfg.share}`],
    ["POST", "/api/client/workstreams/decide", { task: cfg.task, decision: "approve" }],
  ];
  let n = 0;
  for (const [method, path, body] of calls) {
    if (path.includes("undefined")) continue;
    n++;
    const r = await fetch(cfg.base + path, { method, headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    if (r.status >= 200 && r.status < 300) leak(`route ${method} ${path}`, `status ${r.status} (tenant A acted on tenant B)`);
  }
  // control: the same route on A's OWN row must work, otherwise a 4xx proves nothing (a broken session also "passes").
  const own = await fetch(`${cfg.base}/api/client/documents/${E.PROBE_A_DOC || "aaaaaaaa-4444-4000-8000-00000000000a"}`, { headers: { cookie }, redirect: "manual" });
  if (own.status === 401 || own.status === 403) leak("route control", `A cannot reach its OWN document (status ${own.status}); route results are not trustworthy`);
  return n;
}

const out = { target: new URL(cfg.url).hostname, tenant_a: cfg.A, tenant_b: cfg.B };
const { aal1, aal2 } = await signIn();
let controlRows = 0;
{ // positive control: A must see its own rows, or every "0 leaked" is a broken-session false green.
  const own = await j(`/rest/v1/workstream_tasks?select=tenant_id&tenant_id=eq.${cfg.A}`, { token: aal2.access_token });
  controlRows = Array.isArray(own.data) ? own.data.length : 0;
  if (!controlRows) leak("control", "tenant A sees none of its own workstream_tasks; session or fixture is broken");
}
out.tables_checked = await readTables("A(aal2)", aal2.access_token, cfg.A);
out.exposed_tables_seen = await coverage(aal2.access_token);
out.rpcs_checked = await rpcs(aal2.access_token);
out.routes_checked = await routes(aal2);
out.unauthenticated_checked = (await readTables("anon", cfg.anon, null, false)) + (await readTables("A(aal1, no MFA)", aal1, null, false));
out.own_rows_control = controlRows;
out.session_aal = JSON.parse(Buffer.from(aal2.access_token.split(".")[1], "base64url").toString()).aal;
out.openapi_visible = out.exposed_tables_seen > 0;
out.leaked_rows = leaks.reduce((s, l) => s + l.rows, 0);
out.leaks = leaks;
out.pass = out.leaked_rows === 0;
console.log(JSON.stringify(out));
process.exit(out.pass ? 0 : 1);
