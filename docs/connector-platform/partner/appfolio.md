# AppFolio: partner path

Generated from data/connectors/systems/appfolio.json. Text in quotes of vendor research is copied verbatim; UNVERIFIED means no primary vendor source confirmed it and it must not be treated as fact.

Matrix recommended path: sftp_csv. Estimated build effort once access exists: 8 days. Auth when live: oauth2_client_credentials.

## Program
- Program: AppFolio Stack Partner program (appfolio.com/stack/partners)
- Review or listing: Three phases per AppFolio: application and initial review; security compliance questionnaire, final approval and contract signing; development and testing, then marketplace listing.
- Self-serve developer account: no; partner program required: yes

## What to apply with
- Company: LOVELEEDAY Studios LLC. Use case: read-only data ingestion into the customer's own workspace for reporting and review.
- Objects requested (read):
- properties
- units
- tenants
- leases
- charges/receivables
- vendors and bills
- work orders
- GL/financial reports
- Scopes or permissions: UNVERIFIED
- Base URL per vendor research: UNVERIFIED (developer.appfolio.com is a JS shell; fetched content was only 'Developer Space')
- What the customer does on their side: UNVERIFIED. Partner integrations are enabled for a customer account by AppFolio/the customer through the Stack marketplace; exact steps not on pages read.

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
- How to get it: AppFolio page: partners get 'all-inclusive access to our developer tools and sandbox environment' after approval.

## Cost and time
- Cost to us: UNVERIFIED - AppFolio's page does not state fees
- Time to approval: UNVERIFIED
- Rate limits per vendor research: UNVERIFIED

## Blockers recorded in the research
- Stack Partner application, security questionnaire and contract required before any API or sandbox access
- API docs not publicly readable by automated fetch; auth/limits UNVERIFIED
- Interim path: customer-scheduled AppFolio report exports (not verified to exist as scheduled-delivery; confirm with customer)

## Interim SFTP/CSV path
Until the partner credentials exist, data reaches us as files.

1. The customer exports the objects below from AppFolio (or schedules the export, where the vendor supports scheduled delivery; scheduled delivery is UNVERIFIED unless stated in the vendor notes above).
2. Files are uploaded in the portal (CSV or XLSX) or delivered by SFTP to `/tenants/<tenant_id>/inbox/<object>/` with a `<file>.done` marker file once complete.
3. Each file is parsed (RFC 4180 CSV or XLSX), formula-like cells are flagged, columns are mapped, and rows land in ingested_records with source_ref = file sha256 + ':' + row number, so re-sending a file adds nothing.

Expected layouts:

### rent_roll.csv (object: rent_roll)

Rent roll snapshot. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| property | string | yes |
| unit | string | yes |
| tenant | string | yes |
| lease_from | date |  |
| lease_to | date |  |
| rent | money |  |

### work_orders.csv (object: work_orders)

Maintenance work orders. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| work_order_no | string | yes |
| property | string | yes |
| unit | string |  |
| status | string |  |
| opened_date | date | yes |
| vendor | string |  |
| cost | money |  |

### receivables.csv (object: receivables)

Charges and receivables. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| property | string | yes |
| tenant | string | yes |
| charge_date | date | yes |
| charge_type | string |  |
| amount | money | yes |
| balance | money |  |
