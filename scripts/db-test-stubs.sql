-- Stubs for the Supabase-only pieces the portal schema depends on, so the migrations can be applied to a scratch local Postgres 14.
-- Used only by scripts/db-test.sh. Never run this against a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema extensions;
create extension pgcrypto with schema extensions;
create extension "uuid-ossp" with schema extensions;
create extension citext with schema extensions;
select format('alter database %I set search_path = public, extensions', current_database()) \gexec

-- auth: users, mfa factors, uid() and jwt() driven by GUCs so a test can impersonate any user and assurance level.
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email varchar(255), email_confirmed_at timestamptz);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

-- vault: plaintext stand-in (the real one encrypts at rest). create_secret/decrypted_secrets/secrets are what the portal calls.
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text, description text, secret text, created_at timestamptz not null default now());
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '') returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into vault.secrets (name, description, secret) values (new_name, new_description, new_secret) returning id into v_id;
  return v_id;
end $$;
create view vault.decrypted_secrets as select id, name, description, secret, secret as decrypted_secret, created_at from vault.secrets;

-- Supabase default privileges on public objects, so the migrations' REVOKEs are exercised against the same starting point.
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Test helpers (schema t). Every check prints one PASS or FAIL line.
create schema t;
grant usage on schema t to public;
create function t.sec() returns text language sql immutable as $$ select 'connectors-server-test-secret-0123456789'::text $$;
create function t.oldsec() returns text language sql immutable as $$ select 'connections-server-test-secret-0123456789'::text $$;
create function t.badsec() returns text language sql immutable as $$ select 'a-wrong-secret-that-is-long-enough-0123'::text $$;
create function t.check(p_name text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok is true then raise notice 'PASS: %', p_name; else raise notice 'FAIL: %', p_name; end if;
end $$;
create function t.raises(p_name text, p_sql text, p_like text default null) returns void language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    if p_like is null or v_msg ilike p_like then raise notice 'PASS: % (raised: %)', p_name, left(v_msg, 90);
    else raise notice 'FAIL: % (wrong error: %)', p_name, left(v_msg, 140); end if;
    return;
  end;
  raise notice 'FAIL: % (no error raised)', p_name;
end $$;
create function t.n(p_sql text) returns bigint language plpgsql as $$
declare v bigint;
begin execute p_sql into v; return v; end $$;
create function t.login(p_user uuid, p_aal text default 'aal2') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, false);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'aal', p_aal,
    'amr', jsonb_build_array(jsonb_build_object('method', case when p_aal = 'aal2' then 'totp' else 'password' end)))::text, false);
  execute 'set role authenticated';
end $$;
create function t.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', '', false);
end $$;

-- Supabase Storage: only the bucket table that migrations insert into.
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
