ROUND 2. Same rules and output format as docs/connector-platform/REDTEAM-PROMPT.md (read it first): READ-ONLY, no edits, no network, no Supabase; local tests allowed.

Round 1 findings are in docs/connector-platform/REDTEAM-CODEX.md: F-01 SSRF, F-02 XLSX bomb and F-03 formula import were fixed; F-04 was deliberately left unchanged (rows_read > 0 on an incremental read counts as flow). Verify each fix holds and look for bypasses. DNS rebinding between check and connect is a known open item; do not re-report it.

Also review what changed since round 1:
- supabase/loveleeday/20261005_12_staff_permissions.sql and its tests
- supabase/loveleeday/seed/harbor-vine-demo.sql and harbor-vine-qa-cleanup.sql: they must touch only tenant slug harbor-vine-demo; prove or disprove that either can change another tenant's rows
- lib/client-portal/staff-gate.ts and the staff routes
- app/api/client/connectors/oauth/callback and lib/client-portal/oauth-redirect.ts (one fixed registered redirect URI)
- scripts/connector-sandbox-probe.mjs (must never report a client as verified without invalid_grant; must never print secret values)
- next.config.mjs cache headers, app/trust and app/client layouts, components/AppShellWrapper.tsx
