# Yardi Voyager: partner path

Generated from data/connectors/systems/yardi-voyager.json. Text in quotes of vendor research is copied verbatim; UNVERIFIED means no primary vendor source confirmed it and it must not be treated as fact.

Matrix recommended path: sftp_csv. Estimated build effort once access exists: 8 days. Auth when live: basic.

## Program
- Program: Yardi Interface Partner Program (Standard Interface Partnership Program, SIPP)
- Review or listing: Approved interface vendor list; per-interface licensing
- Self-serve developer account: no; partner program required: yes

## What to apply with
- Company: LOVELEEDAY Studios LLC. Use case: read-only data ingestion into the customer's own workspace for reporting and review.
- Objects requested (read):
- properties
- units
- tenants/residents
- leases
- charges/receivables
- payables/vendors
- GL accounts and journal
- work orders
- Scopes or permissions: UNVERIFIED: per-interface license (e.g. resident, GL, work orders) determines which SOAP operations are callable
- Base URL per vendor research: UNVERIFIED (per-customer hosted Voyager web-services URL, issued with the interface license)
- What the customer does on their side: Customer must authorize the vendor with Yardi and request the interface be enabled on their Voyager database; Yardi then issues the web-services URL, interface credentials and license. Exact customer steps UNVERIFIED (vendor page blocked).

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
- How to get it: Per Yardi snippet: 'Standard Interface (SIPP) vendors are provided access to a development sandbox for testing Voyager integration.' Only after joining the program.

## Cost and time
- Cost to us: Per secondary sources only (supergood.ai/truto.one, not Yardi): about $25K per interface per year; Yardi's own search snippet says 'Participation in the Yardi Interfaces Program requires an annual license fee per interface'. Exact figure UNVERIFIED.
- Time to approval: UNVERIFIED (secondary sources: multi-step approval)
- Rate limits per vendor research: UNVERIFIED - not published

## Blockers recorded in the research
- Direct API requires membership in the Yardi Interface Partner Program with a paid per-interface annual license and mutual-customer requirements (secondary sources: 2 years in business, 3 active Voyager clients)
- No self-serve sandbox or public docs
- Primary Yardi pages could not be read (Cloudflare 403); program terms must be confirmed with Yardi

## Interim SFTP/CSV path
Until the partner credentials exist, data reaches us as files.

1. The customer exports the objects below from Yardi Voyager (or schedules the export, where the vendor supports scheduled delivery; scheduled delivery is UNVERIFIED unless stated in the vendor notes above).
2. Files are uploaded in the portal (CSV or XLSX) or delivered by SFTP to `/tenants/<tenant_id>/inbox/<object>/` with a `<file>.done` marker file once complete.
3. Each file is parsed (RFC 4180 CSV or XLSX), formula-like cells are flagged, columns are mapped, and rows land in ingested_records with source_ref = file sha256 + ':' + row number, so re-sending a file adds nothing.

Expected layouts:

### properties.csv (object: properties)

One row per property. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| property_code | string | yes |
| property_name | string | yes |
| address | string |  |
| unit_count | number |  |

### leases.csv (object: leases)

One row per active or recent lease. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| property_code | string | yes |
| unit | string | yes |
| tenant_name | string | yes |
| lease_start | date |  |
| lease_end | date |  |
| monthly_rent | money |  |
| status | string |  |

### charges.csv (object: charges)

Posted resident charges and receivables. Header names must match the field names below for automatic mapping; any other export is mapped column by column in the upload screen.

| field | type | required |
|---|---|---|
| property_code | string | yes |
| tenant_code | string | yes |
| charge_date | date | yes |
| charge_type | string | yes |
| amount | money | yes |
| balance | money |  |
