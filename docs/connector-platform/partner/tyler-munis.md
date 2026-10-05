# Tyler Munis: partner path

Generated from data/connectors/systems/tyler-munis.json. Text in quotes of vendor research is copied verbatim; UNVERIFIED means no primary vendor source confirmed it and it must not be treated as fact.

Matrix recommended path: sftp_csv. Estimated build effort once access exists: 10 days. Auth when live: oauth2_client_credentials.

## Program
- Program: Tyler Platform Alliance (named by secondary source; Tyler's own page for it not found)
- Review or listing: None public
- Self-serve developer account: no; partner program required: yes

## What to apply with
- Company: LOVELEEDAY Studios LLC. Use case: read-only data ingestion into the customer's own workspace for reporting and review.
- Objects requested (read):
- GL accounts and journal
- vendors
- AP invoices
- POs
- budgets
- utility billing accounts
- employees (HR/payroll modules)
- Scopes or permissions: UNVERIFIED
- Base URL per vendor research: UNVERIFIED (per-customer Tyler-hosted endpoint)
- What the customer does on their side: Customer (the municipality) must have an active Tyler license and engage Tyler professional services to provision API credentials for us. Exact steps UNVERIFIED.

## Security questionnaire items
Typical items partner programs ask (not confirmed per vendor unless the Program line above says a questionnaire exists):
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
- Available: false
- How to get it: None public per secondary source ('no public signup, sandbox, or trial').

## Cost and time
- Cost to us: UNVERIFIED; customer-side cost is a Tyler implementation/services engagement
- Time to approval: UNVERIFIED
- Rate limits per vendor research: Not published; per secondary source surfaced only via support tickets.

## Blockers recorded in the research
- No self-serve access: needs Tyler license plus professional-services engagement per customer
- Docs and schemas login-gated; every fact above about auth is from a third-party summary
- Interim: customer-scheduled Munis report/export to SFTP (not verified; confirm with customer)

## Interim SFTP/CSV path
Until the partner credentials exist, data reaches us as files.

1. The customer exports the objects below from Tyler Munis (or schedules the export, where the vendor supports scheduled delivery; scheduled delivery is UNVERIFIED unless stated in the vendor notes above).
2. Files are uploaded in the portal (CSV or XLSX) or delivered by SFTP to `/tenants/<tenant_id>/inbox/<object>/` with a `<file>.done` marker file once complete.
3. Each file is parsed (RFC 4180 CSV or XLSX), formula-like cells are flagged, columns are mapped, and rows land in ingested_records with source_ref = file sha256 + ':' + row number, so re-sending a file adds nothing.

Expected layouts:

### gl_journal.csv (object: gl_journal)

General ledger journal lines. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| fund | string | yes |
| account | string | yes |
| journal_date | date | yes |
| description | string |  |
| debit | money |  |
| credit | money |  |

### ap_invoices.csv (object: ap_invoices)

Accounts payable invoices. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| vendor_id | string | yes |
| vendor_name | string |  |
| invoice_no | string | yes |
| invoice_date | date | yes |
| amount | money | yes |
| po_number | string |  |

### vendors.csv (object: vendors)

Vendor master. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| vendor_id | string | yes |
| vendor_name | string | yes |
| status | string |  |
