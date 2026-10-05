#!/usr/bin/env node
// Probe one connector against its vendor SANDBOX with the credentials in ~/.arthur/vault/connectors/<key>.env.
// Usage: node scripts/connector-sandbox-probe.mjs <connector-key> [--all]
//
// Ladder (Rule 41), each rung only from a call that could have failed:
//   NOT_CONFIGURED       vault file or required names missing
//   CONFIGURED           names present, nothing called yet
//   CLIENT_REJECTED      the vendor refused our app credentials
//   CLIENT_VERIFIED      the vendor's token endpoint accepted our client id/secret (a bogus code gets invalid_grant, not invalid_client)
//   VALIDATE_FAILED      a sandbox credential exists but adapter.validate() failed
//   DATA_FLOWED_SANDBOX  adapter.validate() passed and pull() returned >= 1 record from the sandbox
// None of these is "live at a customer": that needs a customer's own authorization and a sync run in the portal.
//
// Vault names (values are never printed):
//   CONNECTOR_OAUTH_<KEY>_{AUTHORIZE_URL,TOKEN_URL,CLIENT_ID,CLIENT_SECRET,SCOPES}  (the portal reads the same names)
//   CONNECTOR_CREDS_<KEY>_<FIELD>  -> creds.<field> handed to the adapter (e.g. ACCESS_TOKEN, REALM_ID, SANDBOX=1)
// Result JSON (names and statuses only) goes to docs/connector-platform/probes/<key>.json.
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = process.env.CONNECTOR_VAULT_DIR || path.join(homedir(), ".arthur/vault/connectors");
const REDIRECT = "https://portal.loveleedaystudios.com/api/client/connectors/oauth/callback";

// Only an RFC 6749 error code is ever echoed; any other vendor text (which can contain what we sent) is not.
const code = (s) => (/^[a-z_]{1,40}$/.test(s) ? s : s ? "(unrecognized, not printed)" : "(none)");

function loadEnv(file) {
  const env = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function probe(key) {
  const out = { key, at: new Date().toISOString(), status: "NOT_CONFIGURED", names: [], steps: [] };
  const file = path.join(VAULT, `${key}.env`);
  if (!existsSync(file)) { out.steps.push(`no vault file ${file}`); return out; }
  const env = loadEnv(file);
  out.names = Object.keys(env).sort();
  const P = key.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const o = (n) => env[`CONNECTOR_OAUTH_${P}_${n}`];
  const credPrefix = `CONNECTOR_CREDS_${P}_`;
  const creds = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith(credPrefix)).map(([k, v]) => [k.slice(credPrefix.length).toLowerCase(), v]));
  if (o("CLIENT_ID") || Object.keys(creds).length) out.status = "CONFIGURED";

  if (o("TOKEN_URL") && o("CLIENT_ID") && o("CLIENT_SECRET")) {
    const body = new URLSearchParams({ grant_type: "authorization_code", code: "loveleeday-probe-invalid-code", redirect_uri: REDIRECT });
    // Vendors take client credentials one of two ways (RFC 6749 2.3.1): Basic header or form body. Try each alone.
    // Only invalid_grant proves the client was accepted (the vendor got past client auth and refused the bogus code);
    // invalid_request, a 400 with no code, or anything else proves nothing, because a vendor that never parsed our
    // client answers the same way. (A fake HubSpot client returned invalid_request; an earlier cut counted that as verified.)
    const basic = Buffer.from(`${o("CLIENT_ID")}:${o("CLIENT_SECRET")}`).toString("base64");
    const attempts = [
      ["client_secret_basic", { authorization: `Basic ${basic}` }, body],
      ["client_secret_post", {}, new URLSearchParams({ ...Object.fromEntries(body), client_id: o("CLIENT_ID"), client_secret: o("CLIENT_SECRET") })],
    ];
    let rejected = false;
    for (const [how, extra, form] of attempts) {
      try {
        const r = await fetch(o("TOKEN_URL"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...extra }, body: form, redirect: "manual" });
        const text = await r.text();
        let err = ""; try { err = String(JSON.parse(text).error || ""); } catch { err = /invalid_grant|invalid_client|unauthorized_client/.exec(text)?.[0] || ""; }
        out.steps.push(`token endpoint (${how}): HTTP ${r.status} error=${code(err)}`);
        if (err === "invalid_grant") { out.status = "CLIENT_VERIFIED"; break; }
        if (/invalid_client|unauthorized_client/.test(err) || r.status === 401) rejected = true;
      } catch (e) { out.steps.push(`token endpoint unreachable (${how}): ${e?.cause?.code || e?.name || "error"}`); }
    }
    if (out.status !== "CLIENT_VERIFIED") {
      if (rejected) out.status = "CLIENT_REJECTED";
      else out.steps.push("no invalid_grant from either method: client validity unproven, status unchanged");
    }
  }

  if (Object.keys(creds).length) {
    const { getAdapter } = await import(path.join(root, "lib/connectors/adapters/registry.ts"));
    let adapter; try { adapter = getAdapter(key); } catch { out.steps.push("no adapter for this key"); return out; }
    const f = (url, init) => fetch(url, { ...init, redirect: "manual" });
    try {
      const v = await adapter.validate(creds, f);
      out.steps.push(`validate: ok=${v.ok}`); // vendor detail text is not printed: it can echo a submitted credential
      if (!v.ok) { out.status = "VALIDATE_FAILED"; return out; }
      for (const object of adapter.objects) {
        const page = await adapter.pull(object, null, creds, f);
        out.steps.push(`pull ${object}: ${page.records.length} record(s)`);
        if (page.records.length) { out.status = "DATA_FLOWED_SANDBOX"; out.evidence = { object, source_ref: page.records[0].source_ref }; break; }
      }
      if (out.status !== "DATA_FLOWED_SANDBOX") out.steps.push("validate passed but every object returned 0 records; sandbox may be empty");
    } catch (e) { out.status = "VALIDATE_FAILED"; out.steps.push(`adapter error: ${e?.name || "Error"}${typeof e?.status === "number" ? ` HTTP ${e.status}` : ""}`); }
  }
  return out;
}

const arg = process.argv[2];
if (!arg) { console.error("usage: connector-sandbox-probe.mjs <key>|--all"); process.exit(64); }
const keys = arg === "--all" ? (existsSync(VAULT) ? readdirSync(VAULT).filter((f) => f.endsWith(".env")).map((f) => f.slice(0, -4)) : []) : [arg];
mkdirSync(path.join(root, "docs/connector-platform/probes"), { recursive: true });
let worst = 0;
for (const k of keys) {
  const r = await probe(k);
  writeFileSync(path.join(root, "docs/connector-platform/probes", `${k}.json`), JSON.stringify(r, null, 2) + "\n");
  console.log(`${k}: ${r.status}  [${r.steps.join(" | ")}]  names=${r.names.length}`);
  if (!["CLIENT_VERIFIED", "DATA_FLOWED_SANDBOX"].includes(r.status)) worst = 2;
}
if (!keys.length) { console.log(`no vault files in ${VAULT}: nothing was probed`); worst = 2; }
process.exit(worst);
