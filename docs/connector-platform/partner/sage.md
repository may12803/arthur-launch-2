# Sage (non-Intacct products): partner path

Status: no vendor research exists for this system in data/connectors/MATRIX.md (only Sage Intacct was researched). Every vendor fact below is UNVERIFIED and must be researched before any application is made.

## Program
- Program name: UNVERIFIED
- Review or listing: UNVERIFIED

## What to apply with
- Company: LOVELEEDAY Studios LLC. Requested access: read-only. Objects: general ledger transactions, customer invoices, supplier invoices.
- Customer-side step: UNVERIFIED

## Security questionnaire items
Typical items partner programs ask (not confirmed for Sage):
- Company legal name, address, year founded, number of employees, named security contact.
- Data flow diagram: which objects are read, where they are stored, which sub-processors touch them.
- Authentication: how customer credentials and tokens are stored, rotated and revoked; who inside the company can read them.
- Encryption in transit and at rest; key management and rotation.
- Tenant isolation model and how one customer cannot see another customer's data.
- Access control and MFA for staff; audit logging and retention.
- Vulnerability management, penetration testing cadence, dependency scanning.
- Incident response and breach notification timelines.
- Data retention and deletion on disconnect or contract end.
- Compliance attestations (SOC 2, ISO 27001) and sub-processor list.

Evidence this codebase can supply today:
- Secrets at rest: AES-256-GCM envelope (random 12-byte IV, authentication tag, key id, versioned format) in lib/connectors/crypto.ts; OAuth token sets live in Postgres encrypted with a per-tenant Vault key, and deleting that key crypto-shreds the tenant (docs/connector-platform/CONTRACT.md).
- OAuth: authorization code with PKCE S256, 32-byte random state stored hashed, bound to tenant + user + connector, single use, 10 minute TTL; refresh tokens rotate and the newest is always persisted with compare-and-set.
- Tenant isolation: row level security on every tenant table, restrictive MFA (aal2) policy, writes only through audited SECURITY DEFINER functions, audit log of actor/action/target.
- Least privilege: read scopes only are requested for the objects listed below; no service-role key exists in the pipeline; server jobs authenticate with a named server secret.
- File intake: per-tenant SFTP user chrooted to /tenants/<tenant_id>/inbox, ed25519 keys only, files processed by content hash so replays are no-ops, CSV formula-injection guard, size and row caps.
- Not evidenced in this repository (confirm outside the repo before answering a questionnaire): SOC 2 report, third-party penetration test, written incident response plan, data processing agreement template, cyber insurance certificate. UNVERIFIED.

## Sandbox path
UNVERIFIED

## Cost and time
UNVERIFIED

## Interim SFTP/CSV path
Until the partner credentials exist, data reaches us as files.

1. The customer exports the objects below from the system (or schedules the export, where the vendor supports scheduled delivery; scheduled delivery is UNVERIFIED unless stated in the vendor notes above).
2. Files are uploaded in the portal (CSV or XLSX) or delivered by SFTP to `/tenants/<tenant_id>/inbox/<object>/` with a `<file>.done` marker file once complete.
3. Each file is parsed (RFC 4180 CSV or XLSX), formula-like cells are flagged, columns are mapped, and rows land in ingested_records with source_ref = file sha256 + ':' + row number, so re-sending a file adds nothing.

Expected layouts:

### gl_transactions.csv (object: gl_transactions)

General ledger transactions. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| transaction_date | date | yes |
| account | string | yes |
| description | string |  |
| debit | money |  |
| credit | money |  |
| reference | string |  |

### ar_invoices.csv (object: ar_invoices)

Customer invoices. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| customer | string | yes |
| invoice_no | string | yes |
| invoice_date | date | yes |
| due_date | date |  |
| amount | money | yes |
| status | string |  |

### ap_invoices.csv (object: ap_invoices)

Supplier invoices. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| supplier | string | yes |
| invoice_no | string | yes |
| invoice_date | date | yes |
| due_date | date |  |
| amount | money | yes |
| status | string |  |
