-- Outreach infrastructure (migration 27). SERVER-ONLY: RLS is on and forced, and no policy or grant exists for anon or
-- authenticated, so only the portal server (service role) can read or write. Nothing here sends mail; sending is gated
-- in application code by OUTREACH_SENDING_ENABLED and, below, a message cannot be marked approved/scheduled/sent
-- without a named approver and timestamp. Idempotent: safe to apply twice.

create table if not exists public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  org text,
  name text,
  email text,
  source_url text,
  batch text,
  external_id text,
  status text not null default 'new' check (status in ('new','active','replied','unsubscribed','bounced','suppressed','needs_email','completed')),
  created_at timestamptz not null default now()
);
create unique index if not exists outreach_contacts_email_uniq on public.outreach_contacts (email);
create index if not exists outreach_contacts_batch_idx on public.outreach_contacts (batch);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  to_email text not null,
  batch text,
  step smallint not null check (step between 1 and 3),
  subject text not null,
  body text not null,
  personalization_source text,
  status text not null default 'draft' check (status in ('draft','approved','scheduled','sent','bounced','replied','cancelled')),
  approved_by text,
  approved_at timestamptz,
  scheduled_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (contact_id, step),
  -- Database backstop for "Daniel approves every send": anything past draft needs a named approver.
  constraint outreach_messages_approval_required check (status in ('draft','cancelled') or (approved_by is not null and length(btrim(approved_by)) > 1 and approved_at is not null))
);
create index if not exists outreach_messages_status_idx on public.outreach_messages (status, created_at);
create index if not exists outreach_messages_sent_idx on public.outreach_messages (sent_at) where sent_at is not null;
create index if not exists outreach_messages_batch_idx on public.outreach_messages (batch);

create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  reason text not null,
  source text not null,
  created_at timestamptz not null default now(),
  constraint suppression_target check ((email is not null) <> (domain is not null))
);
create unique index if not exists suppression_list_email_uniq on public.suppression_list (email);
create unique index if not exists suppression_list_domain_uniq on public.suppression_list (domain);

-- Only the sha256 of each unsubscribe token is stored; the token itself is an HMAC the server can recompute.
create table if not exists public.outreach_unsubscribe_tokens (
  token_hash text primary key,
  contact_id uuid not null references public.outreach_contacts(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

alter table public.outreach_contacts enable row level security;
alter table public.outreach_contacts force row level security;
alter table public.outreach_messages enable row level security;
alter table public.outreach_messages force row level security;
alter table public.suppression_list enable row level security;
alter table public.suppression_list force row level security;
alter table public.outreach_unsubscribe_tokens enable row level security;
alter table public.outreach_unsubscribe_tokens force row level security;

revoke all on public.outreach_contacts, public.outreach_messages, public.suppression_list, public.outreach_unsubscribe_tokens from anon, authenticated;

-- A narrow server-only JSON gateway for the four private outreach tables. The caller uses the public anon key;
-- the named connector secret is checked on every operation. Table and column identifiers are quoted.
create or replace function public.outreach_store(
  p_secret text, p_action text, p_table text, p_row jsonb default '{}'::jsonb, p_filter jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_table text; v_cols text; v_values text; v_sets text; v_key text; v_result jsonb;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_table not in ('outreach_contacts','outreach_messages','suppression_list','outreach_unsubscribe_tokens') then raise exception 'invalid table'; end if;
  v_table := format('public.%I', p_table);
  if p_action = 'list' then
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from %s t where to_jsonb(t) @> $1', v_table)
      into v_result using p_filter;
    return v_result;
  end if;
  if p_action not in ('insert','patch') or p_row = '{}'::jsonb then raise exception 'invalid operation'; end if;
  select string_agg(format('%I', key), ', '),
         string_agg(format('(jsonb_populate_record(null::%s, $1)).%I', v_table, key), ', '),
         string_agg(format('%I = (jsonb_populate_record(null::%s, $1)).%I', key, v_table, key), ', ')
    into v_cols, v_values, v_sets from jsonb_object_keys(p_row) as key;
  if p_action = 'insert' then
    execute format('insert into %s (%s) select %s on conflict do nothing returning to_jsonb(%I.*)', v_table, v_cols, v_values, p_table)
      into v_result using p_row;
    return v_result;
  end if;
  if p_filter = '{}'::jsonb then raise exception 'patch requires filter'; end if;
  execute format('update %s t set %s where to_jsonb(t) @> $2 returning to_jsonb(t.*)', v_table, v_sets)
    into v_result using p_row, p_filter;
  return v_result;
end $$;
revoke all on function public.outreach_store(text,text,text,jsonb,jsonb) from public;
grant execute on function public.outreach_store(text,text,text,jsonb,jsonb) to anon;
