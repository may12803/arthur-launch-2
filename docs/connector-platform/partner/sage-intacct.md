# Sage Intacct: partner path

Generated from data/connectors/systems/sage-intacct.json. Text in quotes of vendor research is copied verbatim; UNVERIFIED means no primary vendor source confirmed it and it must not be treated as fact.

Matrix recommended path: direct. Estimated build effort once access exists: 6 days. Auth when live: oauth2_client_credentials.

## Program
- Program: Sage Intacct developer program (client ID and secret are issued when you register an application; web services developer license with sender ID needed for legacy XML)
- Review or listing: Registration of the application with Sage required to receive client ID/secret; marketplace listing not required for private integration (UNVERIFIED)
- Self-serve developer account: no; partner program required: yes

## What to apply with
- Company: LOVELEEDAY Studios LLC. Use case: read-only data ingestion into the customer's own workspace for reporting and review.
- Objects requested (read):
- customers
- vendors
- ar-invoices
- ap-bills
- items
- gl-accounts
- gl-journal-entries
- gl-detail
- payments
- dimensions (location, department, project)
- Scopes or permissions: UNVERIFIED (permissions come from the Web Services user's role, not scopes)
- Base URL per vendor research: https://api.intacct.com/ia/api/v1 (from Nango providers.yaml: base https://api.intacct.com/ia/api, authorize/token under /ia/api/v1/oauth2/); legacy XML gateway also exists
- What the customer does on their side: Create a Web Services user (Company > Admin > Web Services Users > Add) with a role of needed permissions; then Company > Setup > Company > Edit > Security > Authorized Client Applications > Add, enter our Client ID and the Web Services user ID. For legacy XML also authorize our Web Services sender ID. Customer's subscription must include Web Services.

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
- How to get it: Developer/partner sandbox company provided with developer program; public self-serve UNVERIFIED

## Cost and time
- Cost to us: UNVERIFIED (developer license pricing not found)
- Time to approval: UNVERIFIED
- Rate limits per vendor research: UNVERIFIED on fetched page

## Blockers recorded in the research
- Must register as Sage developer to obtain client ID/secret (gatekeeping, cost UNVERIFIED)
- Customer needs web services entitlement and admin to authorize client app
- OpenAPI spec and rate limits not retrievable (403)

## Interim SFTP/CSV path
Until the partner credentials exist, data reaches us as files.

1. The customer exports the objects below from Sage Intacct (or schedules the export, where the vendor supports scheduled delivery; scheduled delivery is UNVERIFIED unless stated in the vendor notes above).
2. Files are uploaded in the portal (CSV or XLSX) or delivered by SFTP to `/tenants/<tenant_id>/inbox/<object>/` with a `<file>.done` marker file once complete.
3. Each file is parsed (RFC 4180 CSV or XLSX), formula-like cells are flagged, columns are mapped, and rows land in ingested_records with source_ref = file sha256 + ':' + row number, so re-sending a file adds nothing.

Expected layouts:

### gl_journal_entries.csv (object: gl_journal_entries)

GL journal lines. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| batch_no | string | yes |
| posting_date | date | yes |
| account_no | string | yes |
| debit | money |  |
| credit | money |  |
| location | string |  |
| department | string |  |
| memo | string |  |

### ap_bills.csv (object: ap_bills)

AP bills. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| vendor_id | string | yes |
| bill_no | string | yes |
| bill_date | date | yes |
| due_date | date |  |
| amount | money | yes |
| state | string |  |

### ar_invoices.csv (object: ar_invoices)

AR invoices. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| customer_id | string | yes |
| invoice_no | string | yes |
| invoice_date | date | yes |
| due_date | date |  |
| amount | money | yes |
| state | string |  |
