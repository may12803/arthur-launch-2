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

revoke all on all tables in schema public from anon;
revoke truncate, trigger, references on all tables in schema public from authenticated;

-- Read-only for signed-in users on everything except invites (RLS still decides which rows).
revoke insert, update, delete on
  public.audit_log, public.connectors, public.contracts, public.coverage_areas, public.deliverables, public.document_shares,
  public.documents, public.memberships, public.staff_grants, public.tenant_connections, public.tenants,
  public.workstream_decisions, public.workstream_grades, public.workstream_tasks, public.workstreams
from authenticated;

-- Future tables created in public must opt in to grants instead of inheriting them.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;

-- Guard so the next table cannot ship without RLS: fails the migration if any public table has RLS off.
do $$
declare t text;
begin
  select string_agg(c.relname, ', ') into t from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if t is not null then raise exception 'tables without RLS: %', t; end if;
end $$;
