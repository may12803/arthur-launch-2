#!/usr/bin/env node
// Probe one connector against its vendor SANDBOX with the credentials in ~/.arthur/vault/connectors/<key>.env.
// Usage: node scripts/connector-sandbox-probe.mjs <connector-key> [--all]
//
// Ladder (Rule 41), each rung only from a call that could have failed:
//   NOT_CONFIGURED       vault file or required names missing
//   CONFIGURED           names present, nothing called yet
//   CLIENT_REJECTED      the vendor refused our app credentials
//   CLIENT_VERIFIED      the token endpoint accepted our client id/secret: a bogus code is refused at the grant level while a
//                        WRONG-secret control is refused differently (identical answers prove nothing and stay CONFIGURED)
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
import { VAULT, loadEnv, VENDOR_FILES, FILE_KEY, vendorEnv } from "./lib/connector-vault.mjs";
const REDIRECT = "https://portal.loveleedaystudios.com/api/client/connectors/oauth/callback";

// Only an RFC 6749 error code is ever echoed; any other vendor text (which can contain what we sent) is not.
const code = (s) => (/^[a-z_]{1,40}$/.test(s) ? s : s ? "(unrecognized, not printed)" : "(none)");


// Token-endpoint probes for vendors the generic path cannot reach (JSON bodies, refresh grants, per-tenant hosts, custom
// params). Each sends a bogus grant with the real secret AND with a wrong secret (control). CLIENT_VERIFIED only when the
// real call is refused at the GRANT level and the control is refused differently (client level); identical answers prove
// nothing (the vendor never looked at the secret) and stay CONFIGURED. Only RFC-6749-shaped codes are echoed.
const R = REDIRECT;
const TOKEN_PROBES = {
  jira: { file: "atlassian", id: "ATLASSIAN_CLIENT_ID", secret: "ATLASSIAN_CLIENT_SECRET", url: "https://auth.atlassian.com/oauth/token", json: true, params: { grant_type: "refresh_token", refresh_token: "bogus-refresh-token" } },
  box: { file: "box", id: "BOX_CLIENT_ID", secret: "BOX_CLIENT_SECRET", url: "https://api.box.com/oauth2/token", params: { grant_type: "authorization_code", code: "bogus-code" } },
  clickup: { file: "clickup", id: "CLICKUP_CLIENT_ID", secret: "CLICKUP_CLIENT_SECRET", url: "https://api.clickup.com/api/v2/oauth/token", json: true, params: { code: "BOGUSCODE" } },
  "clio-manage": { file: "clio", id: "CLIO_CLIENT_ID", secret: "CLIO_CLIENT_SECRET", url: "https://auth.api.clio.com/oauth/token", params: { grant_type: "authorization_code", code: "bogus-code", redirect_uri: R } },
  docusign: { file: "docusign", id: "DOCUSIGN_CLIENT_ID", secret: "DOCUSIGN_CLIENT_SECRET", url: "https://account-d.docusign.com/oauth/token", basic: true, params: { grant_type: "refresh_token", refresh_token: "bogus-refresh-token" } },
  "google-workspace": { file: "google", id: "GOOGLE_CLIENT_ID", secret: "GOOGLE_CLIENT_SECRET", url: "https://oauth2.googleapis.com/token", params: { grant_type: "authorization_code", code: "bogus", redirect_uri: R } },
  "help-scout": { grantDesc: /^invalid code$/i, file: "helpscout", id: "HELPSCOUT_CLIENT_ID", secret: "HELPSCOUT_CLIENT_SECRET", url: "https://api.helpscout.net/v2/oauth2/token", params: { grant_type: "authorization_code", code: "bogus-code", redirect_uri: R } },
  hubspot: { file: "hubspot", id: "HUBSPOT_CLIENT_ID", secret: "HUBSPOT_CLIENT_SECRET", url: "https://api.hubapi.com/oauth/v1/token", params: { grant_type: "authorization_code", code: "probe-invalid", redirect_uri: R } },
  intercom: { file: "intercom", id: "INTERCOM_CLIENT_ID", secret: "INTERCOM_CLIENT_SECRET", url: "https://api.intercom.io/auth/eagle/token", json: true, params: { code: "bogus-code" } },
  "quickbooks-online": { file: "intuit", id: "INTUIT_CLIENT_ID", secret: "INTUIT_CLIENT_SECRET", url: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", basic: true, params: { grant_type: "authorization_code", code: "bogus-code", redirect_uri: R } },
  mailchimp: { file: "mailchimp", id: "MAILCHIMP_CLIENT_ID", secret: "MAILCHIMP_CLIENT_SECRET", url: "https://login.mailchimp.com/oauth2/token", params: { grant_type: "authorization_code", code: "bogus-code", redirect_uri: R } },
  "microsoft-365": { file: "microsoft", id: "MICROSOFT_CLIENT_ID", secret: "MICROSOFT_CLIENT_SECRET", url: "https://login.microsoftonline.com/common/oauth2/v2.0/token", params: { grant_type: "authorization_code", code: "bogus", redirect_uri: R } },
  monday: { file: "monday", id: "MONDAY_CLIENT_ID", secret: "MONDAY_CLIENT_SECRET", url: "https://auth.monday.com/oauth2/token", json: true, params: { code: "bogus-code", redirect_uri: R } },
  pipedrive: { file: "pipedrive", id: "PIPEDRIVE_CLIENT_ID", secret: "PIPEDRIVE_CLIENT_SECRET", url: "https://oauth.pipedrive.com/oauth/token", basic: true, params: { grant_type: "authorization_code", code: "bogus-code", redirect_uri: R } },
  salesforce: { file: "salesforce", id: "SALESFORCE_CLIENT_ID", secret: "SALESFORCE_CLIENT_SECRET", url: (e) => `${/^https?:/.test(e.SALESFORCE_MY_DOMAIN || "") ? e.SALESFORCE_MY_DOMAIN : `https://${e.SALESFORCE_MY_DOMAIN}`}/services/oauth2/token`, needs: ["SALESFORCE_MY_DOMAIN"], params: { grant_type: "refresh_token", refresh_token: "bogus-refresh-token" } },
  notion: { file: "notion", id: "NOTION_CLIENT_ID", secret: "NOTION_CLIENT_SECRET", url: "https://api.notion.com/v1/oauth/token", basic: true, json: true, params: { grant_type: "authorization_code", code: "00000000-0000-4000-8000-000000000000" } }, // Notion checks the client first, then that the code is a UUID
  trello: { file: "trello", id: "TRELLO_CLIENT_ID", secret: "TRELLO_CLIENT_SECRET", url: "https://auth.atlassian.com/oauth/token", json: true, params: { grant_type: "refresh_token", refresh_token: "bogus-refresh-token" } },
  wrike: { file: "wrike", id: "WRIKE_CLIENT_ID", secret: "WRIKE_CLIENT_SECRET", url: "https://login.wrike.com/oauth2/token", params: { grant_type: "authorization_code", code: "bogus-code", redirect_uri: R } },
  jobber: { file: "jobber", id: "JOBBER_CLIENT_ID", secret: "JOBBER_CLIENT_SECRET", url: "https://api.getjobber.com/api/oauth/token", params: { grant_type: "authorization_code", code: "bogus-code", redirect_uri: R } },
  // eClinicalWorks sandbox: token_endpoint taken from the practice's public SMART configuration (staging-fhir.ecwcloud.com)
  eclinicalworks: { file: "eclinicalworks", id: "ECLINICALWORKS_SANDBOX_CLIENT_ID", secret: "ECLINICALWORKS_SANDBOX_CLIENT_SECRET", url: "https://staging-oauthserver.ecwcloud.com/oauth/oauth2/token", params: { grant_type: "authorization_code", code: "bogus-code", redirect_uri: R } },
  typeform: { file: "typeform", id: "TYPEFORM_CLIENT_ID", secret: "TYPEFORM_CLIENT_SECRET", url: "https://api.typeform.com/oauth/token", params: { grant_type: "authorization_code", code: "bogus-code", redirect_uri: R } },
  xero: { file: "xero", id: "XERO_CLIENT_ID", secret: "XERO_CLIENT_SECRET", url: "https://identity.xero.com/connect/token", basic: true, params: { grant_type: "authorization_code", code: "probe-invalid", redirect_uri: R } },
  zendesk: { file: "zendesk", id: "ZENDESK_CLIENT_ID", secret: "ZENDESK_CLIENT_SECRET", url: (e) => `https://${e.ZENDESK_SUBDOMAIN}.zendesk.com/oauth/tokens`, needs: ["ZENDESK_SUBDOMAIN"], json: true, params: { grant_type: "refresh_token", refresh_token: "bogus-refresh-token" } },
  "zoho-crm": { file: "zoho", id: "ZOHO_CLIENT_ID", secret: "ZOHO_CLIENT_SECRET", url: "https://accounts.zoho.com/oauth/v2/token", params: { grant_type: "refresh_token", refresh_token: "bogus-refresh-token" } },
  airtable: { file: "airtable", id: "AIRTABLE_CLIENT_ID", secret: "AIRTABLE_CLIENT_SECRET", url: "https://airtable.com/oauth2/v1/token", basic: true, params: { grant_type: "authorization_code", code: "bogus-code", code_verifier: "x".repeat(50), redirect_uri: R } },
  calendly: { file: "calendly", id: "CALENDLY_CLIENT_ID", secret: "CALENDLY_CLIENT_SECRET", url: "https://auth.calendly.com/oauth/token", params: { grant_type: "authorization_code", code: "bogus-code", redirect_uri: R } },
};
// Codes that mean "I read your client, and it is the code that is wrong". Vendor spellings: invalid_grant (RFC 6749),
// ErrTokenInvalid (Typeform, "invalid code"), OAUTH_013 (ClickUp, "code not found"), bad_verification_code.
const GRANT_LEVEL = /^(invalid_grant|ErrTokenInvalid|OAUTH_013|bad_verification_code|invalid_code|unauthorized_code)$/i;
const CLIENT_LEVEL = /^(invalid_client|unauthorized_client|INVALID_AUTHORIZATION|invalid_client_id|invalid_client_secret|AADSTS7000215|AADSTS700016)$/i;
const safe = (s) => (typeof s === "string" && /^[A-Za-z0-9_.-]{1,40}$/.test(s) ? s : "(unrecognized)");

async function tokenCall(p, e, secret) {
  const url = typeof p.url === "function" ? p.url(e) : p.url;
  const headers = { accept: "application/json" };
  const params = { ...p.params };
  if (p.basic) headers.authorization = `Basic ${Buffer.from(`${e[p.id]}:${secret}`).toString("base64")}`;
  else { params.client_id = e[p.id]; params.client_secret = secret; }
  let body;
  if (p.json) { headers["content-type"] = "application/json"; body = JSON.stringify(params); } else { headers["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(params); }
  const r = await fetch(url, { method: "POST", headers, body, redirect: "manual" });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch { /* non-JSON proves nothing */ }
  const raw = j.error ?? j.err ?? j.ECODE ?? j.errorCode ?? j.code ?? (/invalid_grant|invalid_client|unauthorized_client/.exec(t) || [])[0];
  let err = typeof raw === "object" && raw ? safe(raw.code) : raw === undefined ? "(none)" : safe(String(raw));
  if (err === "(none)" && Array.isArray(j.errors) && j.errors[0]?.code) err = safe(String(j.errors[0].code)); // Intercom: {errors:[{code}]}
  // Help Scout answers a bad code as invalid_request + "Invalid code" and a bad client as invalid_client.
  // Jobber answers in plain text; map its two distinct sentences onto the RFC 6749 codes.
  if (err === "(none)" && /authorization code was not valid/i.test(t)) err = "invalid_grant";
  if (err === "(none)" && /do not match an existing application/i.test(t)) err = "invalid_client";
  if (p.grantDesc && err === "invalid_request" && p.grantDesc.test(String(j.error_description || ""))) err = "invalid_code";
  return { http: r.status, err };
}
async function tokenProbe(key) {
  const p = TOKEN_PROBES[key];
  const out = { key, at: new Date().toISOString(), status: "NOT_CONFIGURED", names: [], steps: [] };
  const file = path.join(VAULT, `${p.file}.env`);
  if (!existsSync(file)) { out.steps.push(`no vault file ${p.file}.env`); return out; }
  const e = loadEnv(file); out.names = Object.keys(e).sort();
  const missing = [p.id, p.secret, ...(p.needs || [])].filter((n) => !e[n]);
  if (missing.length) { out.steps.push(`missing names: ${missing.join(", ")}`); return out; }
  out.status = "CONFIGURED";
  try {
    const real = await tokenCall(p, e, e[p.secret]);
    const ctrl = await tokenCall(p, e, "wrong-secret-" + "x".repeat(24));
    out.steps.push(`real secret: HTTP ${real.http} error=${real.err}`, `wrong-secret control: HTTP ${ctrl.http} error=${ctrl.err}`);
    const differs = real.http !== ctrl.http || real.err !== ctrl.err;
    if (GRANT_LEVEL.test(real.err) && differs) out.status = "CLIENT_VERIFIED";
    else if (CLIENT_LEVEL.test(real.err) && differs) out.status = "CLIENT_REJECTED";
    else out.steps.push(GRANT_LEVEL.test(real.err) ? "control answered the same as the real secret: client validity unproven" : "no grant-level error: client validity unproven");
  } catch (err) { out.steps.push(`token endpoint unreachable: ${err?.cause?.code || err?.name || "error"}`); }
  return out;
}

// Gusto demo issues a system-access token to a valid client; Square sandbox answers a locations read with a sandbox token.
async function gustoProbe() {
  const out = { key: "gusto", at: new Date().toISOString(), status: "NOT_CONFIGURED", names: [], steps: [] };
  const file = path.join(VAULT, "gusto.env"); if (!existsSync(file)) { out.steps.push("no vault file gusto.env"); return out; }
  const e = loadEnv(file); out.names = Object.keys(e).sort();
  if (!e.GUSTO_CLIENT_ID || !e.GUSTO_CLIENT_SECRET) { out.steps.push("missing names: GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET"); return out; }
  out.status = "CONFIGURED";
  const go = async (secret) => { const r = await fetch("https://api.gusto-demo.com/oauth/token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: e.GUSTO_CLIENT_ID, client_secret: secret, grant_type: "system_access" }) }); let j = {}; try { j = await r.json(); } catch { /* */ } return { http: r.status, issued: typeof j.access_token === "string" && j.access_token.length > 10 }; };
  try {
    const real = await go(e.GUSTO_CLIENT_SECRET), ctrl = await go("wrong-secret-" + "x".repeat(24));
    out.steps.push(`real secret: HTTP ${real.http} token_issued=${real.issued}`, `wrong-secret control: HTTP ${ctrl.http} token_issued=${ctrl.issued}`);
    if (real.issued && !ctrl.issued) out.status = "CLIENT_VERIFIED";
  } catch (err) { out.steps.push(`unreachable: ${err?.cause?.code || err?.name || "error"}`); }
  return out;
}
async function squareProbe() {
  const out = { key: "square", at: new Date().toISOString(), status: "NOT_CONFIGURED", names: [], steps: [] };
  const file = path.join(VAULT, "square.env"); if (!existsSync(file)) { out.steps.push("no vault file square.env"); return out; }
  const e = loadEnv(file); out.names = Object.keys(e).sort();
  if (!e.SQUARE_SANDBOX_ACCESS_TOKEN) { out.steps.push("missing names: SQUARE_SANDBOX_ACCESS_TOKEN"); return out; }
  out.status = "CONFIGURED";
  try {
    const r = await fetch("https://connect.squareupsandbox.com/v2/locations", { headers: { authorization: `Bearer ${e.SQUARE_SANDBOX_ACCESS_TOKEN}`, "square-version": "2025-01-23" } });
    const j = await r.json().catch(() => ({})); const n = (j.locations || []).length;
    out.steps.push(`sandbox locations: HTTP ${r.status} ${n} location(s)`);
    if (n) { out.status = "DATA_FLOWED_SANDBOX"; out.evidence = { object: "locations", record_count: n }; }
    else if (r.status === 401) out.status = "VALIDATE_FAILED";
  } catch (err) { out.steps.push(`unreachable: ${err?.cause?.code || err?.name || "error"}`); }
  return out;
}

// Static-credential vendors (API key / test token / demo token): one read with the real credential and one with a bogus
// control. Accepted by the vendor AND the control refused = CLIENT_VERIFIED; >= 1 record read = DATA_FLOWED_SANDBOX.
// These go straight to the vendor's REST API (no adapter exists for them yet), so evidence is the vendor answer only.
const BEARER_PROBES = {
  shippo: { file: "shippo", need: ["SHIPPO_TEST_TOKEN"], object: "addresses",
    call: (e, bad) => ["https://api.goshippo.com/addresses/?results=1", { headers: { authorization: `ShippoToken ${bad ? "shippo_test_" + "0".repeat(40) : e.SHIPPO_TEST_TOKEN}` } }], count: (j) => (j.results || []).length },
  fleetio: { file: "fleetio", need: ["FLEETIO_API_KEY", "FLEETIO_ACCOUNT_TOKEN"], object: "vehicles",
    call: (e, bad) => ["https://secure.fleetio.com/api/v1/vehicles?per_page=10", { headers: { authorization: `Token ${bad ? "0".repeat(32) : e.FLEETIO_API_KEY}`, "account-token": e.FLEETIO_ACCOUNT_TOKEN, accept: "application/json" } }], count: (j) => (Array.isArray(j) ? j.length : (j.records || []).length) },
  pandadoc: { file: "pandadoc", need: ["PANDADOC_SANDBOX_API_KEY"], object: "templates",
    call: (e, bad) => ["https://api.pandadoc.com/public/v1/templates?count=1", { headers: { authorization: `API-Key ${bad ? "0".repeat(40) : e.PANDADOC_SANDBOX_API_KEY}` } }], count: (j) => (j.results || []).length },
  mews: { file: "mews", need: ["MEWS_DEMO_CLIENT_TOKEN", "MEWS_DEMO_ACCESS_TOKEN", "MEWS_BASE_URL"], object: "configuration",
    call: (e, bad) => [`${e.MEWS_BASE_URL}/api/connector/v1/configuration/get`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ClientToken: e.MEWS_DEMO_CLIENT_TOKEN, AccessToken: bad ? "0".repeat(32) : e.MEWS_DEMO_ACCESS_TOKEN, Client: "LOVELEEDAY-probe" }) }], count: (j) => (j.Enterprise ? 1 : 0) },
};
async function bearerProbe(key) {
  const p = BEARER_PROBES[key];
  const out = { key, at: new Date().toISOString(), status: "NOT_CONFIGURED", names: [], steps: [] };
  const file = path.join(VAULT, `${p.file}.env`);
  if (!existsSync(file)) { out.steps.push(`no vault file ${p.file}.env`); return out; }
  const e = loadEnv(file); out.names = Object.keys(e).sort();
  const missing = p.need.filter((n) => !e[n]);
  if (missing.length) { out.steps.push(`missing names: ${missing.join(", ")}`); return out; }
  out.status = "CONFIGURED";
  try {
    const go = async (bad) => { const [u, init] = p.call(e, bad); const r = await fetch(u, { ...init, redirect: "manual" }); const j = await r.json().catch(() => ({})); return { http: r.status, n: r.ok ? p.count(j) : 0 }; };
    const real = await go(false), ctrl = await go(true);
    out.steps.push(`${p.object} read: HTTP ${real.http} ${real.n} record(s)`, `bogus-credential control: HTTP ${ctrl.http}`);
    if (real.http === 200 && ![200, 204].includes(ctrl.http)) {
      out.status = "CLIENT_VERIFIED";
      if (real.n) { out.status = "DATA_FLOWED_SANDBOX"; out.evidence = { object: p.object, record_count: real.n, via: "vendor REST API with the vendor test/demo credential (no adapter)" }; }
    } else if (real.http === 401 || real.http === 403) out.status = "VALIDATE_FAILED";
  } catch (err) { out.steps.push(`unreachable: ${err?.cause?.code || err?.name || "error"}`); }
  return out;
}

const getDefinitionKeys = () => new Set(readdirSync(path.join(root, "data/connectors/systems")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)));


async function probe(key) {
  if (key === "gusto") return gustoProbe();
  if (key === "square") return squareProbe();
  if (BEARER_PROBES[key]) return bearerProbe(key);
  if (TOKEN_PROBES[key]) return tokenProbe(key);
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
        if (err === "invalid_grant") {
          // wrong-secret control: a vendor that answers a wrong secret the same way never read our secret
          const bad = `wrong-secret-${"x".repeat(24)}`;
          const wrong = how === "client_secret_basic" ? { authorization: `Basic ${Buffer.from(`${o("CLIENT_ID")}:${bad}`).toString("base64")}` } : {};
          const cform = how === "client_secret_basic" ? form : new URLSearchParams({ ...Object.fromEntries(body), client_id: o("CLIENT_ID"), client_secret: bad });
          const cr = await fetch(o("TOKEN_URL"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json", ...wrong }, body: cform, redirect: "manual" });
          const ct = await cr.text(); let cerr = ""; try { cerr = String(JSON.parse(ct).error || ""); } catch { cerr = /invalid_grant|invalid_client|unauthorized_client/.exec(ct)?.[0] || ""; }
          out.steps.push(`wrong-secret control (${how}): HTTP ${cr.status} error=${code(cerr)}`);
          if (cerr !== "invalid_grant") { out.status = "CLIENT_VERIFIED"; break; }
          out.steps.push("control answered invalid_grant too: client validity unproven");
          continue;
        }
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
    const f = globalThis.fetch; // the SSRF guard pins real connections only for the native fetch; a wrapper is refused
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
const vaultKeys = existsSync(VAULT) ? readdirSync(VAULT).filter((f) => /^[a-z0-9-]+\.env$/.test(f)).map((f) => f.slice(0, -4)).map((f) => FILE_KEY[f] || f) : [];
const keys = arg === "--all" ? [...new Set([...Object.keys(VENDOR_FILES), ...vaultKeys])] : [arg];
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
