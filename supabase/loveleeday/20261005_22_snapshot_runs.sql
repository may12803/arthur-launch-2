-- Anonymous Free Snapshot runs (migration 22). One row per upload: the stored file lives in the private
-- storage bucket snapshot-uploads under the same id. RLS is on and NO policy exists for anon or authenticated, so only
-- the portal server (service role) can read or write. The id is a random 192-bit token and is the only handle.
-- Rows and files are deleted 7 days after upload by /api/cron/snapshot-purge (lib/connectors/scheduler.ts, hourly);
-- reads also refuse an expired row. Idempotent: safe to apply twice.

create table if not exists public.snapshot_runs (
  id text primary key check (length(id) >= 32),
  status text not null default 'mapping' check (status in ('mapping', 'done', 'failed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  source text not null default 'upload' check (source in ('upload', 'sample')),
  filename text,
  file_bytes integer,
  file_sha256 text,
  storage_path text,
  header jsonb,
  rows_total integer,
  mapping jsonb,
  mapping_meta jsonb,
  result jsonb,
  error text,
  as_of date
);

create index if not exists snapshot_runs_expires_idx on public.snapshot_runs (expires_at);

alter table public.snapshot_runs enable row level security;
alter table public.snapshot_runs force row level security;
revoke all on public.snapshot_runs from anon, authenticated;

-- Private bucket for the uploaded files (no public read, no policies: service role only).
insert into storage.buckets (id, name, public, file_size_limit)
values ('snapshot-uploads', 'snapshot-uploads', false, 11534336)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;
