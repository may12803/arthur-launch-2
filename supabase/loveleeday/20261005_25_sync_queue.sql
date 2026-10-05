-- Server-only connector queue. One outstanding job per connection.
create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  connection_id uuid not null references public.tenant_connections(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','running','completed','failed')),
  run_after timestamptz not null default now(),
  attempts integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sync_jobs_outstanding on public.sync_jobs(connection_id) where status in ('pending','running');
create index if not exists sync_jobs_claim on public.sync_jobs(status, run_after, tenant_id);
alter table public.sync_jobs enable row level security;
revoke all on public.sync_jobs from public, anon, authenticated;

create or replace function public.sync_jobs_enqueue(p_secret text) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  insert into public.sync_jobs(tenant_id, connection_id)
  select c.tenant_id, c.id from public.tenant_connections c
  where c.status in ('connected','live','error')
    and exists (select 1 from private.connection_secrets s where s.connection_id = c.id)
    and not exists (select 1 from public.sync_runs r where r.connection_id = c.id and r.status = 'running' and r.started_at > now() - interval '30 minutes')
    and coalesce((select max(r.started_at) from public.sync_runs r where r.connection_id = c.id), '-infinity'::timestamptz) < now() - interval '1 hour'
    and not exists (select 1 from public.sync_jobs j where j.connection_id = c.id and j.status in ('pending','running'))
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.sync_jobs_claim(p_secret text, p_worker text, p_limit integer)
returns table(job_id uuid, connection_id uuid, tenant_id uuid, connector_key text, definition_key text, auth_method text)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if nullif(p_worker, '') is null or p_limit < 1 or p_limit > 100 then raise exception 'invalid claim'; end if;
  return query
  with ranked as (
    select j.id, j.tenant_id, j.run_after, j.created_at,
      row_number() over (partition by j.tenant_id order by j.run_after, j.created_at, j.id) as tenant_position,
      (select max(h.locked_at) from public.sync_jobs h where h.tenant_id = j.tenant_id) as last_claim
    from public.sync_jobs j
    where (j.status = 'pending' and j.run_after <= now())
       or (j.status = 'running' and j.locked_at < now() - interval '10 minutes')
  ), chosen as (
    select j.id from ranked r join public.sync_jobs j on j.id = r.id
    order by r.tenant_position, r.last_claim nulls first, r.tenant_id, r.created_at
    for update of j skip locked
    limit p_limit
  ), claimed as (
    update public.sync_jobs j set status = 'running', attempts = j.attempts + 1,
      locked_at = now(), locked_by = p_worker, updated_at = now()
    from chosen where j.id = chosen.id returning j.*
  )
  select j.id, j.connection_id, j.tenant_id, c.connector_key, c.definition_key, c.auth_method
  from claimed j join public.tenant_connections c on c.id = j.connection_id;
end $$;

create or replace function public.sync_jobs_finish(p_secret text, p_job uuid, p_worker text, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  update public.sync_jobs set status = case when p_error is null then 'completed' when attempts >= 5 then 'failed' else 'pending' end,
    run_after = case when p_error is null then run_after else now() + make_interval(secs => least(3600, 60 * power(2, least(attempts - 1, 6)))::integer) end,
    last_error = left(p_error, 500), locked_by = null, updated_at = now()
  where id = p_job and status = 'running' and locked_by = p_worker;
  get diagnostics v_count = row_count;
  return v_count = 1;
end $$;
revoke all on function public.sync_jobs_enqueue(text), public.sync_jobs_claim(text,text,integer), public.sync_jobs_finish(text,uuid,text,text) from public;
grant execute on function public.sync_jobs_enqueue(text), public.sync_jobs_claim(text,text,integer), public.sync_jobs_finish(text,uuid,text,text) to anon, authenticated, service_role;
