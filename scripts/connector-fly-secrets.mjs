#!/usr/bin/env node
// Stage the production OAuth app secrets the portal reads (lib/client-portal/connector-ui.ts oauthEndpoints) onto Fly.
// Usage: node scripts/connector-fly-secrets.mjs            dry run: "KEY: names... OK|SKIP reason" (no values anywhere)
//        node scripts/connector-fly-secrets.mjs --stage    pipe NAME=value lines into `flyctl secrets import -a arthur-online --stage`
//   arthur-cred run --use fly -- sh -c 'FLY_API_TOKEN=$FLY_ACCESS_TOKEN node scripts/connector-fly-secrets.mjs --stage'
// Eligible: latest probe (docs/connector-platform/probes/<key>.json) is CLIENT_VERIFIED or DATA_FLOWED_SANDBOX AND the
// system uses oauth2_authcode. Client id/secret come from the vault exactly as the sandbox probe reads them
// (scripts/lib/connector-vault.mjs). Sandbox-only credentials (CONNECTOR_CREDS_*, sandbox app keys) are never staged.
// Redirect URI registered with each vendor: https://portal.loveleedaystudios.com/api/client/connectors/oauth/callback
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { clientCreds } from "./lib/connector-vault.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const STAGE = process.argv.includes("--stage");
const APP = "arthur-online";

// PRODUCTION endpoints, each confirmed against the vendor's own documentation on 2026-10-05.
const ENDPOINTS = {
  airtable: { authorize: "https://airtable.com/oauth2/v1/authorize", token: "https://airtable.com/oauth2/v1/token" }, // https://airtable.com/developers/web/api/oauth-reference
  box: { authorize: "https://account.box.com/api/oauth2/authorize", token: "https://api.box.com/oauth2/token" }, // https://developer.box.com/reference/get-authorize/
  calendly: { authorize: "https://calendly.com/oauth/authorize", token: "https://calendly.com/oauth/token" }, // https://calendly.com/.well-known/oauth-authorization-server
  clickup: { authorize: "https://app.clickup.com/api", token: "https://api.clickup.com/api/v2/oauth/token" }, // https://developer.clickup.com/docs/authentication
  "clio-manage": { authorize: "https://app.clio.com/oauth/authorize", token: "https://app.clio.com/oauth/token" }, // https://docs.developers.clio.com/api-docs/clio-manage/authorization/ (US region)
  "dropbox-business": { authorize: "https://www.dropbox.com/oauth2/authorize", token: "https://www.dropbox.com/oauth2/token" }, // https://docs.dropboxapi.com/dropbox-api/docs/oauth
  "google-workspace": { authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token" }, // https://developers.google.com/identity/protocols/oauth2/web-server
  monday: { authorize: "https://auth.monday.com/oauth2/authorize", token: "https://auth.monday.com/oauth2/token" }, // https://developer.monday.com/apps/docs/oauth
  pipedrive: { authorize: "https://oauth.pipedrive.com/oauth/authorize", token: "https://oauth.pipedrive.com/oauth/token" }, // https://pipedrive.readme.io/docs/marketplace-oauth-authorization
  typeform: { authorize: "https://api.typeform.com/oauth/authorize", token: "https://api.typeform.com/oauth/token" }, // https://www.typeform.com/developers/get-started/applications/
  xero: { authorize: "https://login.xero.com/identity/connect/authorize", token: "https://identity.xero.com/connect/token" }, // https://identity.xero.com/.well-known/openid-configuration
};

// Credentials the vault holds are for a vendor sandbox/development app, not a production one.
const SANDBOX_ONLY = {
  procore: "vault holds PROCORE_SANDBOX_* app keys only",
  square: "vault holds SQUARE_SANDBOX_* keys only",
  gusto: "client verified against api.gusto-demo.com (demo app), not production",
  "quickbooks-online": "Intuit development keys (sandbox company); production keys need app assessment",
};

const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
const upper = (k) => k.toUpperCase().replace(/[^A-Z0-9]/g, "_");

// Read-only scopes from the system JSON: keep the scope token, drop prose ("UNVERIFIED", "None: ...", "Per Clio ...").
function scopesFor(sys) {
  const out = [];
  for (const raw of sys.auth?.scopes_needed_read || []) {
    const t = String(raw).replace(/\s*\(.*\)\s*$/, "").trim();
    if (/^[A-Za-z0-9_.:\/-]+$/.test(t) && !/^(None|UNVERIFIED)$/i.test(t)) out.push(t);
  }
  return [...new Set(out)];
}

const probesDir = path.join(root, "docs/connector-platform/probes");
const keys = (await import("node:fs")).readdirSync(probesDir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
const lines = [], staged = [], skipped = [];

for (const key of keys) {
  const status = readJson(path.join(probesDir, `${key}.json`)).status;
  if (!["CLIENT_VERIFIED", "DATA_FLOWED_SANDBOX"].includes(status)) continue;
  const sysFile = path.join(root, "data/connectors/systems", `${key}.json`);
  const sys = existsSync(sysFile) ? readJson(sysFile) : null;
  if (sys?.auth?.method !== "oauth2_authcode") continue;
  const P = `CONNECTOR_OAUTH_${upper(key)}_`;
  const names = ["AUTHORIZE_URL", "TOKEN_URL", "CLIENT_ID", "CLIENT_SECRET", "SCOPES"].map((n) => P + n);
  const skip = (why) => { skipped.push(`${key}: ${why}`); console.log(`${key}: ${names.join(" ")} SKIP ${why}`); };
  if (SANDBOX_ONLY[key]) { skip(`sandbox-only credentials (${SANDBOX_ONLY[key]})`); continue; }
  const ep = ENDPOINTS[key];
  if (!ep) { skip("no confirmed production authorize/token URL in table"); continue; }
  const c = clientCreds(key);
  if (c.missingFile) { skip("no vault file"); continue; }
  if (!c.id || !c.secret) { skip("vault file lacks client id or secret"); continue; }
  lines.push(`${P}AUTHORIZE_URL=${ep.authorize}`, `${P}TOKEN_URL=${ep.token}`, `${P}CLIENT_ID=${c.id}`, `${P}CLIENT_SECRET=${c.secret}`, `${P}SCOPES=${scopesFor(sys).join(" ")}`);
  staged.push(key);
  console.log(`${key}: ${names.join(" ")} OK`);
}

console.log(`\neligible OK: ${staged.length} (${staged.join(", ")}); skipped: ${skipped.length}`);
for (const s of skipped) console.log(`  skip ${s}`);

if (STAGE) {
  if (!staged.length) { console.log("nothing to stage"); process.exit(2); }
  if (!process.env.FLY_API_TOKEN) { console.log("FLY_API_TOKEN not set: run through arthur-cred (see header)"); process.exit(2); }
  // Values go over stdin only; flyctl's own output is discarded except the exit code.
  const r = spawnSync("flyctl", ["secrets", "import", "-a", APP, "--stage"], { input: lines.join("\n") + "\n", encoding: "utf8" });
  console.log(r.status === 0 ? `staged ${lines.length} secrets on ${APP} (flyctl exit 0)` : `flyctl exit ${r.status}: ${(r.stderr || "").replace(/=\S+/g, "=<redacted>").slice(0, 300)}`);
  process.exit(r.status ?? 1);
}
