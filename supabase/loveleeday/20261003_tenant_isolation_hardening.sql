-- LOVELEEDAY project (eydcfgoklajcztpoprsl). NOT APPLIED TO PRODUCTION - needs Daniel's approval.
-- Bar 7 hardening, found while probing tenant isolation (scripts/tenant-isolation-probe.mjs).
--
-- Finding: no row-level leak exists today (every client table has RLS on, a tenant-membership SELECT policy and a RESTRICTIVE
-- require_mfa_aal2 policy). But the table GRANTs are far wider than the policies need, so isolation rests on RLS alone:
--   * anon holds INSERT/UPDATE/DELETE/TRUNCATE on 7 client tables (workstreams, workstream_tasks, workstream_grades,
--     workstream_decisions, coverage_areas, tenant_connections, connectors). The portal never reads or writes those as anon.
--   * anon and authenticated hold TRUNCATE/TRIGGER/REFERENCES everywhere. TRUNCATE is NOT subject to RLS, so any future route
--     or exposed function that reaches it would wipe every tenant at once.
--   * authenticated holds INSERT/UPDATE/DELETE on tables that only SECURITY DEFINER RPCs write (documents, document_shares,
--     memberships, tenants, workstream_*, ...). One future permissive FOR ALL policy on any of them would silently open writes.
-- Only invites is written from a user session (app/api/client/team/invite/route.ts: delete + insert, gated by invites_admin_manage).
-- SECURITY DEFINER functions run as owner, so none of this affects them.

-- SCOPE (red team PORTAL-1 P6): every statement below names the 16 portal tables explicitly. Nothing here touches any other
-- table in `public`, so a non-portal table that legitimately serves anon keeps its grants. Read-only inventory of production
-- (eydcfgoklajcztpoprsl) on 2026-10-03: `public` holds exactly these 16 relations and no others, so nothing else is anon-exposed there.
-- Re-run that inventory immediately before applying; if a table has appeared, it is untouched by this migration.
revoke all on
  public.audit_log, public.connectors, public.contracts, public.coverage_areas, public.deliverables, public.document_shares,
  public.documents, public.invites, public.memberships, public.staff_grants, public.tenant_connections, public.tenants,
  public.workstream_decisions, public.workstream_grades, public.workstream_tasks, public.workstreams
from anon;
revoke truncate, trigger, references on
  public.audit_log, public.connectors, public.contracts, public.coverage_areas, public.deliverables, public.document_shares,
  public.documents, public.invites, public.memberships, public.staff_grants, public.tenant_connections, public.tenants,
  public.workstream_decisions, public.workstream_grades, public.workstream_tasks, public.workstreams
from authenticated;

-- Read-only for signed-in users on everything except invites (RLS still decides which rows).
revoke insert, update, delete on
  public.audit_log, public.connectors, public.contracts, public.coverage_areas, public.deliverables, public.document_shares,
  public.documents, public.memberships, public.staff_grants, public.tenant_connections, public.tenants,
  public.workstream_decisions, public.workstream_grades, public.workstream_tasks, public.workstreams
from authenticated;

-- (The earlier draft also changed schema-wide DEFAULT PRIVILEGES for anon/authenticated. Removed: that is not scoped to the
-- portal tables. New portal tables should be created with explicit grants; consider default privileges as a separate decision.)

-- Guard: fails the migration if any PORTAL table has RLS off. Other public tables are reported, not blocked.
do $$
declare t text; o text;
begin
  select string_agg(c.relname, ', ') into t from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
     and c.relname in ('audit_log','connectors','contracts','coverage_areas','deliverables','document_shares','documents','invites',
       'memberships','staff_grants','tenant_connections','tenants','workstream_decisions','workstream_grades','workstream_tasks','workstreams');
  if t is not null then raise exception 'portal tables without RLS: %', t; end if;
  select string_agg(c.relname, ', ') into o from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if o is not null then raise warning 'non-portal public tables without RLS (not changed by this migration): %', o; end if;
end $$;
