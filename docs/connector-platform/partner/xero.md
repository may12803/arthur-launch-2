# Xero: partner path

Generated from data/connectors/systems/xero.json. Text in quotes of vendor research is copied verbatim; UNVERIFIED means no primary vendor source confirmed it and it must not be treated as fact.

Matrix recommended path: direct. Estimated build effort once access exists: 3 days. Auth when live: oauth2_authcode.

## Program
- Program: Xero App Store tiers (new from 2 March 2026): Starter, Core, Plus, Advanced, Enterprise
- Review or listing: App certification required for Plus, Advanced and Enterprise tiers; uncertified apps capped at 25 tenant connections (older rule) / tiered connection caps now
- Self-serve developer account: yes; partner program required: no

## What to apply with
- Company: LOVELEEDAY Studios LLC. Use case: read-only data ingestion into the customer's own workspace for reporting and review.
- Objects requested (read):
- Contacts
- Invoices
- Bills
- Payments
- BankTransactions
- Accounts
- Items
- ManualJournals
- Journals
- Reports (TrialBalance, P&L)
- Scopes or permissions: accounting.transactions.read; accounting.contacts.read; accounting.settings.read; accounting.reports.read; offline_access (scope names UNVERIFIED on a fetched page)
- Base URL per vendor research: https://api.xero.com/api.xro/2.0 (host from Nango providers.yaml; /api.xro/2.0 path UNVERIFIED on fetched page)
- What the customer does on their side: User with Standard or Advisor role clicks Connect and authorizes the organisation(s) in Xero consent screen; connection list via /connections.

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
- Available: true
- How to get it: Xero Demo Company free from any Xero account (UNVERIFIED on fetched page)

## Cost and time
- Cost to us: Monthly tier fees: Starter free (5 connections), Core AUD 35 (50), Plus AUD 245 (1,000), Advanced AUD 1,445 (10,000), Enterprise on application (unlimited) - via search snippet of developer.xero.com/pricing
- Time to approval: UNVERIFIED (certification review time not found)
- Rate limits per vendor research: Per-minute, daily, concurrent limits plus tier connection caps; search snippet reports daily limits 1,000/day Starter and 5,000/day higher tiers (verify at developer.xero.com/documentation/guides/oauth2/limits/ before relying, fetched page gave no numbers)

## Blockers recorded in the research
- 2026 tier pricing and certification gate: serving >50 customers needs Plus (AUD 245/mo) and app certification
- Small daily call cap on lower tiers, matters for backfill

## Interim SFTP/CSV path
Until the partner credentials exist, data reaches us as files.

1. The customer exports the objects below from Xero (or schedules the export, where the vendor supports scheduled delivery; scheduled delivery is UNVERIFIED unless stated in the vendor notes above).
2. Files are uploaded in the portal (CSV or XLSX) or delivered by SFTP to `/tenants/<tenant_id>/inbox/<object>/` with a `<file>.done` marker file once complete.
3. Each file is parsed (RFC 4180 CSV or XLSX), formula-like cells are flagged, columns are mapped, and rows land in ingested_records with source_ref = file sha256 + ':' + row number, so re-sending a file adds nothing.

Expected layouts:

### invoices.csv (object: invoices)

Sales and purchase invoices. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| contact_name | string | yes |
| invoice_number | string | yes |
| invoice_date | date | yes |
| due_date | date |  |
| total | money | yes |
| status | string |  |
| currency | string |  |

### bank_transactions.csv (object: bank_transactions)

Bank transactions. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| bank_account | string | yes |
| transaction_date | date | yes |
| amount | money | yes |
| payee | string |  |
| reference | string |  |

### contacts.csv (object: contacts)

Contacts. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| contact_name | string | yes |
| email | string |  |
| is_supplier | boolean |  |
| is_customer | boolean |  |
