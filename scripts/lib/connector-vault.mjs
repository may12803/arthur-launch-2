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
const oauth = (file, P, TOKEN_URL) => ({ file, oauth: { CLIENT_ID: `${P}_CLIENT_ID`, CLIENT_SECRET: `${P}_CLIENT_SECRET` }, ...(TOKEN_URL ? { TOKEN_URL } : {}) });
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
  // Developer-access batch 2 (2026-10-05). The sandbox probe checks these with its own discriminating token/bearer probes
  // (scripts/connector-sandbox-probe.mjs TOKEN_PROBES / BEARER_PROBES); the entries here map the vault names for the Fly stager.
  "quickbooks-online": oauth("intuit", "INTUIT", "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"),
  xero: oauth("xero", "XERO", "https://identity.xero.com/connect/token"),
  salesforce: oauth("salesforce", "SALESFORCE", "https://login.salesforce.com/services/oauth2/token"), // per-org host: probe uses SALESFORCE_MY_DOMAIN
  hubspot: oauth("hubspot", "HUBSPOT", "https://api.hubapi.com/oauth/v1/token"),
  "google-workspace": oauth("google", "GOOGLE", "https://oauth2.googleapis.com/token"),
  box: oauth("box", "BOX", "https://api.box.com/oauth2/token"),
  "clio-manage": oauth("clio", "CLIO", "https://auth.api.clio.com/oauth/token"),
  docusign: oauth("docusign", "DOCUSIGN", "https://account-d.docusign.com/oauth/token"), // demo (developer) host
  zendesk: oauth("zendesk", "ZENDESK"), // token URL is per subdomain
  intercom: oauth("intercom", "INTERCOM", "https://api.intercom.io/auth/eagle/token"),
  "help-scout": oauth("helpscout", "HELPSCOUT", "https://api.helpscout.net/v2/oauth2/token"),
  pipedrive: oauth("pipedrive", "PIPEDRIVE", "https://oauth.pipedrive.com/oauth/token"),
  "zoho-crm": oauth("zoho", "ZOHO", "https://accounts.zoho.com/oauth/v2/token"),
  typeform: oauth("typeform", "TYPEFORM", "https://api.typeform.com/oauth/token"),
  calendly: oauth("calendly", "CALENDLY", "https://auth.calendly.com/oauth/token"),
  monday: oauth("monday", "MONDAY", "https://auth.monday.com/oauth2/token"),
  clickup: oauth("clickup", "CLICKUP", "https://api.clickup.com/api/v2/oauth/token"),
  jira: oauth("atlassian", "ATLASSIAN", "https://auth.atlassian.com/oauth/token"),
  airtable: oauth("airtable", "AIRTABLE", "https://airtable.com/oauth2/v1/token"),
  notion: oauth("notion", "NOTION", "https://api.notion.com/v1/oauth/token"),
  trello: oauth("trello", "TRELLO", "https://auth.atlassian.com/oauth/token"),
  wrike: oauth("wrike", "WRIKE", "https://login.wrike.com/oauth2/token"),
  jobber: oauth("jobber", "JOBBER", "https://api.getjobber.com/api/oauth/token"),
  eclinicalworks: oauth("eclinicalworks", "ECLINICALWORKS_SANDBOX", "https://staging-oauthserver.ecwcloud.com/oauth/oauth2/token"),
  // Static-credential vendors: no OAuth app, so nothing maps to CONNECTOR_OAUTH_*; listed so --all and the stager see the file.
  square: { file: "square" }, gusto: { file: "gusto" }, shippo: { file: "shippo" }, fleetio: { file: "fleetio" }, pandadoc: { file: "pandadoc" }, mews: { file: "mews" },
  stripe: { file: "stripe" }, // no connector OAuth client (status file: Stripe path is Connect onboarding or a customer-pasted restricted key)
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
