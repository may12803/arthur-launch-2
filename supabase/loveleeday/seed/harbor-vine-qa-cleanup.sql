-- Removes ONLY the QA residue the 2026-10-05 route audits left on the Harbor & Vine demo tenant (slug 'harbor-vine-demo').
-- Residue (second audit, "Harbor & Vine mutations left behind"): QA text documents (one shared outside, which emailed), pending invites to
-- arthur+harborqa*@loveleedaystudios.com, and the QA connection key/request rows (toast requested, stripe key set then disconnected).
-- Not touched: the real demo document harbor-vine-demo-toast-sales.jsonl, the accepted demo owner membership, audit_log (append-only), the
-- sharing switch (its original value is unknown), staff grants (the QA grant already ended), any other tenant.
--
-- SELECT FIRST (what each statement below matches; run these before the DO block):
--   select id, name, by_staff, created_at from public.documents d where d.tenant_id = (select id from public.tenants where slug = 'harbor-vine-demo') and d.name ~ '^qa-.*\.txt$';
--   select s.id, s.recipient_email, s.revoked_at from public.document_shares s where s.document_id in (<the ids above>);
--   select id, email, role from public.invites where tenant_id = (select id from public.tenants where slug = 'harbor-vine-demo') and accepted_at is null and email::text ilike 'arthur+harborqa%@loveleedaystudios.com';
--   select id, connector_key, status from public.tenant_connections where tenant_id = (select id from public.tenants where slug = 'harbor-vine-demo') and connector_key in ('toast', 'stripe') and status in ('requested', 'invited', 'key_received', 'disconnected') and proof is null and managed_by = 'client';
-- On the live project at 2026-10-05 (read-only SELECTs) these matched: 8 documents (qa-admin, qa-member x2, qa-target-member x2, qa-target-viewer,
-- qa-staffgrant, qa-target-staffgrant), 2 shares (both to arthur+harborqa@, both still live), 3 invites (arthur+harborqa@, -admin@, -owner@, all pending),
-- 2 connections (toast requested, stripe disconnected). Idempotent: a second run matches nothing.

do $cleanup$
declare v_t uuid; v_docs uuid[]; n_sh int; n_doc int; n_inv int; n_conn int;
begin
  select id into v_t from public.tenants where slug = 'harbor-vine-demo';
  if v_t is null then raise notice 'harbor-vine QA cleanup: tenant not found, nothing to do'; return; end if;

  select coalesce(array_agg(id), '{}') into v_docs from public.documents where tenant_id = v_t and name ~ '^qa-.*\.txt$';

  -- shares of those documents first (a live outside link must not outlive its file)
  delete from public.document_shares where tenant_id = v_t and document_id = any (v_docs);
  get diagnostics n_sh = row_count;
  delete from public.documents where tenant_id = v_t and id = any (v_docs); -- cascades the encrypted blob
  get diagnostics n_doc = row_count;

  delete from public.invites where tenant_id = v_t and accepted_at is null and email::text ilike 'arthur+harborqa%@loveleedaystudios.com';
  get diagnostics n_inv = row_count;

  -- stored QA credentials go with their connection rows
  delete from private.connection_secrets where connection_id in (
    select id from public.tenant_connections where tenant_id = v_t and connector_key in ('toast', 'stripe')
      and status in ('requested', 'invited', 'key_received', 'disconnected') and proof is null and managed_by = 'client');
  delete from public.tenant_connections where tenant_id = v_t and connector_key in ('toast', 'stripe')
    and status in ('requested', 'invited', 'key_received', 'disconnected') and proof is null and managed_by = 'client';
  get diagnostics n_conn = row_count;

  raise notice 'harbor-vine QA cleanup: % documents, % shares, % invites, % connections removed', n_doc, n_sh, n_inv, n_conn;
end
$cleanup$;
