-- Engine on Fly, part 2 (tenant safety, Daniel 2026-10-05: "Nothing customer-facing runs on the Mac").
-- Adds the rest of the client-tenant object graph (links, watches, watch firings) and the state the portal's tenant-pipeline
-- job needs (a per-tenant cursor over ingested_records and a run log). Same access model as migration 20:
--   members read their own tenant's rows (permissive is_tenant_member) only from a strong session (restrictive require_mfa_aal2);
--   anon and authenticated never write; writes are service_role only (lib/engine/pg.ts on Fly).
-- Cross-tenant references are impossible by construction: every child row references (id, tenant_id) composite keys.
-- engine_pipeline_cursors has RLS on and NO member policy: it is engine state, not tenant-visible data.
-- Idempotent: safe to apply twice. Rollback: rollback/20261005_24_engine_links_watches_pipeline.sql.

-- Composite key on properties so a firing can reference (property, tenant) and never a row of another tenant.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'engine_properties_id_tenant_key') then
    alter table public.engine_properties add constraint engine_properties_id_tenant_key unique (id, tenant_id);
  end if;
end $$;

create table if not exists public.engine_links (
  id bigint generated always as identity,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  from_entity uuid not null,
  to_entity uuid not null,
  relation text not null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  source_ref text,
  created_at timestamptz not null default now(),
  constraint engine_links_pkey primary key (id),
  constraint engine_links_from_fk foreign key (from_entity, tenant_id) references public.engine_entities (id, tenant_id) on delete cascade,
  constraint engine_links_to_fk foreign key (to_entity, tenant_id) references public.engine_entities (id, tenant_id) on delete cascade,
  constraint engine_links_relation_nonempty check (length(relation) > 0),
  constraint engine_links_interval check (valid_until is null or valid_until >= valid_from),
  constraint engine_links_uq unique (tenant_id, from_entity, to_entity, relation, valid_from)
);
create index if not exists engine_links_to_idx on public.engine_links (tenant_id, to_entity);

create table if not exists public.engine_watches (
  id bigint generated always as identity,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid not null,
  prop text not null,
  op text not null,
  threshold text not null,
  threshold_num double precision,
  note text,
  created_at timestamptz not null default now(),
  disabled_at timestamptz,
  constraint engine_watches_pkey primary key (id),
  constraint engine_watches_id_tenant_key unique (id, tenant_id),
  constraint engine_watches_entity_fk foreign key (entity_id, tenant_id) references public.engine_entities (id, tenant_id) on delete cascade,
  constraint engine_watches_op check (op in ('>', '>=', '<', '<=', '==', '!=', 'changed'))
);
create index if not exists engine_watches_entity_idx on public.engine_watches (tenant_id, entity_id, prop);

create table if not exists public.engine_watch_firings (
  id bigint generated always as identity,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  watch_id bigint not null,
  property_id bigint not null,
  value text not null,
  observed_at timestamptz not null,
  fired_at timestamptz not null default now(),
  constraint engine_watch_firings_pkey primary key (id),
  constraint engine_watch_firings_watch_fk foreign key (watch_id, tenant_id) references public.engine_watches (id, tenant_id) on delete cascade,
  constraint engine_watch_firings_prop_fk foreign key (property_id, tenant_id) references public.engine_properties (id, tenant_id) on delete cascade,
  constraint engine_watch_firings_uq unique (watch_id, property_id)
);

create table if not exists public.engine_pipeline_cursors (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  last_seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint engine_pipeline_cursors_pkey primary key (tenant_id)
);

create table if not exists public.engine_pipeline_runs (
  id bigint generated always as identity,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  from_seq bigint,
  to_seq bigint,
  read integer not null default 0,
  tasks integer not null default 0,
  approvals integer not null default 0,
  rejected integer not null default 0,
  unverified integer not null default 0,
  unrouted integer not null default 0,
  error text,
  detail jsonb not null default '{}'::jsonb,
  constraint engine_pipeline_runs_pkey primary key (id),
  constraint engine_pipeline_runs_status check (status in ('ok', 'failed'))
);
create index if not exists engine_pipeline_runs_tenant_idx on public.engine_pipeline_runs (tenant_id, started_at desc);

alter table public.engine_links enable row level security;
alter table public.engine_watches enable row level security;
alter table public.engine_watch_firings enable row level security;
alter table public.engine_pipeline_cursors enable row level security;
alter table public.engine_pipeline_runs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['engine_links','engine_watches','engine_watch_firings','engine_pipeline_cursors','engine_pipeline_runs'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'require_mfa_aal2') then
      execute format('create policy require_mfa_aal2 on public.%I as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()))', t);
    end if;
  end loop;
  foreach t in array array['engine_links','engine_watches','engine_watch_firings','engine_pipeline_runs'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_member_select') then
      execute format('create policy %I on public.%I as permissive for select to authenticated using (public.is_tenant_member(tenant_id))', t || '_member_select', t);
    end if;
  end loop;
end $$;

revoke all on public.engine_links, public.engine_watches, public.engine_watch_firings, public.engine_pipeline_cursors, public.engine_pipeline_runs from anon, authenticated;
grant select on public.engine_links, public.engine_watches, public.engine_watch_firings, public.engine_pipeline_runs to authenticated;
grant all on public.engine_links, public.engine_watches, public.engine_watch_firings, public.engine_pipeline_cursors, public.engine_pipeline_runs to service_role;

-- Client tenants with ingested records past their cursor. House tenants (Daniel's own businesses) are excluded here AND in the
-- caller: their data is processed on the Mac, never by the portal job.
create or replace function public.engine_pipeline_due(p_limit int default 50)
returns table (tenant_id uuid, slug text, after_seq bigint, max_seq bigint)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.slug, coalesce(c.last_seq, 0), m.max_seq
    from public.tenants t
    join (select r.tenant_id, max(r.seq) as max_seq from public.ingested_records r group by r.tenant_id) m on m.tenant_id = t.id
    left join public.engine_pipeline_cursors c on c.tenant_id = t.id
   where t.slug not in ('aspen-may', 'dabney-and-co')
     and m.max_seq > coalesce(c.last_seq, 0)
   order by t.slug
   limit least(greatest(coalesce(p_limit, 50), 1), 500)
$$;

-- Compare-and-set cursor advance: lands only if the cursor is still where this run started, so two overlapping runs can never
-- both advance (the second gets false and its proposals are idempotent anyway). Never moves backwards.
create or replace function public.engine_pipeline_advance(p_tenant uuid, p_from bigint, p_to bigint)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n int;
begin
  if p_tenant is null then raise exception 'tenant required'; end if;
  if p_to is null or p_to < coalesce(p_from, 0) then raise exception 'cursor cannot move backwards'; end if;
  if coalesce(p_from, 0) = 0 then
    insert into public.engine_pipeline_cursors (tenant_id, last_seq) values (p_tenant, p_to) on conflict (tenant_id) do nothing;
    get diagnostics n = row_count;
    if n = 1 then return true; end if;
  end if;
  update public.engine_pipeline_cursors set last_seq = p_to, updated_at = now() where tenant_id = p_tenant and last_seq = coalesce(p_from, 0);
  get diagnostics n = row_count;
  return n = 1;
end $$;

revoke all on function public.engine_pipeline_due(int) from public, anon, authenticated;
revoke all on function public.engine_pipeline_advance(uuid, bigint, bigint) from public, anon, authenticated;
grant execute on function public.engine_pipeline_due(int) to service_role;
grant execute on function public.engine_pipeline_advance(uuid, bigint, bigint) to service_role;
