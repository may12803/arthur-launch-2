# Clover: partner path

Generated from data/connectors/systems/clover.json. Text in quotes of vendor research is copied verbatim; UNVERIFIED means no primary vendor source confirmed it and it must not be treated as fact.

Matrix recommended path: direct. Estimated build effort once access exists: 6 days. Auth when live: oauth2_authcode.

## Program
- Program: Clover Developer Program / App Market
- Review or listing: Docs: 'The Clover team must approve all apps before you can publish them to the Clover App Market' (video, permissions, REST config, webhooks, legal docs reviewed). Production merchant OAuth: 'All interactions with merchant data sent through the Clover server must be authenticated with an OAuth token (and not a merchant API token as allowed in the sandbox)'.
- Self-serve developer account: yes; partner program required: no

## What to apply with
- Company: LOVELEEDAY Studios LLC. Use case: read-only data ingestion into the customer's own workspace for reporting and review.
- Objects requested (read):
- orders
- payments
- items/categories
- customers
- employees/shifts
- merchant
- Scopes or permissions: Orders read; Payments read; Customers read; Inventory read; Employees read; Merchant read (permissions set per app in Clover dev dashboard)
- Base URL per vendor research: https://api.clover.com (US/CA); sandbox https://apisandbox.dev.clover.com
- What the customer does on their side: Merchant owner installs our app from the Clover App Market (or private install link) and approves permissions; changing permissions later requires uninstall and reinstall.

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
- How to get it: Create a Clover developer account and sandbox merchant in the developer dashboard (self-serve)

## Cost and time
- Cost to us: UNVERIFIED (developer account free per docs; listing fees not found)
- Time to approval: UNVERIFIED ('approval timelines can vary'; contact Developer Relations)
- Rate limits per vendor research: Per app: 50 rps, per token: 16 rps; concurrent per app 10, per token 5; 429 on exceed

## Blockers recorded in the research
- Clover App Market approval needed to onboard arbitrary merchants (video, legal docs, functional review).
- Token lifetime and refresh details not verified from the OAuth page.

## Interim SFTP/CSV path
Until the partner credentials exist, data reaches us as files.

1. The customer exports the objects below from Clover (or schedules the export, where the vendor supports scheduled delivery; scheduled delivery is UNVERIFIED unless stated in the vendor notes above).
2. Files are uploaded in the portal (CSV or XLSX) or delivered by SFTP to `/tenants/<tenant_id>/inbox/<object>/` with a `<file>.done` marker file once complete.
3. Each file is parsed (RFC 4180 CSV or XLSX), formula-like cells are flagged, columns are mapped, and rows land in ingested_records with source_ref = file sha256 + ':' + row number, so re-sending a file adds nothing.

Expected layouts:

### orders.csv (object: orders)

One row per order. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| order_id | string | yes |
| created_date | date | yes |
| total | money | yes |
| tax_amount | money |  |
| tip_amount | money |  |
| state | string |  |
| employee | string |  |

### payments.csv (object: payments)

One row per payment. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| payment_id | string | yes |
| order_id | string |  |
| created_date | date | yes |
| amount | money | yes |
| result | string |  |

### items.csv (object: items)

Inventory items. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| item_id | string | yes |
| name | string | yes |
| price | money |  |
| category | string |  |
