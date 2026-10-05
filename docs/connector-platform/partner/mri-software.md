# MRI Software: partner path

Generated from data/connectors/systems/mri-software.json. Text in quotes of vendor research is copied verbatim; UNVERIFIED means no primary vendor source confirmed it and it must not be treated as fact.

Matrix recommended path: unified_api:apideck. Estimated build effort once access exists: 4 days. Auth when live: basic.

## Program
- Program: MRI Partner Connect (Solution Partner category), key = MIX Partner Key / Developer Key
- Review or listing: Application, intro call, NDA, commercial agreement, provisioning. Alternative: an existing MRI client sponsors the integration.
- Self-serve developer account: no; partner program required: yes

## What to apply with
- Company: LOVELEEDAY Studios LLC. Use case: read-only data ingestion into the customer's own workspace for reporting and review.
- Objects requested (read):
- properties
- leases
- tenants
- GL accounts and transactions
- AP invoices and vendors
- AR
- Scopes or permissions: Determined by the customer's MRI user credentials plus our MIX key
- Base URL per vendor research: UNVERIFIED (MRI MIX gateway; per-product)
- What the customer does on their side: Provide their own MRI installation credentials (per Apideck: consumers provide only their own MRI installation credentials) and, if sponsoring, introduce us to MRI. Exact MRI-side steps UNVERIFIED (MRI portal gated).

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
- Available: unverified
- How to get it: Developer Key tier allows ad-hoc APIs for prototyping, per Apideck; issued under agreement.

## Cost and time
- Cost to us: UNVERIFIED (commercial agreement)
- Time to approval: Per Apideck (secondary): 5-7 business days from application to intro call, then NDA, agreement, provisioning
- Rate limits per vendor research: Partner key: higher limits, 24-hour cache; Developer key: lower limits, no cache (Apideck, secondary). Numeric limits UNVERIFIED.

## Blockers recorded in the research
- Production key is only issued under a MRI Partner Connect agreement (Apideck holds that agreement for its connector, so using Apideck sidesteps ours but covers only the accounting objects Apideck maps)
- MRI's own developer docs not public

## Interim SFTP/CSV path
Until the partner credentials exist, data reaches us as files.

1. The customer exports the objects below from MRI Software (or schedules the export, where the vendor supports scheduled delivery; scheduled delivery is UNVERIFIED unless stated in the vendor notes above).
2. Files are uploaded in the portal (CSV or XLSX) or delivered by SFTP to `/tenants/<tenant_id>/inbox/<object>/` with a `<file>.done` marker file once complete.
3. Each file is parsed (RFC 4180 CSV or XLSX), formula-like cells are flagged, columns are mapped, and rows land in ingested_records with source_ref = file sha256 + ':' + row number, so re-sending a file adds nothing.

Expected layouts:

### properties.csv (object: properties)

One row per property. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| property_id | string | yes |
| property_name | string | yes |
| city | string |  |
| state | string |  |

### leases.csv (object: leases)

One row per lease. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| property_id | string | yes |
| suite | string | yes |
| tenant_name | string | yes |
| start_date | date |  |
| end_date | date |  |
| monthly_rent | money |  |

### ap_invoices.csv (object: ap_invoices)

Accounts payable invoices. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| vendor_id | string | yes |
| vendor_name | string |  |
| invoice_no | string | yes |
| invoice_date | date | yes |
| due_date | date |  |
| amount | money | yes |
| gl_account | string |  |
