# Toast: partner path

Generated from data/connectors/systems/toast.json. Text in quotes of vendor research is copied verbatim; UNVERIFIED means no primary vendor source confirmed it and it must not be treated as fact.

Matrix recommended path: sftp_csv. Estimated build effort once access exists: 6 days. Auth when live: oauth2_client_credentials.

## Program
- Program: Toast Integration Partner program (Partner API account)
- Review or listing: Docs: credentials are created by the Toast integrations team 'after your application has been reviewed and approved'
- Self-serve developer account: no; partner program required: yes

## What to apply with
- Company: LOVELEEDAY Studios LLC. Use case: read-only data ingestion into the customer's own workspace for reporting and review.
- Objects requested (read):
- orders (ordersBulk)
- payments/tips
- checks
- menus/items/sales categories
- employees
- time entries/labor
- cash entries
- restaurant config
- discounts
- Scopes or permissions: orders.orders:read (via ordersBulk); menus:read; labor:read; restaurants:read; config:read
- Base URL per vendor research: https://ws-api.toasttab.com (sandbox: ws-sandbox-api)
- What the customer does on their side: Restaurant admin grants API access to the specific integration partner in Toast Web (partner access is per restaurant). Customer then supplies restaurant GUID / external ID. Fallback with no partner status: customer enables Toast Data Export nightly SFTP to our host (Toast Web > Integrations / data export).

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
- How to get it: Issued by Toast integrations team after partner application; ws-sandbox-api host

## Cost and time
- Cost to us: UNVERIFIED (no public fee found; partner terms are negotiated)
- Time to approval: UNVERIFIED (weeks to months per partner reports; no primary source)
- Rate limits per vendor research: UNVERIFIED (doc.toasttab.com returned 403 to WebFetch; rate-limit page not read)

## Blockers recorded in the research
- Multi-tenant Partner API requires Toast integrations team approval before any credentials exist; there is no self-serve developer signup.
- Our existing Toast credential is Dabney's own machine client (TOAST_API_CLIENT_ID/SECRET, single restaurant GUID), not a multi-restaurant partner credential; it cannot be used for other customers.
- existing in repo: ~/arthur/scripts/toast-api-monthly.js (machine-client login to ws-api.toasttab.com + ordersBulk, vault ~/.arthur/vault/toast.env names TOAST_API_CLIENT_ID, TOAST_API_CLIENT_SECRET, TOAST_RESTAURANT_GUID, TOAST_API_USER_ACCESS_TYPE)
- existing in repo: ~/arthur/scripts/toast-nightly-sftp.sh and toast-sftp-rollup.js (Toast nightly data-export SFTP; env names TOAST_SFTP_HOST/USER/KEY)
- existing in repo: ~/arthur/scripts/toast-admin-ops* and skills toast-admin-ops / toast-menu-item-write (browser scraping of Toast Web admin; TOAST_EMAIL/TOAST_ADMIN_PASSWORD names) - fragile, last resort
- Interim route while partnership is pending: customer-side Toast Data Export to SFTP (needs customer to enable it) or Nango with the customer's own API client if the customer already holds one.

## Interim SFTP/CSV path
Until the partner credentials exist, data reaches us as files.

1. The customer exports the objects below from Toast (or schedules the export, where the vendor supports scheduled delivery; scheduled delivery is UNVERIFIED unless stated in the vendor notes above).
2. Files are uploaded in the portal (CSV or XLSX) or delivered by SFTP to `/tenants/<tenant_id>/inbox/<object>/` with a `<file>.done` marker file once complete.
3. Each file is parsed (RFC 4180 CSV or XLSX), formula-like cells are flagged, columns are mapped, and rows land in ingested_records with source_ref = file sha256 + ':' + row number, so re-sending a file adds nothing.

Expected layouts:

### orders.csv (object: orders)

One row per order (from a customer-enabled Toast Data Export, mapped to this layout). Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| order_id | string | yes |
| restaurant_guid | string | yes |
| business_date | date | yes |
| net_sales | money | yes |
| tax | money |  |
| tip | money |  |
| total | money |  |
| guest_count | number |  |

### payments.csv (object: payments)

One row per payment. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| payment_id | string | yes |
| order_id | string | yes |
| business_date | date | yes |
| payment_type | string |  |
| amount | money | yes |
| tip | money |  |

### time_entries.csv (object: time_entries)

Labor time entries. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| employee_id | string | yes |
| business_date | date | yes |
| regular_hours | number |  |
| overtime_hours | number |  |
| job_title | string |  |
