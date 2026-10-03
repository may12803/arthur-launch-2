#!/usr/bin/env node
/**
 * Signs in as the Harbor & Vine demo owner (anon key, password) and checks what that
 * session can see in the loveleeday project; optionally uploads the sales export as a
 * tenant document (--upload) through the portal's own document_upload RPC.
 * Run: arthur-cred run --use supabase-loveleeday,harborvine-demo -- node scripts/demo-tenant-probe.mjs [--upload]
 */
import { readFileSync, appendFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { homedir } from "node:os";

const url = process.env.SUPABASE_LOVELEEDAY_URL, key = process.env.SUPABASE_LOVELEEDAY_ANON_KEY || process.env.SUPABASE_LOVELEEDAY_PUBLISHABLE_KEY;
const DABNEY = "dafed7e8-9783-4829-81e1-b2f4c8a4c539";
const H = { apikey: key, "content-type": "application/json" };
const tok = await (await fetch(`${url}/auth/v1/token?grant_type=password`, { method: "POST", headers: H, body: JSON.stringify({ email: process.env.HARBORVINE_DEMO_EMAIL, password: process.env.HARBORVINE_DEMO_PASSWORD }) })).json();
if (!tok.access_token) { console.log("SIGN-IN FAILED", tok.error_description || tok.msg); process.exit(1); }
let A = { ...H, authorization: `Bearer ${tok.access_token}` };
// The portal's RLS has a restrictive aal2 policy, so an aal1 session sees nothing. Enroll/verify TOTP like a real user would.
const b32 = (s) => { const al = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let bits = ""; for (const c of s.replace(/=+$/, "")) bits += al.indexOf(c).toString(2).padStart(5, "0"); return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); };
const totp = (secret) => { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac("sha1", b32(secret)).update(c).digest(); const o = h[19] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0"); };
const vaultFile = `${homedir()}/.arthur/vault/harborvine-demo.env`;
const vtxt = readFileSync(vaultFile, "utf8");
let secret = /HARBORVINE_DEMO_TOTP_SECRET=(.*)/.exec(vtxt)?.[1];
let factorId = /HARBORVINE_DEMO_TOTP_FACTOR=(.*)/.exec(vtxt)?.[1];
if (!secret) {
  const e = await (await fetch(`${url}/auth/v1/factors`, { method: "POST", headers: A, body: JSON.stringify({ factor_type: "totp", friendly_name: "demo" }) })).json();
  secret = e.totp?.secret; factorId = e.id;
  if (!secret) { console.log("ENROLL FAILED", JSON.stringify(e).slice(0, 200)); process.exit(1); }
  appendFileSync(vaultFile, `HARBORVINE_DEMO_TOTP_SECRET=${secret}\nHARBORVINE_DEMO_TOTP_FACTOR=${factorId}\n`);
}
const ch = await (await fetch(`${url}/auth/v1/factors/${factorId}/challenge`, { method: "POST", headers: A, body: "{}" })).json();
const vr = await (await fetch(`${url}/auth/v1/factors/${factorId}/verify`, { method: "POST", headers: A, body: JSON.stringify({ challenge_id: ch.id, code: totp(secret) }) })).json();
if (!vr.access_token) { console.log("MFA VERIFY FAILED", JSON.stringify(vr).slice(0, 200)); process.exit(1); }
A = { ...H, authorization: `Bearer ${vr.access_token}` };
console.log("mfa aal:", JSON.parse(Buffer.from(vr.access_token.split(".")[1], "base64url")).aal);
console.log("signed in:", tok.user.email, "aal:", JSON.parse(Buffer.from(tok.access_token.split(".")[1], "base64url")).aal);
const get = async (t, q = "select=*") => { const r = await fetch(`${url}/rest/v1/${t}?${q}`, { headers: A }); const j = await r.json(); return Array.isArray(j) ? j : { status: r.status, j }; };
let leak = 0;
for (const t of ["tenants", "memberships", "invites", "documents", "deliverables", "workstreams", "workstream_tasks", "contracts", "tenant_connections", "audit_log", "staff_grants", "coverage_areas", "document_shares"]) {
  const rows = await get(t);
  if (!Array.isArray(rows)) { console.log(t.padEnd(20), "HTTP", rows.status, JSON.stringify(rows.j).slice(0, 80)); continue; }
  const other = rows.filter((x) => (x.tenant_id || x.id) === DABNEY || (x.tenant_id && x.tenant_id !== rows[0]?.tenant_id && t !== "tenants"));
  const foreign = rows.filter((x) => (t === "tenants" ? x.id : x.tenant_id) === DABNEY);
  leak += foreign.length;
  console.log(t.padEnd(20), "rows:", rows.length, "dabney rows:", foreign.length);
}
const tn = await get("tenants"); console.log("visible tenants:", JSON.stringify(tn.map((x) => x.name)));
const st = await fetch(`${url}/rest/v1/rpc/staff_list_tenants`, { method: "POST", headers: A, body: "{}" }); console.log("staff_list_tenants:", st.status, (await st.text()).slice(0, 80));
console.log(leak === 0 ? "ISOLATION OK: zero Dabney rows visible" : `LEAK: ${leak} Dabney rows`);
if (process.argv.includes("--upload")) {
  const data = readFileSync(`${homedir()}/.arthur/data/tenants/harbor-vine-demo/toast-sales.jsonl`).toString("base64");
  const r = await fetch(`${url}/rest/v1/rpc/document_upload`, { method: "POST", headers: A, body: JSON.stringify({ p_tenant: tn[0].id, p_name: "harbor-vine-demo-toast-sales.jsonl", p_content_type: "application/x-ndjson", p_data_b64: data }) });
  console.log("document_upload:", r.status, (await r.text()).slice(0, 200));
}
