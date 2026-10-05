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
import { createHash } from "node:crypto";

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

// The developer-access session writes vendor-named files (dropbox.env with DROPBOX_CLIENT_ID, ...). Map them onto the
// standard names the portal reads. Token URLs are the vendors' documented endpoints; a wrong one fails safe (no
// invalid_grant, so the rung stays CONFIGURED). creds_from turns vault names into adapter credential fields.
const VENDOR_FILES = {
  "dropbox-business": { file: "dropbox", oauth: { CLIENT_ID: "DROPBOX_CLIENT_ID", CLIENT_SECRET: "DROPBOX_CLIENT_SECRET" },
    TOKEN_URL: "https://api.dropboxapi.com/oauth2/token" },
  "esri-arcgis": { file: "esri", oauth: { CLIENT_ID: "ESRI_CLIENT_ID", CLIENT_SECRET: "ESRI_CLIENT_SECRET" },
    TOKEN_URL: "https://www.arcgis.com/sharing/rest/oauth2/token", client_credentials: true },
  procore: { file: "procore", oauth: { CLIENT_ID: "PROCORE_SANDBOX_CLIENT_ID", CLIENT_SECRET: "PROCORE_SANDBOX_CLIENT_SECRET" },
    TOKEN_URL: "https://login-sandbox.procore.com/oauth/token" },
  "blackbaud-raisers-edge-nxt": { file: "blackbaud", oauth: { CLIENT_ID: "BLACKBAUD_CLIENT_ID", CLIENT_SECRET: "BLACKBAUD_CLIENT_SECRET" },
    TOKEN_URL: "https://oauth2.sky.blackbaud.com/token" },
  // Shopify's token endpoint is per shop (https://<shop>.myshopify.com/admin/oauth/access_token): until a development
  // store exists there is nothing to test the client against, so this reads CONFIGURED, never verified.
  shopify: { file: "shopify", oauth: { CLIENT_ID: "SHOPIFY_CLIENT_ID", CLIENT_SECRET: "SHOPIFY_CLIENT_SECRET" } },
  snowflake: { file: "snowflake", creds_from: { account: "SNOWFLAKE_ACCOUNT", user: "SNOWFLAKE_USER", "@private_key": "SNOWFLAKE_PRIVATE_KEY_PATH" },
    // every Snowflake account ships this read-only sample share; it proves the key-pair login and a real SQL API read
    creds_fixed: { warehouse: "COMPUTE_WH", updated_at_column: "O_ORDERDATE", primary_key: "O_ORDERKEY" },
    objects: ["SNOWFLAKE_SAMPLE_DATA.TPCH_SF1.ORDERS"] },
};

const getDefinitionKeys = () => new Set(readdirSync(path.join(root, "data/connectors/systems")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));

function vendorEnv(key) {
  const v = VENDOR_FILES[key];
  if (!v) return null;
  const file = path.join(VAULT, `${v.file}.env`);
  if (!existsSync(file)) return { file, env: null };
  const raw = loadEnv(file), P = key.toUpperCase().replace(/[^A-Z0-9]/g, "_"), env = {};
  for (const [std, name] of Object.entries(v.oauth || {})) if (raw[name]) env[`CONNECTOR_OAUTH_${P}_${std}`] = raw[name];
  if (v.oauth && env[`CONNECTOR_OAUTH_${P}_CLIENT_ID`]) env[`CONNECTOR_OAUTH_${P}_TOKEN_URL`] = v.TOKEN_URL;
  for (const [field, name] of Object.entries(v.creds_from || {})) {
    if (!raw[name]) continue;
    if (field.startsWith("@")) { const p = raw[name].replace(/^~/, homedir()); if (existsSync(p)) env[`CONNECTOR_CREDS_${P}_${field.slice(1).toUpperCase()}`] = readFileSync(p, "utf8"); }
    else env[`CONNECTOR_CREDS_${P}_${field.toUpperCase()}`] = raw[name];
  }
  if (Object.keys(v.creds_from || {}).length) for (const [f, val] of Object.entries(v.creds_fixed || {})) env[`CONNECTOR_CREDS_${P}_${f.toUpperCase()}`] = val;
  return { file, env, names: Object.keys(raw).sort() };
}

async function probe(key) {
  const out = { key, at: new Date().toISOString(), status: "NOT_CONFIGURED", names: [], steps: [] };
  const mapped = vendorEnv(key);
  const file = mapped ? mapped.file : path.join(VAULT, `${key}.env`);
  if (!existsSync(file)) { out.steps.push(`no vault file ${file}`); return out; }
  const env = mapped ? mapped.env : loadEnv(file);
  out.names = mapped ? mapped.names : Object.keys(env).sort();
  const vendor = VENDOR_FILES[key] || {};
  const P = key.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const o = (n) => env[`CONNECTOR_OAUTH_${P}_${n}`];
  const credPrefix = `CONNECTOR_CREDS_${P}_`;
  const creds = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith(credPrefix)).map(([k, v]) => [k.slice(credPrefix.length).toLowerCase(), v]));
  if (o("CLIENT_ID") || Object.keys(creds).length) out.status = "CONFIGURED";

  // Systems that allow the client-credentials grant prove the app directly: the vendor issues a token or it does not.
  if (vendor.client_credentials && o("TOKEN_URL") && o("CLIENT_ID") && o("CLIENT_SECRET")) {
    try {
      const r = await fetch(o("TOKEN_URL"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: o("CLIENT_ID"), client_secret: o("CLIENT_SECRET"), f: "json" }), redirect: "manual" });
      let j = {}; try { j = await r.json(); } catch { /* non-JSON answer proves nothing */ }
      const issued = typeof j.access_token === "string" && j.access_token.length > 10;
      out.steps.push(`client_credentials: HTTP ${r.status} token_issued=${issued}`);
      if (issued) { out.status = "CLIENT_VERIFIED"; out.client_token_issued = true; }
      else if (j.error) out.status = "CLIENT_REJECTED";
    } catch (e) { out.steps.push(`token endpoint unreachable: ${e?.cause?.code || e?.name || "error"}`); }
  }

  if (out.status !== "CLIENT_VERIFIED" && o("TOKEN_URL") && o("CLIENT_ID") && o("CLIENT_SECRET")) {
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
      for (const object of vendor.objects || adapter.objects) {
        const page = await adapter.pull(object, null, creds, f);
        out.steps.push(`pull ${object}: ${page.records.length} record(s)`);
        if (page.records.length) { out.status = "DATA_FLOWED_SANDBOX"; out.evidence = { object, record_count: page.records.length, source_ref_sha256_prefix: createHash("sha256").update(String(page.records[0].source_ref)).digest("hex").slice(0, 12) }; break; }
      }
      if (out.status !== "DATA_FLOWED_SANDBOX") out.steps.push("validate passed but every object returned 0 records; sandbox may be empty");
    } catch (e) { out.status = "VALIDATE_FAILED"; out.steps.push(`adapter error: ${e?.name || "Error"}${typeof e?.status === "number" ? ` HTTP ${e.status}` : ""}`); }
  }
  return out;
}

const arg = process.argv[2];
if (!arg) { console.error("usage: connector-sandbox-probe.mjs <key>|--all"); process.exit(64); }
const keys = arg === "--all" ? [...new Set([...Object.keys(VENDOR_FILES), ...(existsSync(VAULT) ? readdirSync(VAULT).filter((f) => /^[a-z0-9-]+\.env$/.test(f)).map((f) => f.slice(0, -4)).filter((k) => getDefinitionKeys().has(k)) : [])])] : [arg];
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
