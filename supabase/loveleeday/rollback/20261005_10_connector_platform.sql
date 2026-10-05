-- Roll back 20261005_14 first if it is applied (its triggers sit on tables this file changes).
-- Rollback for 20261005_10_connector_platform.sql + 20261005_11_connector_definitions_seed.sql. Run in the Supabase SQL editor on the
-- SAME project the migration was applied to. DESTRUCTIVE: drops every connector-platform table with its data (ingested records, sync
-- history, approvals, api keys, webhooks, entities). Export what you need first. The base schema (20261005_00) is not rolled back:
-- it only restates what already existed.

drop function if exists public.connector_oauth_begin(uuid, text, text, text, text);
drop function if exists public.connection_upload_mapping(uuid, uuid, text, jsonb, integer);
drop function if exists public.entity_upsert(uuid, uuid, uuid, text, text, text, jsonb);
drop function if exists public.entity_delete(uuid);
drop function if exists public.membership_scope_set(uuid, uuid[]);
drop function if exists public.approval_decide(uuid, text, text, jsonb);
drop function if exists public.api_key_create(uuid, text, text[]);
drop function if exists public.api_key_revoke(uuid);
drop function if exists public.webhook_upsert(uuid, uuid, text, text[], boolean);
drop function if exists public.webhook_delete(uuid);
drop function if exists public.tenant_security_set(uuid, boolean, text[], boolean, integer, integer);
drop function if exists public.audit_export(uuid, timestamptz, timestamptz, bigint, integer);
drop function if exists public.oauth_state_consume(text, text, uuid, uuid);
drop function if exists public.connection_store_tokens(text, uuid, jsonb, timestamptz);
drop function if exists public.connections_due(text);
drop function if exists public.sync_run_start(text, uuid, text);
drop function if exists public.sync_cursor_set(text, uuid, text, text);
drop function if exists public.sync_cursor_get(text, uuid, text);
drop function if exists public.sync_runs_recent(text, uuid, integer);
drop function if exists public.sync_run_finish(text, uuid, text, integer, integer, text, text);
drop function if exists public.ingest_records(text, uuid, jsonb);
drop function if exists public.connection_health_record(text, uuid);
drop function if exists public.approval_propose(text, uuid, text, text, text, jsonb, text, uuid);
drop function if exists public.api_key_verify(text, text);
drop function if exists public.ingested_records_since(text, text, bigint, integer);
drop function if exists public.workstream_task_propose(text, text, text, text, text, text, jsonb, text);
drop function if exists public.approvals_approved(text, text, integer);
drop function if exists public.approval_claim(text, uuid);
drop function if exists public.approval_record_proof(text, uuid, text);
drop table if exists public.webhook_deliveries, public.webhook_endpoints, public.api_keys, public.tenant_security,
  public.approvals, public.membership_scopes, public.entities, public.upload_mappings, public.connection_health,
  public.ingested_records, public.sync_cursors, public.sync_runs cascade;
drop table if exists private.oauth_states;

-- Helpers last: the dropped tables' read policies used them.
drop function if exists public.is_tenant_admin(uuid);
drop function if exists private.compute_connection_health(uuid, timestamptz);
drop function if exists private.refresh_connection_health(uuid);
drop function if exists private.require_role(uuid, text, boolean);
drop function if exists public.entity_in_scope(uuid, uuid);
drop function if exists private.entity_in_scope(uuid, uuid);

-- Connections created through the new catalog have keys that the legacy catalog does not know; they cannot satisfy the restored FK.
drop trigger if exists tenant_connections_key_guard on public.tenant_connections;
drop function if exists private.tc_key_guard();
delete from public.tenant_connections where connector_key not in (select key from public.connectors);
alter table public.tenant_connections
  drop constraint if exists tenant_connections_health_check,
  drop constraint if exists tenant_connections_auth_method_check,
  drop column if exists definition_key, drop column if exists auth_method, drop column if exists external_account_id,
  drop column if exists scopes, drop column if exists token_expires_at, drop column if exists health,
  drop column if exists last_success_at, drop column if exists last_rows, drop column if exists stale_after;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tenant_connections_connector_key_fkey') then
    alter table public.tenant_connections add constraint tenant_connections_connector_key_fkey foreign key (connector_key) references public.connectors(key);
  end if;
end $$;
drop table if exists public.connector_definitions;

-- Restore the original connection_secret(): only the connections-server secret opens it.
create or replace function public.connection_secret(p_secret text, p_connection uuid)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v_t uuid; v_c bytea;
begin
  if not private.server_ok_named(p_secret, 'connections-server') then raise exception 'server only'; end if;
  select c.tenant_id, s.ciphertext into v_t, v_c from public.tenant_connections c join private.connection_secrets s on s.connection_id = c.id where c.id = p_connection;
  if v_c is null then return null; end if;
  return extensions.pgp_sym_decrypt(v_c, private.tenant_key(v_t));
end $function$;

-- Server secret rows for 'connectors-server' are data, not schema: remove with
--   delete from private.server_secrets where name = 'connectors-server';
-- if the secret should stop working too.
