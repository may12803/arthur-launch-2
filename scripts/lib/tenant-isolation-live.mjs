// LIVE tenant-isolation probe for the LOVELEEDAY portal project (eydcfgoklajcztpoprsl) and portal.loveleedaystudios.com.
// Entry: node scripts/tenant-isolation-probe.mjs --live   (the default mode of that script is the branch-database fixture probe).
//
//   arthur-cred run --use supabase,supabase-loveleeday -- node scripts/tenant-isolation-probe.mjs --live [--base https://portal.loveleedaystudios.com]
//
// What it proves, with two THROWAWAY tenants that stay in place so the probe can re-run:
//   tenants  zz-iso-a-20261005, zz-iso-b-20261005   ("ZZ ISOLATION PROBE ... do not use")
//   users    zz-iso-a-20261005@probe.loveleedaystudios.com, zz-iso-b-20261005@probe.loveleedaystudios.com (owner of their own tenant only)
// 1. RLS with REAL JWTs: each user signs in through the Auth API with the anon key (password -> aal1), enrolls TOTP and verifies it
//    (-> aal2). For EVERY public table with a tenant_id column (inventory read from the live catalog at run time) plus `tenants`:
//    A reads 0 rows of B and 0 rows of any tenant but A (and the symmetric B->A); an aal1 (password-only) session reads 0 rows even of
//    its own tenant (the restrictive MFA policy); the anon key with no JWT reads 0. Positive control: A reads its OWN seeded rows.
// 2. RPCs that take p_tenant, aimed at the other tenant, are refused; the engine write/read RPCs are refused to members and anon.
//    Side-effect check: after the run, the database shows no row the probe could have created in the other tenant.
// 3. The portal API (app/api/client/*) as A against B: 403 tenant_not_member; as A against A: the route gets past the tenant check
//    (positive control); with no session: 401; with an aal1 session: 403.
// Exit: 0 pass, 2 any LEAK, 1 inconclusive (a check could not run or a positive control failed), 3 missing config.
// Secrets: names only. The service-role key is fetched from the Management API into memory; passwords are random per run; nothing
// secret is printed.
import crypto from "node:crypto";

const REF = "eydcfgoklajcztpoprsl";
const SLUG = { A: "zz-iso-a-20261005", B: "zz-iso-b-20261005" };
const EMAIL = { A: `${SLUG.A}@probe.loveleedaystudios.com`, B: `${SLUG.B}@probe.loveleedaystudios.com` };
const SEEDED = ["workstreams", "coverage_areas", "contracts", "deliverables", "entities", "engine_entities", "engine_aliases", "engine_properties", "engine_mentions", "memberships", "tenants"];

export async function main(argv = process.argv) {
  const E = process.env;
  const arg = (k) => { const i = argv.indexOf(`--${k}`); return i > 0 ? argv[i + 1] : undefined; };
  const BASE = arg("base") || "https://portal.loveleedaystudios.com";
  const URL_ = E.SUPABASE_LOVELEEDAY_URL || `https://${REF}.supabase.co`;
  const ANON = E.SUPABASE_LOVELEEDAY_ANON_KEY || E.SUPABASE_LOVELEEDAY_PUBLISHABLE_KEY;
  const MGMT = E.SUPABASE_ACCESS_TOKEN;
  if (!ANON || !MGMT) { console.error("missing config: SUPABASE_LOVELEEDAY_ANON_KEY and SUPABASE_ACCESS_TOKEN (arthur-cred run --use supabase,supabase-loveleeday)"); return 3; }
  if (new URL(URL_).hostname.split(".")[0] !== REF) { console.error(`refusing: ${URL_} is not project ${REF}`); return 3; }

  const leaks = [], failures = [], log = [];
  const leak = (where, detail) => { leaks.push({ where, detail }); log.push(`LEAK  ${where}: ${detail}`); };
  const fail = (where, detail) => { failures.push({ where, detail }); log.push(`FAIL  ${where}: ${detail}`); };
  const ok = (where, detail = "") => log.push(`ok    ${where}${detail ? `: ${detail}` : ""}`);
  const short = (x) => String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 140);

  const sql = async (query) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${MGMT}`, "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
    const t = await r.text(); if (!r.ok) throw new Error(`sql HTTP ${r.status}: ${t.slice(0, 300)}`); return JSON.parse(t);
  };
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${MGMT}` } })).json();
  const SERVICE = keys.find?.((k) => k.name === "service_role")?.api_key;
  if (!SERVICE) { console.error("could not obtain the service_role key from the Management API"); return 3; }
  const red = (s) => String(s).split(SERVICE).join("[redacted]");

  const j = async (path, { token, method = "GET", body, apikey = ANON, headers = {} } = {}) => {
    const r = await fetch(URL_ + path, { method, headers: { apikey, ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text(); let data = t; try { data = t ? JSON.parse(t) : null; } catch { /* text */ }
    return { status: r.status, data };
  };
  const admin = (path, opts = {}) => j(`/auth/v1/admin${path}`, { ...opts, apikey: SERVICE, token: SERVICE });

  // ---------- setup (idempotent) ----------
  const started = new Date().toISOString();
  await sql(`insert into public.tenants (name, slug, status) values
      ('ZZ ISOLATION PROBE A (throwaway, do not use)', '${SLUG.A}', 'active'),
      ('ZZ ISOLATION PROBE B (throwaway, do not use)', '${SLUG.B}', 'active')
    on conflict (slug) do nothing`);
  const trows = await sql(`select slug, id from public.tenants where slug in ('${SLUG.A}','${SLUG.B}')`);
  const T = Object.fromEntries(trows.map((r) => [r.slug === SLUG.A ? "A" : "B", r.id]));
  if (!T.A || !T.B) { console.error("probe tenants missing after setup"); return 1; }

  const users = {};
  for (const who of ["A", "B"]) {
    const password = crypto.randomBytes(24).toString("base64url");
    let uid = (await sql(`select id from auth.users where email = '${EMAIL[who]}'`))[0]?.id;
    if (!uid) {
      const c = await admin("/users", { method: "POST", body: { email: EMAIL[who], password, email_confirm: true, user_metadata: { purpose: "tenant isolation probe (throwaway)" } } });
      if (c.status >= 300) { console.error(`create user ${who}: ${c.status} ${red(short(c.data))}`); return 1; }
      uid = c.data.id;
    } else {
      const u = await admin(`/users/${uid}`, { method: "PUT", body: { password } });
      if (u.status >= 300) { console.error(`reset user ${who}: ${u.status} ${red(short(u.data))}`); return 1; }
    }
    const fs = await admin(`/users/${uid}/factors`);
    for (const f of Array.isArray(fs.data) ? fs.data : []) await admin(`/users/${uid}/factors/${f.id}`, { method: "DELETE" });
    users[who] = { uid, password };
  }
  await sql(`insert into public.memberships (tenant_id, user_id, role, accepted_at)
      select v.t::uuid, v.u::uuid, 'owner', now() from (values ('${T.A}','${users.A.uid}'),('${T.B}','${users.B.uid}')) v(t,u)
      where not exists (select 1 from public.memberships m where m.tenant_id = v.t::uuid and m.user_id = v.u::uuid);
    delete from public.memberships where user_id in ('${users.A.uid}','${users.B.uid}')
      and (tenant_id, user_id) not in (('${T.A}'::uuid,'${users.A.uid}'::uuid),('${T.B}'::uuid,'${users.B.uid}'::uuid))`);
  for (const who of ["A", "B"]) {
    const t = T[who], tag = `zz-iso-${who.toLowerCase()}`;
    await sql(`
      insert into public.workstreams (tenant_id, key, name) select '${t}', '${tag}', 'Isolation probe ${who}' where not exists (select 1 from public.workstreams where tenant_id='${t}' and key='${tag}');
      insert into public.coverage_areas (tenant_id, grp, area, status) select '${t}', '${tag}', 'probe', 'none' where not exists (select 1 from public.coverage_areas where tenant_id='${t}' and grp='${tag}');
      insert into public.contracts (tenant_id, title) select '${t}', 'Isolation probe ${who}' where not exists (select 1 from public.contracts where tenant_id='${t}' and title='Isolation probe ${who}');
      insert into public.deliverables (tenant_id, title, slug) select '${t}', 'Isolation probe ${who}', '${tag}' where not exists (select 1 from public.deliverables where tenant_id='${t}' and slug='${tag}');
      insert into public.entities (tenant_id, kind, name) select '${t}', 'org', 'Isolation probe ${who}' where not exists (select 1 from public.entities where tenant_id='${t}' and name='Isolation probe ${who}');
      insert into public.engine_entities (tenant_id, object_key, type, canonical_name) values ('${t}', 'customer:${tag}-secret-customer', 'customer', 'Secret Customer ${who}') on conflict (tenant_id, object_key) do nothing;
      insert into public.engine_aliases (tenant_id, entity_id, alias, source)
        select e.tenant_id, e.id, 'Secret Customer ${who}', 'canonical' from public.engine_entities e
        where e.tenant_id='${t}' and e.object_key='customer:${tag}-secret-customer' and not exists (select 1 from public.engine_aliases a where a.entity_id=e.id);
      insert into public.engine_properties (tenant_id, entity_id, prop, value, value_num, valid_from, source_system, source_ref)
        select e.tenant_id, e.id, 'annual_revenue', '${who === "A" ? 1111111 : 2222222}', ${who === "A" ? 1111111 : 2222222}, '2026-01-01', 'isolation-probe', 'seed:${tag}'
        from public.engine_entities e where e.tenant_id='${t}' and e.object_key='customer:${tag}-secret-customer'
        and not exists (select 1 from public.engine_properties p where p.entity_id=e.id);
      insert into public.engine_mentions (tenant_id, surface, source_system, source_ref)
        select '${t}', 'Secret Customer ${who}', 'isolation-probe', 'seed:${tag}' where not exists (select 1 from public.engine_mentions where tenant_id='${t}' and source_ref='seed:${tag}');`);
  }
  ok("setup", `tenants ${SLUG.A}, ${SLUG.B}; users owner-of-own-tenant; seeded rows in ${SEEDED.length} tables per tenant`);

  // ---------- sign in through the Auth API: password (aal1), then TOTP enroll + verify (aal2) ----------
  const totp = (secret, at = Date.now()) => {
    const alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = "";
    for (const c of secret.replace(/=+$/, "").toUpperCase()) bits += alpha.indexOf(c).toString(2).padStart(5, "0");
    const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
    const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(at / 30000)));
    const h = crypto.createHmac("sha1", key).update(ctr).digest(); const o = h[19] & 15;
    return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
  };
  const session = {};
  for (const who of ["A", "B"]) {
    const p = await j("/auth/v1/token?grant_type=password", { method: "POST", body: { email: EMAIL[who], password: users[who].password } });
    if (p.status !== 200) { fail(`sign-in ${who}`, `password sign-in ${p.status} ${short(p.data)}`); continue; }
    const en = await j("/auth/v1/factors", { token: p.data.access_token, method: "POST", body: { factor_type: "totp", friendly_name: `probe-${Date.now()}` } });
    if (en.status !== 200 || !en.data?.totp?.secret) { fail(`mfa enroll ${who}`, `${en.status} ${short(en.data?.msg || en.data?.message || en.data)}`); session[who] = { aal1: p.data }; continue; }
    const ch = await j(`/auth/v1/factors/${en.data.id}/challenge`, { token: p.data.access_token, method: "POST", body: {} });
    const v = await j(`/auth/v1/factors/${en.data.id}/verify`, { token: p.data.access_token, method: "POST", body: { challenge_id: ch.data?.id, code: totp(en.data.totp.secret) } });
    if (v.status !== 200) { fail(`mfa verify ${who}`, `${v.status} ${short(v.data?.msg || v.data)}`); session[who] = { aal1: p.data }; continue; }
    const aal = JSON.parse(Buffer.from(v.data.access_token.split(".")[1], "base64url").toString()).aal;
    if (aal !== "aal2") fail(`mfa ${who}`, `verified session is ${aal}, not aal2`);
    session[who] = { aal1: p.data, aal2: { ...v.data, expires_at: v.data.expires_at || Math.floor(Date.now() / 1000) + (v.data.expires_in || 3600) } };
    ok(`sign-in ${who}`, "password -> aal1, TOTP enrolled + verified -> aal2 (real Auth API JWTs)");
  }

  // ---------- 1. RLS ----------
  const inv = await sql(`select c.table_name as t from information_schema.columns c join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'tenant_id' and tb.table_type = 'BASE TABLE' order by 1`);
  const TABLES = Object.fromEntries([...inv.map((r) => [r.t, "tenant_id"]), ["tenants", "id"]]);
  const counts = {};
  for (const [t, col] of Object.entries(TABLES)) {
    const r = (await sql(`select count(*) filter (where ${col} <> '${T.A}') as not_a, count(*) filter (where ${col} <> '${T.B}') as not_b,
      count(*) filter (where ${col} = '${T.A}') as a, count(*) filter (where ${col} = '${T.B}') as b from public.${t}`))[0];
    counts[t] = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Number(v)]));
  }
  const denied = (r) => r.status === 401 || r.status === 403 || (r.status === 200 && Array.isArray(r.data) && r.data.length === 0);
  let tableChecks = 0, meaningful = 0;
  for (const [me, other] of [["A", "B"], ["B", "A"]]) {
    const tok = session[me]?.aal2?.access_token;
    if (!tok) { fail(`RLS ${me}`, "no aal2 session; cross-tenant RLS checks could not run"); continue; }
    for (const [t, col] of Object.entries(TABLES)) {
      for (const [what, filter] of [[`${other}'s rows`, `${col}=eq.${T[other]}`], ["any tenant but mine", `${col}=neq.${T[me]}`], ["null tenant", `${col}=is.null`]]) {
        tableChecks++;
        const r = await j(`/rest/v1/${t}?select=${col}&${filter}&limit=50`, { token: tok });
        if (r.status === 200 && Array.isArray(r.data) && r.data.length) leak(`RLS ${me}(aal2) ${t} [${what}]`, `${r.data.length} row(s) visible`);
        else if (!denied(r)) fail(`RLS ${me}(aal2) ${t} [${what}]`, `unexpected ${r.status} ${short(r.data)}`);
      }
      if ((me === "A" ? counts[t].not_a : counts[t].not_b) > 0) meaningful++;
      const own = await j(`/rest/v1/${t}?select=${col}&${col}=eq.${T[me]}&limit=5`, { token: tok });
      if (SEEDED.includes(t)) {
        if (own.status !== 200 || !Array.isArray(own.data) || !own.data.length) fail(`RLS ${me}(aal2) ${t} [own rows, positive control]`, `expected own rows, got ${own.status} ${short(own.data)}`);
      }
    }
  }
  ok("RLS aal2 cross-tenant", `${tableChecks} filtered reads over ${Object.keys(TABLES).length} tables x 2 directions; ${meaningful}/${Object.keys(TABLES).length * 2} table-directions had foreign rows to leak (the rest are empty of foreign rows, still checked)`);

  let denialChecks = 0;
  for (const [label, tok] of [["anon (no JWT)", null], ["A(aal1, password only)", session.A?.aal1?.access_token], ["B(aal1, password only)", session.B?.aal1?.access_token]]) {
    if (label !== "anon (no JWT)" && !tok) { fail(label, "no aal1 session"); continue; }
    for (const [t, col] of Object.entries(TABLES)) {
      denialChecks++;
      const r = await j(`/rest/v1/${t}?select=${col}&limit=5`, { token: tok || undefined });
      if (r.status === 200 && Array.isArray(r.data) && r.data.length) leak(`RLS ${label} ${t}`, `${r.data.length} row(s) visible without a strong session`);
      else if (!denied(r)) fail(`RLS ${label} ${t}`, `unexpected ${r.status} ${short(r.data)}`);
    }
  }
  ok("RLS anon + aal1", `${denialChecks} unfiltered reads; aal1 sees nothing, not even its own tenant (restrictive require_mfa_aal2)`);

  // Engine tables: members can never write, even into their own tenant.
  const aTok = session.A?.aal2?.access_token;
  if (aTok) {
    for (const body of [{ tenant_id: T.A, object_key: "customer:zz-write", type: "customer", canonical_name: "Write attempt" }, { tenant_id: T.B, object_key: "customer:zz-write", type: "customer", canonical_name: "Write attempt" }]) {
      const r = await j("/rest/v1/engine_entities", { token: aTok, method: "POST", body: [body], headers: { Prefer: "return=minimal" } });
      if (r.status >= 200 && r.status < 300) leak(`engine write as member`, `insert into ${body.tenant_id === T.A ? "own" : "B's"} tenant accepted`);
      else if (r.status !== 401 && r.status !== 403) fail("engine write as member", `unexpected ${r.status} ${short(r.data)}`);
    }
  }

  // ---------- 2. RPCs aimed at the other tenant ----------
  let rpcChecks = 0;
  const rpc = (fn, args, tok) => j(`/rest/v1/rpc/${fn}`, { token: tok, method: "POST", body: args });
  if (aTok) {
    const aimed = [
      ["audit_export", { p_tenant: T.B, p_from: null, p_to: null, p_after_id: null, p_limit: 50 }, "rows"],
      ["list_tenant_team", { p_tenant: T.B }, "rows"],
      ["is_tenant_member", { p_tenant: T.B }, "false"],
      ["is_tenant_admin", { p_tenant: T.B }, "false"],
      ["entity_upsert", { p_tenant: T.B, p_id: null, p_parent: null, p_kind: "org", p_name: "ZZ LEAK if present", p_code: null, p_meta: {} }, "deny"],
      ["connection_request", { p_tenant: T.B, p_connector: "zz-probe", p_kind: "request" }, "deny"],
      ["api_key_create", { p_tenant: T.B, p_name: "ZZ LEAK if present", p_scopes: ["read"] }, "deny"],
      ["tenant_set_external_sharing", { p_tenant: T.B, p_enabled: false }, "deny"],
      ["engine_resolve", { p_tenant: T.B, p_text: "Secret Customer B" }, "deny"],
      ["engine_props_as_of", { p_tenant: T.B, p_entity: "00000000-0000-0000-0000-000000000000" }, "deny"],
      ["engine_set_prop", { p_tenant: T.B, p_entity: "00000000-0000-0000-0000-000000000000", p_prop: "x", p_value: "1", p_valid_from: started, p_observed_at: started, p_source_system: "zz", p_source_ref: "zz" }, "deny"],
    ];
    for (const [fn, args, expect] of aimed) {
      rpcChecks++;
      const r = await rpc(fn, args, aTok);
      const okStatus = r.status >= 200 && r.status < 300;
      if (expect === "deny" && okStatus) leak(`rpc ${fn}(B) as A`, `accepted: ${r.status} ${short(r.data)}`);
      else if (expect === "rows" && okStatus && Array.isArray(r.data) && r.data.length) leak(`rpc ${fn}(B) as A`, `${r.data.length} row(s) of B returned`);
      else if (expect === "false" && okStatus && r.data !== false) leak(`rpc ${fn}(B) as A`, `returned ${short(r.data)}`);
      else if (!okStatus && r.status >= 500) fail(`rpc ${fn}(B) as A`, `server error ${r.status} ${short(r.data)}`);
    }
    for (const fn of ["engine_resolve", "engine_set_prop"]) { // anon, no JWT
      rpcChecks++;
      const r = await rpc(fn, fn === "engine_resolve" ? { p_tenant: T.A, p_text: "Secret Customer A" } : aimed.find((x) => x[0] === fn)[1], undefined);
      if (r.status >= 200 && r.status < 300) leak(`rpc ${fn} as anon`, `accepted: ${short(r.data)}`);
    }
    const team = await rpc("list_tenant_team", { p_tenant: T.A }, aTok);
    if (team.status !== 200 || !Array.isArray(team.data) || !team.data.length) fail("rpc positive control", `list_tenant_team(A) as A: ${team.status} ${short(team.data)}`);
    const mem = await rpc("is_tenant_member", { p_tenant: T.A }, aTok);
    if (mem.status !== 200 || mem.data !== true) fail("rpc positive control", `is_tenant_member(A) as A: ${mem.status} ${short(mem.data)}`);
    ok("RPCs", `${rpcChecks} calls aimed at the other tenant or made as anon; positive control list_tenant_team(A)/is_tenant_member(A) as A`);
  }

  // ---------- 3. Portal API ----------
  const cookieFor = (s) => {
    const value = "base64-" + Buffer.from(JSON.stringify(s)).toString("base64url"), name = `sb-${REF}-auth-token`;
    const out = []; for (let i = 0; i * 3180 < value.length; i++) out.push(`${name}.${i}=${value.slice(i * 3180, (i + 1) * 3180)}`);
    return out.length === 1 ? `${name}=${value}` : out.join("; ");
  };
  const hit = async (method, path, { cookie, tenant, body, form } = {}) => {
    const headers = { ...(cookie ? { cookie } : {}), ...(tenant ? { "x-tenant-id": tenant } : {}), ...(form ? {} : body ? { "content-type": "application/json" } : {}) };
    const r = await fetch(BASE + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined), redirect: "manual" });
    const t = await r.text(); let d = t; try { d = JSON.parse(t); } catch { /* text */ }
    return { status: r.status, data: d };
  };
  const routes = [
    ["POST", "/api/client/entities", { body: { action: "zz-noop" } }],
    ["POST", "/api/client/connections", { body: { action: "zz-noop" } }],
    ["POST", "/api/client/developer/keys", { body: { action: "zz-noop" } }],
    ["POST", "/api/client/uploads", { form: true }],
    ["GET", "/api/client/audit/export?format=jsonl", {}],
  ];
  let apiChecks = 0;
  if (session.A?.aal2) {
    const cA = cookieFor(session.A.aal2), cA1 = session.A.aal1 ? cookieFor({ ...session.A.aal1, expires_at: Math.floor(Date.now() / 1000) + 3600 }) : null;
    for (const [method, path, o] of routes) {
      const form = () => (o.form ? new FormData() : undefined);
      apiChecks++;
      const toB = await hit(method, path, { cookie: cA, tenant: T.B, body: o.body, form: form() });
      if (toB.status >= 200 && toB.status < 300) leak(`api ${method} ${path} as A -> B`, `status ${toB.status} ${short(toB.data)}`);
      else if (toB.status !== 403) fail(`api ${method} ${path} as A -> B`, `expected 403, got ${toB.status} ${short(toB.data)}`);
      apiChecks++;
      const toA = await hit(method, path, { cookie: cA, tenant: T.A, body: o.body, form: form() });
      if (toA.status === 401 || toA.status === 403 || toA.status >= 500) fail(`api ${method} ${path} as A -> A (positive control)`, `got ${toA.status} ${short(toA.data)}; the route never got past the tenant check, so the B denial proves nothing`);
      apiChecks++;
      const none = await hit(method, path, { tenant: T.A, body: o.body, form: form() });
      if (none.status >= 200 && none.status < 300) leak(`api ${method} ${path} without a session`, `status ${none.status}`);
      else if (none.status !== 401) fail(`api ${method} ${path} without a session`, `expected 401, got ${none.status}`);
      if (cA1) {
        apiChecks++;
        const weak = await hit(method, path, { cookie: cA1, tenant: T.A, body: o.body, form: form() });
        if (weak.status >= 200 && weak.status < 300) leak(`api ${method} ${path} with aal1 session`, `status ${weak.status}`);
        else if (weak.status !== 403 && weak.status !== 401) fail(`api ${method} ${path} with aal1 session`, `expected 401/403, got ${weak.status}`);
      }
    }
    apiChecks++;
    const sw = await hit("POST", "/api/client/active-tenant", { cookie: cA, body: { tenant: T.B } });
    if (sw.status >= 200 && sw.status < 300) leak("api active-tenant A -> B", `status ${sw.status}`); else if (sw.status !== 403) fail("api active-tenant A -> B", `expected 403, got ${sw.status}`);
    apiChecks++;
    const swA = await hit("POST", "/api/client/active-tenant", { cookie: cA, body: { tenant: T.A } });
    if (swA.status !== 200) fail("api active-tenant A -> A (positive control)", `expected 200, got ${swA.status} ${short(swA.data)}`);
    ok("portal API", `${apiChecks} calls to ${BASE}`);
  } else fail("portal API", "no aal2 session for A");

  // Side effects: nothing the probe aimed at B may exist in B afterwards.
  const se = (await sql(`select
      (select count(*) from public.entities where tenant_id='${T.B}' and name='ZZ LEAK if present') as entities,
      (select count(*) from public.api_keys where tenant_id='${T.B}' and created_at >= '${started}') as api_keys,
      (select count(*) from public.tenant_connections where tenant_id='${T.B}' and connector_key='zz-probe') as connections,
      (select count(*) from public.engine_entities where object_key='customer:zz-write') as engine_writes,
      (select external_sharing from public.tenants where id='${T.B}') as b_sharing`))[0];
  for (const k of ["entities", "api_keys", "connections", "engine_writes"]) if (Number(se[k]) > 0) leak(`side effect ${k}`, `${se[k]} row(s) created by a cross-tenant call`);
  if (se.b_sharing === false) leak("side effect tenants.external_sharing", "A's call changed B's sharing setting");
  ok("side effects", "no row created in the other tenant by any refused call");

  const summary = { target: `${REF} + ${BASE}`, tenants: SLUG, tables: Object.keys(TABLES).length, table_checks: tableChecks, denial_checks: denialChecks, rpc_checks: rpcChecks, api_checks: apiChecks,
    leaks: leaks.length, failures: failures.length, pass: leaks.length === 0 && failures.length === 0 };
  for (const l of log) console.log(l);
  console.log(JSON.stringify(summary));
  return leaks.length ? 2 : failures.length ? 1 : 0;
}
