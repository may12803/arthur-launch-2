# Connector vendor-review compliance

Apply `supabase/loveleeday/20261005_24_connector_compliance.sql` before deploying (rollback in `rollback/`).

## Shopify mandatory compliance webhooks

Register in the Shopify app config (Partner Dashboard, App setup, Compliance webhooks). Requests are verified with `X-Shopify-Hmac-Sha256` against `CONNECTOR_OAUTH_SHOPIFY_CLIENT_SECRET`; a bad signature returns 401.

- Customer data request endpoint: `https://portal.loveleedaystudios.com/api/webhooks/shopify/customers/data_request`
- Customer data erasure endpoint: `https://portal.loveleedaystudios.com/api/webhooks/shopify/customers/redact`
- Shop data erasure endpoint: `https://portal.loveleedaystudios.com/api/webhooks/shopify/shop/redact`

`customers/redact` and `shop/redact` delete the matching rows in `ingested_records`. `customers/data_request` inserts an open row in `compliance_requests` for a person to fulfil.

## Atlassian Personal Data Reporting

The scheduler calls `/api/cron/atlassian-privacy` weekly (and 10 minutes after boot). It POSTs the stored accountIds to `https://api.atlassian.com/app/report-accounts/` and, for each response, deletes data for `closed` accounts and drops-and-refetches for `updated` ones. Register no URL with Atlassian; declare in the Atlassian developer console that the app uses the Personal Data Reporting API (Privacy and compliance section of the app). Spec: https://developer.atlassian.com/cloud/jira/platform/user-privacy-developer-guide/

## Zendesk

The connect screen asks for the Zendesk subdomain (`/^[a-z0-9-]+$/`), stored in `tenant_connections.config.subdomain`. Authorize URL `https://{subdomain}.zendesk.com/oauth/authorizations/new`, token URL `https://{subdomain}.zendesk.com/oauth/tokens`. Env: `CONNECTOR_OAUTH_ZENDESK_CLIENT_ID`, `CONNECTOR_OAUTH_ZENDESK_CLIENT_SECRET`, optional `CONNECTOR_OAUTH_ZENDESK_SCOPES` (default `read`).
