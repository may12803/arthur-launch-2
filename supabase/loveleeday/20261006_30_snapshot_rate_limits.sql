-- Shared admission counter for the anonymous Free Snapshot endpoints (migration 30). The in-process limiter in
-- lib/snapshot/limits.ts resets on every restart and is blind to a second machine; this table is the shared fixed-window
-- counter behind it. Service role only: RLS forced, nothing granted to anon or authenticated. Idempotent.

create table if not exists public.snapshot_rate_hits (
  bucket text not null check (length(bucket) <= 200),
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

create index if not exists snapshot_rate_hits_window_idx on public.snapshot_rate_hits (window_start);

alter table public.snapshot_rate_hits enable row level security;
alter table public.snapshot_rate_hits force row level security;
revoke all on public.snapshot_rate_hits from anon, authenticated;

-- One atomic upsert-and-count per call. Returns whether this hit is within p_max for the current window, and how many
-- seconds until the window rolls over.
create or replace function public.snapshot_rate_take(p_bucket text, p_max integer, p_window_seconds integer)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_hits integer;
begin
  if p_bucket is null or length(p_bucket) > 200 or p_max is null or p_max < 1 or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid rate limit arguments';
  end if;
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.snapshot_rate_hits as h (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = h.hits + 1
  returning h.hits into v_hits;
  -- Housekeeping: a small share of calls trims windows older than a day.
  if random() < 0.02 then
    delete from public.snapshot_rate_hits where window_start < now() - interval '1 day';
  end if;
  allowed := v_hits <= p_max;
  retry_after_seconds := greatest(1, ceil(extract(epoch from (v_start + make_interval(secs => p_window_seconds) - now()))))::integer;
  return next;
end;
$$;

revoke all on function public.snapshot_rate_take(text, integer, integer) from public, anon, authenticated;
grant execute on function public.snapshot_rate_take(text, integer, integer) to service_role;
