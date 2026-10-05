// Shared vault access for the connector scripts (sandbox probe, Fly secrets stager). Values are never printed here.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export const VAULT = process.env.CONNECTOR_VAULT_DIR || path.join(homedir(), ".arthur/vault/connectors");

export function loadEnv(file) {
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
export const VENDOR_FILES = {
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


export function vendorEnv(key) {
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

// entry (airtable, calendly, ...) are probed under the file name.
export const FILE_KEY = { atlassian: "jira", clio: "clio-manage", dropbox: "dropbox-business", esri: "esri-arcgis", google: "google-workspace",
  helpscout: "help-scout", intuit: "quickbooks-online", microsoft: "microsoft-365", zoho: "zoho-crm", blackbaud: "blackbaud-raisers-edge-nxt" };

// Client id/secret for one catalog key: the mapped vendor file when VENDOR_FILES has it, else <FILE>.env with
// <FILE>_CLIENT_ID / <FILE>_CLIENT_SECRET. Returns { file, missingFile, id, secret } (values or undefined), never prints.
export function clientCreds(key) {
  const mapped = vendorEnv(key);
  const P = key.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  if (mapped) return { file: mapped.file, missingFile: !mapped.env, id: mapped.env?.[`CONNECTOR_OAUTH_${P}_CLIENT_ID`], secret: mapped.env?.[`CONNECTOR_OAUTH_${P}_CLIENT_SECRET`] };
  const stem = Object.entries(FILE_KEY).find(([, k]) => k === key)?.[0] || key;
  const file = path.join(VAULT, `${stem}.env`);
  if (!existsSync(file)) return { file, missingFile: true };
  const raw = loadEnv(file), U = stem.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return { file, id: raw[`${U}_CLIENT_ID`], secret: raw[`${U}_CLIENT_SECRET`] };
}
