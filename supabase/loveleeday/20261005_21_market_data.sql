-- Market data feeds (FRED, BLS, EIA). Public reference data, NOT tenant data.
-- RLS on. SELECT for anon + authenticated, writes only through the connectors-server-secret RPC (no service-role key introduced).
-- anon sees only public_ok series (third-party copyright series such as UMich sentiment and IMF commodity prices are signed-in only).
-- Idempotent: safe to apply twice.

create table if not exists public.market_series (
  id text primary key,
  source text not null check (source in ('fred', 'bls', 'eia')),
  source_series_id text not null,
  title text not null,
  units text not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'quarterly')),
  category text not null,
  region text not null default 'US',
  license_note text,
  public_ok boolean not null default false,
  last_refreshed_at timestamptz,
  unique (source, source_series_id)
);

create table if not exists public.market_observations (
  series_id text not null references public.market_series (id) on delete cascade,
  obs_date date not null,
  value numeric not null,
  fetched_at timestamptz not null default now(),
  primary key (series_id, obs_date)
);

alter table public.market_series enable row level security;
alter table public.market_observations enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'market_series' and policyname = 'market_series_read_public') then
    create policy market_series_read_public on public.market_series as permissive for select to anon using (public_ok);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'market_series' and policyname = 'market_series_read_signed_in') then
    create policy market_series_read_signed_in on public.market_series as permissive for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'market_observations' and policyname = 'market_obs_read_public') then
    create policy market_obs_read_public on public.market_observations as permissive for select to anon
      using (exists (select 1 from public.market_series s where s.id = series_id and s.public_ok));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'market_observations' and policyname = 'market_obs_read_signed_in') then
    create policy market_obs_read_signed_in on public.market_observations as permissive for select to authenticated using (true);
  end if;
end $$;

revoke all on public.market_series, public.market_observations from anon, authenticated;
grant select on public.market_series, public.market_observations to anon, authenticated;

-- Server write path. p_series: [{id, source, source_series_id, title, units, frequency, category, region, license_note, public_ok}]
-- p_obs: [{series_id, obs_date, value}]. Upserts both; a revised value overwrites. Returns the number of observation rows written.
create or replace function public.market_upsert(p_secret text, p_series jsonb, p_obs jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_series is not null and jsonb_typeof(p_series) = 'array' then
    insert into public.market_series (id, source, source_series_id, title, units, frequency, category, region, license_note, public_ok, last_refreshed_at)
    select s.id, s.source, s.source_series_id, s.title, s.units, s.frequency, s.category, coalesce(s.region, 'US'), s.license_note, coalesce(s.public_ok, false), now()
    from jsonb_to_recordset(p_series) as s(id text, source text, source_series_id text, title text, units text, frequency text, category text, region text, license_note text, public_ok boolean)
    on conflict (id) do update set source = excluded.source, source_series_id = excluded.source_series_id, title = excluded.title, units = excluded.units,
      frequency = excluded.frequency, category = excluded.category, region = excluded.region, license_note = excluded.license_note,
      public_ok = excluded.public_ok, last_refreshed_at = now();
  end if;
  if p_obs is not null and jsonb_typeof(p_obs) = 'array' then
    insert into public.market_observations (series_id, obs_date, value, fetched_at)
    select o.series_id, o.obs_date, o.value, now()
    from jsonb_to_recordset(p_obs) as o(series_id text, obs_date date, value numeric)
    on conflict (series_id, obs_date) do update set value = excluded.value, fetched_at = now() where public.market_observations.value is distinct from excluded.value;
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end $$;

revoke all on function public.market_upsert(text, jsonb, jsonb) from public;
grant execute on function public.market_upsert(text, jsonb, jsonb) to anon, authenticated;

-- Read side, SECURITY INVOKER so RLS applies: anon gets public_ok series, signed-in clients get all.
-- latest, the observation about one year earlier (latest date minus a year, within 45 days), and about one month earlier (quarterly series: none).
create or replace function public.market_snapshot_rows()
returns table (id text, title text, units text, frequency text, category text, region text, source text, source_series_id text, license_note text, public_ok boolean,
               last_refreshed_at timestamptz, latest_date date, latest_value numeric, prior_year_date date, prior_year_value numeric, prior_month_date date, prior_month_value numeric)
language sql stable security invoker set search_path = '' as $$
  select s.id, s.title, s.units, s.frequency, s.category, s.region, s.source, s.source_series_id, s.license_note, s.public_ok, s.last_refreshed_at,
         l.obs_date, l.value, py.obs_date, py.value, pm.obs_date, pm.value
  from public.market_series s
  join lateral (select o.obs_date, o.value from public.market_observations o where o.series_id = s.id order by o.obs_date desc limit 1) l on true
  left join lateral (select o.obs_date, o.value from public.market_observations o
                     where o.series_id = s.id and o.obs_date <= (l.obs_date - interval '1 year')::date and o.obs_date > (l.obs_date - interval '1 year' - interval '45 days')::date
                     order by o.obs_date desc limit 1) py on true
  left join lateral (select o.obs_date, o.value from public.market_observations o
                     where s.frequency <> 'quarterly' and o.series_id = s.id and o.obs_date <= (l.obs_date - interval '1 month')::date and o.obs_date > (l.obs_date - interval '1 month' - interval '20 days')::date
                     order by o.obs_date desc limit 1) pm on true
  order by s.category, s.title;
$$;

-- Ten-year sparkline source: one point per month (the last observation in each month) for every visible series, as one json row per series.
create or replace function public.market_sparklines(p_months integer default 120)
returns table (series_id text, points jsonb)
language sql stable security invoker set search_path = '' as $$
  select m.series_id, jsonb_agg(jsonb_build_array(m.obs_date, m.value) order by m.obs_date)
  from (select distinct on (o.series_id, date_trunc('month', o.obs_date)) o.series_id, o.obs_date, o.value
        from public.market_observations o
        where o.obs_date >= (now() - make_interval(months => p_months))::date
        order by o.series_id, date_trunc('month', o.obs_date), o.obs_date desc) m
  group by m.series_id;
$$;

revoke all on function public.market_snapshot_rows(), public.market_sparklines(integer) from public;
grant execute on function public.market_snapshot_rows(), public.market_sparklines(integer) to anon, authenticated;
