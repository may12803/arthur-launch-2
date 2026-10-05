# Client portal route audit (2026-10-05)

Branch feat/cp-audit, worktree /Users/danielmay/wt/cp-audit. Code review of every route under app/client/**, app/api/client/**, app/share/**. app/trust does not exist.

## Method and coverage

- Live walk: `npm run dev` (port 3417) against the real loveleeday Supabase project, Playwright at 1440 and 390, script `scripts/portal-role-walk.mjs`, screenshots in `docs/connector-platform/audit-shots/` (prefix = role).
- Tenant: Harbor & Vine (harbor-vine-demo) only. The QA login (portal-qa@) was given a temporary membership there and moved between roles; it is removed at the end of the audit. No write action was clicked. Dabney & Co. was not entered.
- Roles walked live: owner (44 page views), admin (41 page views). Roles NOT walked live: member, viewer (the walk exceeded the time budget; their gating was verified by reading the code and the RPC SQL in supabase/loveleeday). Staff-grant role not walked (opening a grant emails the client's owners). Dabney tenant not walked (read-only rule; would need a membership write there).
- Harbor & Vine has no workstream, task or deliverable rows, so /client/workstreams/[key], /task/[id], /deliverables/[slug] and the workstream progress/coverage data states were only reviewed in code and as their 404 / empty states.
- At 390px no horizontal overflow was found on any walked page (owner and admin). The mobile section nav scrolls sideways with no cue that more items exist (minor, N15).

## Findings

Severity: B blocker, M major, m minor. Status says what this branch did.

| ID | Route | Role / tenant | Sev | Defect | Evidence | Status |
|---|---|---|---|---|---|---|
| M01 | /client/contracts | all / any | M | `error ? [] : data` turns a failed query into "No contracts yet" | app/client/(portal)/contracts/page.tsx:48 | fixed |
| M02 | /client/access | owner, admin | M | audit_log read error ignored; renders "Nothing recorded yet" on a security record | access/page.tsx:62-77, :107 | fixed |
| M03 | /client/workstreams/coverage | all | M | query error rendered as "Coverage map coming" | workstreams/coverage/page.tsx:16-18 | fixed |
| M04 | /client/workstreams/progress | all | M | load error ignored; shows grade bars empty and "Nothing has been finished yet" | workstreams/progress/page.tsx:12 | fixed |
| M05 | /client/workstreams/[key] | all | M | load error ignored, so a failed query is a 404; grade-dimension error ignored | workstreams/[key]/page.tsx:12-16 | fixed |
| M06 | /client/workstreams/task/[id] | all | M | DB error on the task read becomes a 404 ("not found") | workstreams/task/[id]/page.tsx:20-21 | fixed |
| M07 | /client/deliverables/[slug] | users with 2+ companies or a staff grant | M | query not scoped to the active tenant (relies on RLS across all of the user's tenants), so a slug from company B opens while company A is active; DB error becomes 404 | deliverables/[slug]/page.tsx:32-40 | fixed |
| M08 | POST /api/client/billing/portal | member, viewer | M | any member, including viewer, can open the Stripe portal (payment method, plan changes); only staff is blocked | app/api/client/billing/portal/route.ts:21 | fixed (owner/admin only) |
| M09 | /client/billing | all | M | tenants read error treated as "No billing set up yet" | billing/page.tsx:25-26 | recorded only (other branch) |
| M10 | /client/connections, /connections/[key] | all | M | catalog and tenant_connections errors ignored; a failed read shows an empty catalog or a 404 | connections/page.tsx:14-20, [key]/page.tsx:15-21 | recorded only (other branch) |
| m11 | /client | all | m | raw database message shown to customers ("Couldn't load deliverables: ...") | page.tsx:46 | fixed |
| m12 | /client/documents | all | m | tenant (sharing switch) and shares reads ignore errors: switch shows Off, share counts vanish | documents/page.tsx:34-46 | fixed (warning shown) |
| m13 | /client/workstreams/[key] | all | m | "Open" on the review card links to /client, not the deliverable | workstreams/[key]/page.tsx:68 | fixed |
| m14 | /client/team | admin, owner | m | invites read error ignored (pending list silently empty); member fallback shows user ids | team/page.tsx:52-58 | recorded only (other branch) |
| N15 | portal shell, 390px | all | m | section nav scrolls sideways with no fade or cue; Billing, Access, Account are off-screen on load | components/client-portal/PortalShell.tsx:77, audit-shots/owner__client_documents_390.png | open |
| m16 | POST /api/client/billing/portal | owner, admin | m | returns the raw Stripe error message to the browser | billing/portal/route.ts:35 | fixed |
| m17 | POST /api/client/documents/[id]/share | member+ | m | id not UUID-checked (document routes check it); a bad id becomes a generic 500 | documents/[id]/share/route.ts:13 | fixed |
| m18 | POST /api/client/workstreams/decide | all | m | "not found" and "already done" returned as 403 | workstreams/decide/route.ts:16 | open (status mapping is cosmetic) |
| m19 | workstreams, workstream_tasks, workstream_decide, coverage_areas, connectors | n/a | m | tables and RPC are used by the portal but their SQL is not in supabase/loveleeday, so role enforcement on decisions (UI lets member decide, route text says "only owners") cannot be verified from the repo | grep of supabase/ finds no workstream_decide | open, needs SQL export |
| m20 | demo tenant data | any | m | demo member emails read arthur+...@loveleedaystudios.com, so "Arthur" shows in the Team, Documents and Access pages | audit-shots/owner__client_team_1440.png | data, rename in the demo tenant |

## Checks that passed

- Auth gate: every page under (portal) goes through the layout's requireClientPortal (session, AAL2, accepted membership). Anonymous visits redirect to /client/login. select-company, no-access and staff use requireStrongSession.
- Every /api/client route resolves tenant and role via getApiContext (or a session check for active-tenant and staff routes); team/invite also checks owner/admin; document writes are enforced in the RPCs (document_upload allows owner, admin, member, staff only).
- Tenant scoping: every table read in the pages filters by ctx.tenantId, except M07.
- Copy: no price, emoji or "Arthur" in static copy on any walked page (the only hits are the copyright sign and a link arrow from the shell, and the demo emails in m20).
- No broken internal links found by the crawler except m13.
- 404 states render for unknown workstream, deliverable, connector and task ids.

## Not covered

member and viewer live walks, staff-grant role, Dabney tenant, data-bearing workstream/task/deliverable pages, writes (upload, share, invite, decide, connect), tablet widths.
