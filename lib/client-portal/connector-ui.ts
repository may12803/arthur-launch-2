// UI-side connector model for the client portal. A shim over the 48 researched system definitions
// (connector-catalog.generated.ts, from data/connectors/systems/*.json) plus the 14 legacy `connectors` rows, and the
// pure functions the screens use: catalog grouping, the connection state ladder, computed data health, CSV parsing and
// column auto-mapping. Reconcile with lib/connectors/* (theme B) at merge; nothing here talks to a database.
//
// Status words follow the connector reality ladder: a connection reads "Live" only when its health is healthy AND data
// moved inside its freshness window. A credential alone is "Connected", never "Live".

import { CATALOG_SOURCES, type CatalogSource } from "./connector-catalog.generated";
import type { Connector, ConnStatus } from "./connections";

export type HealthValue = "unknown" | "healthy" | "stale" | "failing" | "not_running";

// tenant_connections as the screens read it: the legacy columns plus the platform's additions (CONTRACT.md).
export type ConnRow = {
  id?: string;
  connector_key: string;
  definition_key?: string | null;
  status: ConnStatus;
  auth_method?: string | null;
  access?: "read" | "read_write";
  managed_by?: "client" | "loveleeday";
  note?: string | null;
  proof?: string | null;
  error?: string | null;
  last_probe_at?: string | null;
  updated_at?: string | null;
  external_account_id?: string | null;
  scopes?: string[] | null;
  token_expires_at?: string | null;
  health?: HealthValue | null;
  last_success_at?: string | null;
  last_rows?: number | null;
  stale_after?: string | null;
};

export type SyncRun = {
  id: string;
  connection_id: string;
  object: string | null;
  started_at: string;
  finished_at: string | null;
  status: "running" | "succeeded" | "failed" | "partial";
  rows_read: number | null;
  rows_written: number | null;
  error: string | null;
  attempt: number | null;
};

export type MethodBadge = "Sign in" | "Key" | "Invite" | "File";

export const GROUPS = [
  { id: "erp", label: "ERP and accounting", categories: ["erp", "accounting"] },
  { id: "sales", label: "CRM, sales and commerce", categories: ["crm", "commerce", "pos", "payments", "marketing"] },
  { id: "property", label: "Property and construction", categories: ["property", "construction"] },
  { id: "people", label: "Payroll and people", categories: ["hr_payroll"] },
  { id: "public", label: "Public sector, nonprofit and legal", categories: ["public_sector", "nonprofit", "legal"] },
  { id: "data", label: "Data, files and email", categories: ["warehouse", "files", "ingest", "productivity"] },
  { id: "other", label: "Other systems", categories: [] as string[] },
] as const;
export type GroupId = (typeof GROUPS)[number]["id"];

export const CATEGORY_LABEL: Record<string, string> = {
  erp: "ERP", accounting: "Accounting", crm: "CRM and sales", commerce: "Commerce", pos: "Point of sale", payments: "Payments",
  marketing: "Email marketing", property: "Property management", construction: "Construction", hr_payroll: "Payroll and HR",
  public_sector: "Public sector", nonprofit: "Donor management", legal: "Legal practice", warehouse: "Data warehouse",
  files: "Files", ingest: "File upload", productivity: "Email and documents",
};

export const AUTH_LABEL: Record<string, string> = {
  oauth2_authcode: "Sign in with the vendor (OAuth)",
  oauth2_client_credentials: "Client ID and secret",
  oauth1_tba: "Token-based authentication",
  api_key: "API key",
  basic: "Service user name and password",
  service_account: "Service account file",
  key_pair: "Key pair (we give you the public key)",
  jwt: "Signed token",
  sftp: "Scheduled file drop (SFTP)",
  upload: "File upload",
  none: "Upload a file",
  invite: "Add LOVELEEDAY as a user",
};

export type CatalogEntry = CatalogSource & {
  group: GroupId;
  categoryLabel: string;
  methods: MethodBadge[];
  gate: { kind: "self_serve" | "partner"; label: string; detail: string };
  legacy: Connector | null;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function groupOf(category: string): GroupId {
  return GROUPS.find((g) => (g.categories as readonly string[]).includes(category))?.id ?? "other";
}

export function methodBadges(authMethod: string, recommendedPath?: string): MethodBadge[] {
  const out: MethodBadge[] = [];
  if (authMethod === "oauth2_authcode") out.push("Sign in");
  else if (authMethod === "none" || authMethod === "upload") out.push("File");
  else if (authMethod === "invite") out.push("Invite");
  else out.push("Key");
  if (recommendedPath === "sftp_csv" && !out.includes("File")) out.push("File");
  return out;
}

export function accessGate(s: Pick<CatalogSource, "partnerRequired" | "partnerProgram" | "customerAdmin" | "timeToApproval" | "authMethod">): CatalogEntry["gate"] {
  if (s.partnerRequired) {
    return {
      kind: "partner",
      label: "Needs vendor approval",
      detail: `${s.partnerProgram ? `${s.partnerProgram}. ` : ""}${s.timeToApproval ? `Typical wait: ${s.timeToApproval}.` : "The vendor reviews our access before your sign-in can complete."} We request it with you; nothing is read until it is granted.`,
    };
  }
  return {
    kind: "self_serve",
    label: s.authMethod === "none" ? "Available now" : "Self-serve",
    detail: s.customerAdmin || "Your administrator authorizes read access. No vendor approval is needed.",
  };
}

export function buildCatalog(legacy: Connector[] = []): CatalogEntry[] {
  const used = new Set<string>();
  const entries: CatalogEntry[] = CATALOG_SOURCES.map((s) => {
    const match = legacy.find((l) => l.key === s.key || norm(l.name) === norm(s.name) || norm(l.key) === norm(s.key));
    if (match) used.add(match.key);
    return {
      ...s,
      group: groupOf(s.category),
      categoryLabel: CATEGORY_LABEL[s.category] ?? s.category,
      methods: methodBadges(s.authMethod, s.recommendedPath),
      gate: accessGate(s),
      legacy: match ?? null,
    };
  });
  for (const l of legacy) {
    if (used.has(l.key)) continue;
    const authMethod = l.method === "oauth" ? "oauth2_authcode" : l.method === "key" ? "api_key" : "invite";
    const base: CatalogSource = {
      key: l.key, name: l.name, vendor: l.name, category: l.category, authMethod, recommendedPath: "direct",
      partnerRequired: false, partnerProgram: "", selfServeDev: true, customerAdmin: l.invite_steps ?? "", timeToApproval: "",
      scopes: l.read_scope ? [l.read_scope] : [], objects: [], incremental: "", sandbox: null, logo: null,
    };
    entries.push({
      ...base,
      group: groupOf(l.category),
      categoryLabel: l.category,
      methods: methodBadges(authMethod),
      gate: accessGate(base),
      legacy: l,
    });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

export function findConnection(rows: ConnRow[], e: Pick<CatalogEntry, "key" | "legacy">): ConnRow | undefined {
  return rows.find((r) => r.definition_key === e.key || r.connector_key === e.key || (e.legacy && r.connector_key === e.legacy.key));
}

// ---- state ladder ---------------------------------------------------------------------------------------------

export type Tone = "good" | "wait" | "bad" | "info" | "off";
export type ConnState = {
  id: "live" | "verified" | "connected" | "stale" | "failing" | "not_running" | "requested" | "invited" | "verifying" | "paused" | "disconnected" | "none";
  label: string;
  tone: Tone;
  reason: string;
};

export function parseIntervalHours(v: string | null | undefined): number {
  if (!v) return 26;
  const hms = v.match(/^(?:(\d+)\s*days?\s*)?(\d+):(\d{2}):(\d{2})/);
  if (hms) return Number(hms[1] || 0) * 24 + Number(hms[2]) + Number(hms[3]) / 60;
  const h = v.match(/(\d+(?:\.\d+)?)\s*hours?/i);
  if (h) return Number(h[1]);
  const d = v.match(/(\d+(?:\.\d+)?)\s*days?/i);
  if (d) return Number(d[1]) * 24;
  const iso = v.match(/^PT(\d+)H/i);
  if (iso) return Number(iso[1]);
  return 26;
}

export function ago(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 90) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

export function connState(row: ConnRow | undefined, now: number = Date.now()): ConnState {
  if (!row) return { id: "none", label: "Not connected", tone: "off", reason: "Nothing has been authorized yet." };
  const s = row.status;
  if (s === "not_connected") return { id: "none", label: "Not connected", tone: "off", reason: "Nothing has been authorized yet." };
  if (s === "disconnected") return { id: "disconnected", label: "Disconnected", tone: "off", reason: "Access was removed and any stored credential deleted." };
  if (s === "paused") return { id: "paused", label: "Paused", tone: "off", reason: "Syncing is paused. Nothing is being read." };
  if (s === "requested") return { id: "requested", label: "Requested", tone: "info", reason: "We are setting this up with you." };
  if (s === "invited") return { id: "invited", label: "Invite sent", tone: "info", reason: "Waiting for us to confirm the invitation arrived." };
  if (s === "key_received") return { id: "verifying", label: "Verifying key", tone: "wait", reason: "Key stored encrypted. A live read will confirm it." };
  if (s === "error" || row.health === "failing") return { id: "failing", label: "Needs attention", tone: "bad", reason: row.error || "The last sync failed." };
  // connected / live from here on
  const hasHealth = row.health != null;
  if (!hasHealth) {
    if (s === "live") return { id: "verified", label: "Verified", tone: "good", reason: row.proof || "A live read was proven. Scheduled syncing has not reported yet." };
    return { id: "connected", label: "Connected", tone: "wait", reason: "Authorized. No data has been read yet." };
  }
  const limit = parseIntervalHours(row.stale_after);
  const ageH = row.last_success_at ? (now - new Date(row.last_success_at).getTime()) / 3.6e6 : Infinity;
  if (row.health === "not_running") return { id: "not_running", label: "Not running", tone: "wait", reason: "The connection is authorized but no sync is scheduled or running." };
  if (row.health === "stale" || ageH > limit) {
    return { id: "stale", label: "Stale", tone: "wait", reason: row.last_success_at ? `Last data ${ago(row.last_success_at, now)}, expected within ${Math.round(limit)} hr.` : "No successful sync yet." };
  }
  if (row.health === "healthy" && (row.last_rows ?? 0) > 0) return { id: "live", label: "Live", tone: "good", reason: `${(row.last_rows ?? 0).toLocaleString("en-US")} rows read ${ago(row.last_success_at, now)}.` };
  return { id: "connected", label: "Connected", tone: "wait", reason: "Authorized and healthy, but the last sync moved no rows." };
}

// ---- data health, always computed ------------------------------------------------------------------------------

export type HealthLine = { key: string; name: string; group: GroupId; state: ConnState; lastSuccess: string | null; lastRows: number | null };
export type DataHealth = {
  total: number; live: number; stale: number; failing: number; notRunning: number; pending: number;
  coverage: { group: GroupId; label: string; connected: number; available: number }[];
  lines: HealthLine[];
};

export function computeDataHealth(entries: CatalogEntry[], rows: ConnRow[], now: number = Date.now()): DataHealth {
  const lines: HealthLine[] = [];
  for (const r of rows) {
    const e = entries.find((x) => x.key === r.definition_key || x.key === r.connector_key || x.legacy?.key === r.connector_key);
    const state = connState(r, now);
    if (state.id === "none" || state.id === "disconnected") continue;
    lines.push({ key: e?.key ?? r.connector_key, name: e?.name ?? r.connector_key, group: e?.group ?? "other", state, lastSuccess: r.last_success_at ?? r.last_probe_at ?? null, lastRows: r.last_rows ?? null });
  }
  const count = (id: ConnState["id"][]) => lines.filter((l) => id.includes(l.state.id)).length;
  const coverage = GROUPS.map((g) => ({
    group: g.id,
    label: g.label,
    available: entries.filter((e) => e.group === g.id).length,
    connected: lines.filter((l) => l.group === g.id && ["live", "verified"].includes(l.state.id)).length,
  })).filter((c) => c.available > 0);
  return {
    total: lines.length,
    live: count(["live", "verified"]),
    stale: count(["stale"]),
    failing: count(["failing"]),
    notRunning: count(["not_running"]),
    pending: count(["requested", "invited", "verifying", "connected"]),
    coverage,
    lines,
  };
}

// ---- upload: CSV parse and column mapping ------------------------------------------------------------------------

export type TargetField = { key: string; label: string; required?: boolean; aliases: string[]; type: "id" | "text" | "date" | "number" | "email" | "phone" };
export type UploadTarget = { id: string; label: string; fields: TargetField[] };

const F = (key: string, label: string, type: TargetField["type"], aliases: string[], required = false): TargetField => ({ key, label, type, aliases, required });

export const UPLOAD_TARGETS: UploadTarget[] = [
  { id: "contacts", label: "Customers, donors and contacts", fields: [
    F("external_id", "Record ID", "id", ["id", "customer id", "account number", "constituent id", "donor id", "contact id", "account id", "member id"], true),
    F("name", "Name", "text", ["name", "customer name", "donor name", "company", "organization", "full name", "account name"], true),
    F("email", "Email", "email", ["email", "email address", "e-mail"]),
    F("phone", "Phone", "phone", ["phone", "telephone", "mobile", "phone number"]),
    F("address", "Street address", "text", ["address", "addr 1", "address 1", "street", "mailing address", "billing address"]),
    F("city", "City", "text", ["city", "town"]),
    F("region", "State or region", "text", ["state", "region", "province"]),
    F("postal_code", "Postal code", "text", ["zip", "postal", "postcode", "zip code", "postal code"]),
    F("status", "Status", "text", ["status", "active", "stage"]),
  ] },
  { id: "invoices", label: "Invoices and bills", fields: [
    F("invoice_number", "Invoice number", "id", ["invoice", "invoice number", "invoice no", "inv #", "bill number", "document number"], true),
    F("counterparty", "Customer or vendor", "text", ["customer", "vendor", "supplier", "payee", "bill to", "counterparty"]),
    F("issue_date", "Issue date", "date", ["date", "invoice date", "issue date", "posted"], true),
    F("due_date", "Due date", "date", ["due", "due date"]),
    F("amount", "Amount", "number", ["amount", "total", "invoice amount", "balance", "amt"], true),
    F("currency", "Currency", "text", ["currency", "ccy"]),
    F("status", "Status", "text", ["status", "state", "paid"]),
    F("entity", "Entity or location", "text", ["entity", "location", "store", "property", "site", "department"]),
  ] },
  { id: "payments", label: "Payments and gifts", fields: [
    F("payment_id", "Payment reference", "id", ["payment id", "reference", "transaction id", "gift id", "check number", "ref"]),
    F("counterparty", "Payer or payee", "text", ["payer", "payee", "donor", "customer", "name"]),
    F("paid_on", "Payment date", "date", ["date", "paid on", "gift date", "payment date", "posted"], true),
    F("amount", "Amount", "number", ["amount", "gift amount", "gift amt", "total", "amt"], true),
    F("method", "Method", "text", ["method", "pay method", "payment method", "type"]),
    F("category", "Fund or category", "text", ["fund", "fund desc", "category", "campaign", "appeal"]),
  ] },
  { id: "orders", label: "Orders", fields: [
    F("order_number", "Order number", "id", ["order", "order number", "order id", "po", "so number"], true),
    F("counterparty", "Customer", "text", ["customer", "buyer", "ship to", "account"]),
    F("ordered_on", "Order date", "date", ["date", "order date", "ordered"], true),
    F("quantity", "Quantity", "number", ["qty", "quantity", "units"]),
    F("amount", "Order total", "number", ["total", "amount", "order total"]),
    F("status", "Status", "text", ["status", "state"]),
    F("entity", "Entity or location", "text", ["location", "store", "warehouse", "site"]),
  ] },
  { id: "items", label: "Items and inventory", fields: [
    F("sku", "Item number", "id", ["sku", "item", "item number", "part", "part number", "product code"], true),
    F("description", "Description", "text", ["description", "name", "item name", "product"]),
    F("category", "Category", "text", ["category", "class", "group", "type"]),
    F("on_hand", "Quantity on hand", "number", ["on hand", "qty on hand", "stock", "quantity", "inventory"]),
    F("unit_cost", "Unit cost", "number", ["cost", "unit cost", "std cost", "standard cost"]),
    F("entity", "Entity or location", "text", ["location", "warehouse", "store", "site", "plant"]),
  ] },
  { id: "ledger", label: "Ledger entries", fields: [
    F("account", "Account", "id", ["account", "gl account", "acct", "account code", "ledger"], true),
    F("posted_on", "Posting date", "date", ["date", "posting date", "posted", "period"], true),
    F("debit", "Debit", "number", ["debit", "dr"]),
    F("credit", "Credit", "number", ["credit", "cr"]),
    F("amount", "Amount", "number", ["amount", "net", "balance"]),
    F("memo", "Memo", "text", ["memo", "description", "narrative", "note"]),
    F("entity", "Entity or location", "text", ["entity", "location", "department", "cost center", "property"]),
  ] },
  { id: "people", label: "People and payroll", fields: [
    F("employee_id", "Employee ID", "id", ["employee id", "emp id", "id", "worker id"], true),
    F("name", "Name", "text", ["name", "employee", "employee name", "full name"], true),
    F("department", "Department", "text", ["department", "dept", "team"]),
    F("location", "Location", "text", ["location", "site", "store", "office"]),
    F("start_date", "Start date", "date", ["start", "hire date", "start date", "hired"]),
    F("status", "Status", "text", ["status", "active"]),
  ] },
];

export function parseCsv(input: string): { headers: string[]; rows: string[][]; delimiter: string } {
  const text = input.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = ["\t", ";", ","].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"') q = true;
    else if (c === delimiter) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim() !== "")) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  const headers = (rows.shift() ?? []).map((h) => h.trim());
  return { headers, rows, delimiter };
}

export type DetectedType = "Identifier" | "Date" | "Number" | "Email" | "Phone" | "Free text";
export function detectType(samples: string[]): DetectedType {
  const s = samples.map((x) => x.trim()).filter(Boolean);
  if (!s.length) return "Free text";
  const all = (re: RegExp) => s.every((x) => re.test(x));
  if (all(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i)) return "Email";
  if (all(/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/) || all(/^\d{1,2}\s[A-Za-z]{3,9}\s\d{4}$/)) return "Date";
  if (all(/^-?\$?[\d,]+(\.\d+)?$/)) return "Number";
  if (all(/^[+\d][\d\s().-]{6,}$/)) return "Phone";
  if (all(/^[A-Za-z]{0,4}[-_]?\d{3,}[A-Za-z0-9-]*$/)) return "Identifier";
  return "Free text";
}

export type ColumnMap = { column: string; index: number; sample: string; detected: DetectedType; field: string | null; confidence: number };

export function autoMap(headers: string[], rows: string[][], target: UploadTarget): ColumnMap[] {
  const taken = new Set<string>();
  const proposals = headers.map((h, index) => {
    const n = h.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    const samples = rows.slice(0, 25).map((r) => r[index] ?? "");
    let best: { field: string; score: number } | null = null;
    for (const f of target.fields) {
      let score = 0;
      for (const a of f.aliases) {
        if (n === a) score = Math.max(score, 0.98);
        else if (n.includes(a) || a.includes(n)) score = Math.max(score, n.length > 2 ? 0.8 : 0);
      }
      if (n === f.label.toLowerCase()) score = Math.max(score, 0.99);
      const det = detectType(samples);
      const typeOk = (f.type === "date" && det === "Date") || (f.type === "number" && det === "Number") || (f.type === "email" && det === "Email") || (f.type === "phone" && det === "Phone") || (f.type === "id" && det === "Identifier");
      if (score > 0 && typeOk) score = Math.min(0.99, score + 0.05);
      if (score > 0 && (f.type === "date" || f.type === "number") && !typeOk && det !== "Free text") score -= 0.2;
      if (score > (best?.score ?? 0)) best = { field: f.key, score };
    }
    return { index, h, samples, best };
  });
  const out: ColumnMap[] = [];
  for (const p of [...proposals].sort((a, b) => (b.best?.score ?? 0) - (a.best?.score ?? 0))) {
    let field: string | null = null, confidence = 0;
    if (p.best && p.best.score >= 0.5 && !taken.has(p.best.field)) { field = p.best.field; confidence = Math.round(p.best.score * 100); taken.add(field); }
    else if (p.best) confidence = Math.round(Math.min(p.best.score, 0.49) * 100);
    out[p.index] = { column: p.h, index: p.index, sample: p.samples.find((s) => s.trim()) ?? "", detected: detectType(p.samples), field, confidence };
  }
  return out;
}

// Cells that start with a formula character are neutralized, so a spreadsheet opened later cannot execute them.
export function neutralizeCell(v: string): string {
  return /^[=+\-@\t\r]/.test(v) && !/^-?[\d.,]+$/.test(v) ? `'${v}` : v;
}

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

// Dates arrive as ISO, US numeric (m/d/y) or "5 Oct 2026". Returns YYYY-MM-DD or null, never a guess.
export function parseDateValue(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, mo: number, d: number;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/))) { mo = +m[1]; d = +m[2]; y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; }
  else if ((m = s.match(/^(\d{1,2})\s([A-Za-z]{3})[a-z]*\s(\d{4})$/))) { d = +m[1]; mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; y = +m[3]; }
  else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}

export function parseNumberValue(v: string): number | null {
  const s = v.trim().replace(/^\((.*)\)$/, "-$1").replace(/[$,\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

// ---- OAuth hooks (declared here, reconciled with lib/connectors/auth/oauth2.ts at merge) ----------------------------

export type OAuthEndpoints = { authorizeUrl: string; tokenUrl: string; clientId: string; clientSecret: string; scopes: string[] };

// Endpoints and client credentials come from environment names per system, e.g. CONNECTOR_OAUTH_XERO_AUTHORIZE_URL,
// _TOKEN_URL, _CLIENT_ID, _CLIENT_SECRET, _SCOPES. Returns null when this system is not configured, in which case the
// screens say "sign-in is not set up yet" rather than sending a person to a dead end.
export function oauthEndpoints(key: string, env: Record<string, string | undefined> = process.env): OAuthEndpoints | null {
  const p = `CONNECTOR_OAUTH_${key.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_`;
  const authorizeUrl = env[`${p}AUTHORIZE_URL`], tokenUrl = env[`${p}TOKEN_URL`], clientId = env[`${p}CLIENT_ID`], clientSecret = env[`${p}CLIENT_SECRET`];
  if (!authorizeUrl || !tokenUrl || !clientId || !clientSecret) return null;
  return { authorizeUrl, tokenUrl, clientId, clientSecret, scopes: (env[`${p}SCOPES`] || "").split(/[ ,]+/).filter(Boolean) };
}

// ---- developer settings and notification vocabularies (shared by screens and routes) -------------------------------

export const API_KEY_SCOPES = ["read:connections", "read:data", "read:approvals", "read:audit"];
export const WEBHOOK_EVENTS = ["connection.synced", "connection.failed", "approval.created", "approval.decided", "upload.imported"];
export const NOTIFY_EVENTS = ["connection_failing", "connection_stale", "approval_waiting", "weekly_digest"];

export type TokenSet ={ access_token: string; refresh_token?: string; expires_at?: string; token_type?: string; scope?: string; rotated_at: string };

export async function exchangeOAuthCode(ep: OAuthEndpoints, args: { code: string; redirectUri: string; codeVerifier: string }): Promise<TokenSet> {
  const body = new URLSearchParams({ grant_type: "authorization_code", code: args.code, redirect_uri: args.redirectUri, code_verifier: args.codeVerifier, client_id: ep.clientId, client_secret: ep.clientSecret });
  const res = await fetch(ep.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof j.access_token !== "string") throw new Error(`The vendor refused the sign-in (${res.status}${typeof j.error === "string" ? `: ${j.error}` : ""}).`);
  const expiresIn = typeof j.expires_in === "number" ? j.expires_in : null;
  return {
    access_token: j.access_token,
    refresh_token: typeof j.refresh_token === "string" ? j.refresh_token : undefined,
    expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined,
    token_type: typeof j.token_type === "string" ? j.token_type : "Bearer",
    scope: typeof j.scope === "string" ? j.scope : ep.scopes.join(" "),
    rotated_at: new Date().toISOString(),
  };
}
