-- Engine object graph for CLIENT tenants (growth-plan item 1, tenant safety, approved by Daniel 2026-10-05).
-- The engine ontology (~/arthur/lib/ontology) keeps HOUSE data in a SQLite file on the Mac. Client data must never land there:
-- it lives here, keyed on tenant_id -> public.tenants, under RLS. Same three properties as the engine:
--   identity resolution (engine_entities + engine_aliases), bitemporality (valid_from/valid_until = true in the world,
--   observed_at = when we learned it), and lineage (source_system + source_ref NOT NULL on every value).
-- Access model:
--   members read their own tenant's rows (permissive is_tenant_member) and only from a strong session (restrictive
--   require_mfa_aal2, the same gate every tenant table carries); anon and authenticated can never write;
--   writes go through service_role only (the engine's pg-store adapter), and the write RPCs are executable by service_role only.
-- Cross-tenant references are impossible by construction: child rows reference (entity_id, tenant_id) as a composite key.
-- Idempotent: safe to apply twice.

create table if not exists public.engine_entities (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  object_key text not null,
  type text not null,
  canonical_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engine_entities_pkey primary key (id),
  constraint engine_entities_tenant_key unique (tenant_id, object_key),
  constraint engine_entities_id_tenant_key unique (id, tenant_id),
  constraint engine_entities_key_nonempty check (length(object_key) > 0 and length(canonical_name) > 0)
);

create table if not exists public.engine_aliases (
  id bigint generated always as identity,
  tenant_id uuid not null,
  entity_id uuid not null,
  alias text not null,
  source text,
  confidence real not null default 1.0,
  created_at timestamptz not null default now(),
  constraint engine_aliases_pkey primary key (id),
  constraint engine_aliases_entity_fk foreign key (entity_id, tenant_id) references public.engine_entities (id, tenant_id) on delete cascade,
  constraint engine_aliases_nonempty check (length(alias) > 0)
);
create unique index if not exists engine_aliases_entity_alias_uq on public.engine_aliases (entity_id, lower(alias));
create index if not exists engine_aliases_tenant_alias_idx on public.engine_aliases (tenant_id, lower(alias));

create table if not exists public.engine_properties (
  id bigint generated always as identity,
  tenant_id uuid not null,
  entity_id uuid not null,
  prop text not null,
  value text,
  value_num double precision,
  valid_from timestamptz not null,
  valid_until timestamptz,
  observed_at timestamptz not null default now(),
  source_system text not null,
  source_ref text not null,
  confidence real not null default 1.0,
  superseded_by bigint references public.engine_properties(id),
  constraint engine_properties_pkey primary key (id),
  constraint engine_properties_entity_fk foreign key (entity_id, tenant_id) references public.engine_entities (id, tenant_id) on delete cascade,
  constraint engine_properties_lineage check (length(source_system) > 0 and length(source_ref) > 0),
  constraint engine_properties_interval check (valid_until is null or valid_until >= valid_from)
);
create index if not exists engine_properties_entity_prop_idx on public.engine_properties (tenant_id, entity_id, prop, valid_from desc);

create table if not exists public.engine_mentions (
  id bigint generated always as identity,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entity_id uuid,
  surface text not null,
  context text,
  source_system text not null,
  source_ref text not null,
  observed_at timestamptz not null default now(),
  confidence real not null default 1.0,
  constraint engine_mentions_pkey primary key (id),
  constraint engine_mentions_entity_fk foreign key (entity_id, tenant_id) references public.engine_entities (id, tenant_id) on delete cascade,
  constraint engine_mentions_lineage check (length(source_system) > 0 and length(source_ref) > 0 and length(surface) > 0)
);
create index if not exists engine_mentions_tenant_idx on public.engine_mentions (tenant_id, observed_at desc);

alter table public.engine_entities enable row level security;
alter table public.engine_aliases enable row level security;
alter table public.engine_properties enable row level security;
alter table public.engine_mentions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['engine_entities','engine_aliases','engine_properties','engine_mentions'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'require_mfa_aal2') then
      execute format('create policy require_mfa_aal2 on public.%I as restrictive for all to authenticated using ((select public.session_is_strong())) with check ((select public.session_is_strong()))', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_member_select') then
      execute format('create policy %I on public.%I as permissive for select to authenticated using (public.is_tenant_member(tenant_id))', t || '_member_select', t);
    end if;
  end loop;
end $$;

revoke all on public.engine_entities, public.engine_aliases, public.engine_properties, public.engine_mentions from anon, authenticated;
grant select on public.engine_entities, public.engine_aliases, public.engine_properties, public.engine_mentions to authenticated;
grant all on public.engine_entities, public.engine_aliases, public.engine_properties, public.engine_mentions to service_role;

-- Bitemporal write, atomically, mirroring the engine's setProp: place the new row by VALIDITY (close the row in force at
-- p_valid_from, bound the new row at the next row that starts later); a re-read of the value already in force is a
-- confirmation, not a change, and returns the existing row id. Lineage is required.
create or replace function public.engine_set_prop(
  p_tenant uuid, p_entity uuid, p_prop text, p_value text, p_valid_from timestamptz, p_observed_at timestamptz,
  p_source_system text, p_source_ref text, p_confidence real default 1.0)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare v_cover public.engine_properties%rowtype; v_next timestamptz; v_id bigint; v_num double precision;
begin
  if p_tenant is null then raise exception 'tenant required'; end if;
  if coalesce(p_source_system, '') = '' or coalesce(p_source_ref, '') = '' then
    raise exception 'engine_set_prop(%.%) requires source_system and source_ref: a value without lineage is not reportable', p_entity, p_prop;
  end if;
  if not exists (select 1 from public.engine_entities where id = p_entity and tenant_id = p_tenant) then
    raise exception 'entity % does not belong to tenant %', p_entity, p_tenant;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_entity::text || ':' || p_prop, 0));
  select * into v_cover from public.engine_properties
   where tenant_id = p_tenant and entity_id = p_entity and prop = p_prop and superseded_by is null
     and valid_from <= p_valid_from and (valid_until is null or valid_until > p_valid_from)
   order by valid_from desc limit 1;
  if found and v_cover.value is not distinct from p_value then return v_cover.id; end if;
  select min(valid_from) into v_next from public.engine_properties
   where tenant_id = p_tenant and entity_id = p_entity and prop = p_prop and superseded_by is null and valid_from > p_valid_from;
  begin v_num := nullif(trim(p_value), '')::double precision; exception when others then v_num := null; end;
  insert into public.engine_properties (tenant_id, entity_id, prop, value, value_num, valid_from, valid_until, observed_at, source_system, source_ref, confidence)
  values (p_tenant, p_entity, p_prop, p_value, v_num, p_valid_from, v_next, coalesce(p_observed_at, now()), p_source_system, p_source_ref, coalesce(p_confidence, 1.0))
  returning id into v_id;
  if v_cover.id is not null then
    update public.engine_properties set valid_until = p_valid_from, superseded_by = v_id where id = v_cover.id;
  end if;
  return v_id;
end $$;

-- Point-in-time read for one entity: asOf = what was TRUE then; asKnownAt additionally restricts to what was OBSERVED by then
-- (the anti-look-ahead read). Tenant-scoped: an entity of another tenant returns nothing.
create or replace function public.engine_props_as_of(p_tenant uuid, p_entity uuid, p_as_of timestamptz default now(), p_as_known_at timestamptz default null)
returns table (prop text, value text, value_num double precision, valid_from timestamptz, valid_until timestamptz, observed_at timestamptz,
               source_system text, source_ref text, confidence real)
language sql stable security invoker set search_path = '' as $$
  select distinct on (p.prop) p.prop, p.value, p.value_num, p.valid_from, p.valid_until, p.observed_at, p.source_system, p.source_ref, p.confidence
    from public.engine_properties p
    left join public.engine_properties s on s.id = p.superseded_by
   where p.tenant_id = p_tenant and p.entity_id = p_entity
     and p.valid_from <= p_as_of
     and (p.valid_until is null or p.valid_until > p_as_of or (p_as_known_at is not null and s.observed_at > p_as_known_at))
     and (p_as_known_at is null or p.observed_at <= p_as_known_at)
   order by p.prop, p.observed_at desc, p.valid_from desc
$$;

-- Identity resolution inside one tenant: exact alias (case-insensitive) first, then containment for 3+ characters.
-- Ambiguity (two entities) resolves to nothing rather than to an arbitrary one.
create or replace function public.engine_resolve(p_tenant uuid, p_text text)
returns table (entity_id uuid, object_key text, type text, canonical_name text, alias text, match text)
language plpgsql stable security invoker set search_path = '' as $$
declare n int;
begin
  if p_tenant is null then raise exception 'tenant required'; end if;
  select count(distinct a.entity_id) into n from public.engine_aliases a where a.tenant_id = p_tenant and lower(a.alias) = lower(p_text);
  if n > 1 then return; end if;
  if n = 1 then
    return query select e.id, e.object_key, e.type, e.canonical_name, a.alias, 'alias'::text
      from public.engine_aliases a join public.engine_entities e on e.id = a.entity_id and e.tenant_id = a.tenant_id
     where a.tenant_id = p_tenant and lower(a.alias) = lower(p_text) limit 1;
    return;
  end if;
  if length(trim(coalesce(p_text, ''))) < 3 then return; end if;
  select count(distinct a.entity_id) into n from public.engine_aliases a
   where a.tenant_id = p_tenant and strpos(lower(a.alias), lower(p_text)) > 0;
  if n <> 1 then return; end if;
  return query select e.id, e.object_key, e.type, e.canonical_name, a.alias, 'partial'::text
    from public.engine_aliases a join public.engine_entities e on e.id = a.entity_id and e.tenant_id = a.tenant_id
   where a.tenant_id = p_tenant and strpos(lower(a.alias), lower(p_text)) > 0
   order by length(a.alias) asc limit 1;
end $$;

revoke all on function public.engine_set_prop(uuid, uuid, text, text, timestamptz, timestamptz, text, text, real) from public, anon, authenticated;
revoke all on function public.engine_props_as_of(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.engine_resolve(uuid, text) from public, anon, authenticated;
grant execute on function public.engine_set_prop(uuid, uuid, text, text, timestamptz, timestamptz, text, text, real) to service_role;
grant execute on function public.engine_props_as_of(uuid, uuid, timestamptz, timestamptz) to service_role;
grant execute on function public.engine_resolve(uuid, text) to service_role;
