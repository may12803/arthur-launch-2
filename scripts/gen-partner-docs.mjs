#!/usr/bin/env node
// Generates docs/connector-platform/partner/<key>.md for the 13 partner-gated systems.
// Vendor facts are copied VERBATIM from data/connectors/systems/<key>.json so UNVERIFIED markers survive.
// The interim CSV layouts come from lib/connectors/upload/interim-layouts.ts (the same layouts the mapper is tested against).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { INTERIM_LAYOUTS } = await import(path.join(root, 'lib/connectors/upload/interim-layouts.ts'));
const out = path.join(root, 'docs/connector-platform/partner');
fs.mkdirSync(out, { recursive: true });

const KEYS = ['yardi-voyager', 'mri-software', 'tyler-munis', 'appfolio', 'workday', 'adp-workforce-now', 'toast', 'clover', 'sage-intacct', 'xero', 'procore', 'gusto'];

const EVIDENCE = `- Secrets at rest: AES-256-GCM envelope (random 12-byte IV, authentication tag, key id, versioned format) in lib/connectors/crypto.ts; OAuth token sets live in Postgres encrypted with a per-tenant Vault key, and deleting that key crypto-shreds the tenant (docs/connector-platform/CONTRACT.md).
- OAuth: authorization code with PKCE S256, 32-byte random state stored hashed, bound to tenant + user + connector, single use, 10 minute TTL; refresh tokens rotate and the newest is always persisted with compare-and-set.
- Tenant isolation: row level security on every tenant table, restrictive MFA (aal2) policy, writes only through audited SECURITY DEFINER functions, audit log of actor/action/target.
- Least privilege: read scopes only are requested for the objects listed below; no service-role key exists in the pipeline; server jobs authenticate with a named server secret.
- File intake: per-tenant SFTP user chrooted to /tenants/<tenant_id>/inbox, ed25519 keys only, files processed by content hash so replays are no-ops, CSV formula-injection guard, size and row caps.
- Not evidenced in this repository (confirm outside the repo before answering a questionnaire): SOC 2 report, third-party penetration test, written incident response plan, data processing agreement template, cyber insurance certificate. UNVERIFIED.`;

const TYPICAL_QUESTIONS = [
  'Company legal name, address, year founded, number of employees, named security contact.',
  'Data flow diagram: which objects are read, where they are stored, which sub-processors touch them.',
  'Authentication: how customer credentials and tokens are stored, rotated and revoked; who inside the company can read them.',
  'Encryption in transit and at rest; key management and rotation.',
  'Tenant isolation model and how one customer cannot see another customer\'s data.',
  'Access control and MFA for staff; audit logging and retention.',
  'Vulnerability management, penetration testing cadence, dependency scanning.',
  'Incident response and breach notification timelines.',
  'Data retention and deletion on disconnect or contract end.',
  'Compliance attestations (SOC 2, ISO 27001) and sub-processor list.',
];

const row = (f) => `| ${f.name} | ${f.type} | ${f.required ? 'yes' : ''} |`;
const val = (v) => (v === undefined || v === null || v === '' ? 'not stated in the vendor research' : String(v));
const list = (a) => (a || []).map((x) => `- ${x}`).join('\n') || '- none recorded';

function layoutSection(key) {
  const layouts = INTERIM_LAYOUTS[key];
  return layouts
    .map(
      (l) => `### ${l.file} (object: ${l.object})

${l.description}. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
${l.fields.map(row).join('\n')}
`,
    )
    .join('\n');
}

function interim(key, j) {
  const base = `Until the partner credentials exist, data reaches us as files.

1. The customer exports the objects below from ${j ? j.system : 'the system'} (or schedules the export, where the vendor supports scheduled delivery; scheduled delivery is UNVERIFIED unless stated in the vendor notes above).
2. Files are uploaded in the portal (CSV or XLSX) or delivered by SFTP to \`/tenants/<tenant_id>/inbox/<object>/\` with a \`<file>.done\` marker file once complete.
3. Each file is parsed (RFC 4180 CSV or XLSX), formula-like cells are flagged, columns are mapped, and rows land in ingested_records with source_ref = file sha256 + ':' + row number, so re-sending a file adds nothing.

Expected layouts:

${layoutSection(key)}`;
  return base;
}

function render(key) {
  const file = path.join(root, 'data/connectors/systems', `${key}.json`);
  const j = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (!j) {
    return `# Sage (non-Intacct products): partner path

Status: no vendor research exists for this system in data/connectors/MATRIX.md (only Sage Intacct was researched). Every vendor fact below is UNVERIFIED and must be researched before any application is made.

## Program
- Program name: UNVERIFIED
- Review or listing: UNVERIFIED

## What to apply with
- Company: LOVELEEDAY Studios LLC. Requested access: read-only. Objects: general ledger transactions, customer invoices, supplier invoices.
- Customer-side step: UNVERIFIED

## Security questionnaire items
Typical items partner programs ask (not confirmed for Sage):
${TYPICAL_QUESTIONS.map((q) => `- ${q}`).join('\n')}

Evidence this codebase can supply today:
${EVIDENCE}

## Sandbox path
UNVERIFIED

## Cost and time
UNVERIFIED

## Interim SFTP/CSV path
${interim(key, null)}`;
  }
  const a = j.access_requirements;
  return `# ${j.system}: partner path

Generated from data/connectors/systems/${key}.json. Text in quotes of vendor research is copied verbatim; UNVERIFIED means no primary vendor source confirmed it and it must not be treated as fact.

Matrix recommended path: ${j.recommended_path}. Estimated build effort once access exists: ${j.build_effort_days} days. Auth when live: ${j.auth.method}.

## Program
- Program: ${val(a.partner_program_name)}
- Review or listing: ${val(a.app_review_or_marketplace_listing)}
- Self-serve developer account: ${a.self_serve_dev_account ? 'yes' : 'no'}; partner program required: ${a.partner_program_required ? 'yes' : 'no'}

## What to apply with
- Company: LOVELEEDAY Studios LLC. Use case: read-only data ingestion into the customer's own workspace for reporting and review.
- Objects requested (read):
${list(j.data_objects_to_pull)}
- Scopes or permissions: ${(j.auth.scopes_needed_read || []).join('; ') || 'none recorded'}
- Base URL per vendor research: ${val(j.api.base_url)}
- What the customer does on their side: ${val(a.customer_admin_must_do)}

## Security questionnaire items
Typical items partner programs ask (not confirmed per vendor unless the Program line above says a questionnaire exists):
${TYPICAL_QUESTIONS.map((q) => `- ${q}`).join('\n')}

Evidence this codebase can supply today:
${EVIDENCE}

## Sandbox path
- Available: ${val(j.sandbox.available)}
- How to get it: ${val(j.sandbox.how_to_get)}

## Cost and time
- Cost to us: ${val(a.cost_to_us)}
- Time to approval: ${val(a.time_to_approval)}
- Rate limits per vendor research: ${val(j.rate_limits)}

## Blockers recorded in the research
${list(j.blockers)}

## Interim SFTP/CSV path
${interim(key, j)}`;
}

for (const key of [...KEYS, 'sage']) {
  fs.writeFileSync(path.join(out, `${key}.md`), render(key).trimEnd() + '\n');
}
console.log(`wrote ${KEYS.length + 1} partner docs to ${path.relative(root, out)}`);
