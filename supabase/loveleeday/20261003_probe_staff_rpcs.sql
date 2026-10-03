-- NOT APPLIED to production. Two read-only, staff-only inventory RPCs for scripts/tenant-isolation-probe.mjs (red team PORTAL-2 P10/P11).
-- The probe must never trust a caller-supplied table list or assume tenant B's fixture exists. These give it a privileged read of the
-- TARGET database itself, over the same API the portal uses: SECURITY DEFINER, pinned search_path, and staff + MFA (aal2) only,
-- exactly like staff_list_tenants. They read catalogs and row counts only; they return no row contents and change nothing.

create or replace function public.staff_probe_inventory()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  -- Every relation in public (tables, partitioned tables, views, materialized views, foreign tables) with its columns,
  -- read from the catalog of the database that is answering. Views count: a view with a tenant_id column is an exposure too.
  return (select coalesce(jsonb_object_agg(c.relname, jsonb_build_object('kind', c.relkind::text, 'columns', cols.cols)), '{}'::jsonb)
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
          cross join lateral (select coalesce(jsonb_agg(a.attname::text order by a.attnum), '[]'::jsonb) cols
                              from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) cols
          where c.relkind in ('r', 'p', 'v', 'm', 'f'));
end $$;

create or replace function public.staff_probe_fixture(p_tenant uuid, p_doc uuid, p_share uuid, p_task uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  t record; n bigint; rows jsonb := '{}'::jsonb;
begin
  if not public.session_is_strong() or not public.is_staff() then raise exception 'staff only'; end if;
  for t in select * from (values ('audit_log','tenant_id'),('contracts','tenant_id'),('coverage_areas','tenant_id'),('deliverables','tenant_id'),
      ('document_shares','tenant_id'),('documents','tenant_id'),('invites','tenant_id'),('memberships','tenant_id'),('staff_grants','tenant_id'),
      ('tenant_connections','tenant_id'),('tenants','id'),('workstream_decisions','tenant_id'),('workstream_grades','tenant_id'),
      ('workstream_tasks','tenant_id'),('workstreams','tenant_id')) v(tbl, col) loop
    execute format('select count(*) from public.%I where %I = $1', t.tbl, t.col) into n using p_tenant;
    rows := rows || jsonb_build_object(t.tbl, n);
  end loop;
  return jsonb_build_object(
    'rows', rows,
    'doc_tenant', (select tenant_id from public.documents where id = p_doc),
    'share_tenant', (select tenant_id from public.document_shares where id = p_share),
    'task_tenant', (select tenant_id from public.workstream_tasks where id = p_task));
end $$;

revoke all on function public.staff_probe_inventory() from public, anon;
revoke all on function public.staff_probe_fixture(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.staff_probe_inventory() to authenticated;
grant execute on function public.staff_probe_fixture(uuid, uuid, uuid, uuid) to authenticated;
