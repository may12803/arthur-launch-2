-- Rollback of 20261005_12_staff_permissions.sql: restores the previous definitions (base schema and connector platform versions).

create or replace function public.document_delete(p_id uuid, p_ip text default null::text)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare v_doc public.documents%rowtype;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  select * into v_doc from public.documents d where d.id = p_id;
  if not found or coalesce(private.member_role(v_doc.tenant_id), '') not in ('owner','admin') then
    raise exception 'only an owner or admin can delete documents';
  end if;
  delete from public.documents where id = p_id; -- cascades the ciphertext
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (v_doc.tenant_id, auth.uid(), 'document.deleted', 'document:' || p_id,
          jsonb_build_object('name', v_doc.name, 'ip', p_ip));
end $function$;

create or replace function public.share_create(p_document uuid, p_email text, p_days integer)
 returns text language plpgsql security definer set search_path to ''
as $function$
declare v_doc public.documents%rowtype; v_t public.tenants%rowtype; v_role text; v_token text; v_max integer; v_email text; v_id uuid;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  select * into v_doc from public.documents where id = p_document;
  if not found then raise exception 'document not found'; end if;
  v_role := private.member_role(v_doc.tenant_id);
  if v_role is null or v_role = 'viewer' then raise exception 'not allowed to share this document'; end if;
  select * into v_t from public.tenants where id = v_doc.tenant_id;
  if not v_t.external_sharing then raise exception 'sharing outside your company is turned off for this account'; end if;
  v_email := lower(trim(p_email));
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'enter a valid email address'; end if;
  v_max := case when v_t.data_class = 'regulated' then 7 else 30 end;
  if p_days is null or p_days < 1 or p_days > v_max then raise exception 'links can last 1 to % days for this account', v_max; end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.document_shares(tenant_id, document_id, recipient_email, token_hash, created_by, expires_at)
  values (v_doc.tenant_id, p_document, v_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + make_interval(days => p_days))
  returning id into v_id;
  insert into private.share_codes(share_id) values (v_id);
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (v_doc.tenant_id, auth.uid(), 'share.created', 'share:' || v_id,
          jsonb_build_object('name', v_doc.name, 'recipient', v_email, 'days', p_days));
  return v_token;
end $function$;

create or replace function public.share_revoke(p_share uuid)
 returns void language plpgsql security definer set search_path to ''
as $function$
declare v_s public.document_shares%rowtype; v_role text;
begin
  if not public.session_is_strong() then raise exception 'two-factor sign-in required'; end if;
  select * into v_s from public.document_shares where id = p_share;
  if not found then raise exception 'share not found'; end if;
  v_role := private.member_role(v_s.tenant_id);
  if v_role is null or (v_role not in ('owner', 'admin') and v_s.created_by is distinct from auth.uid()) then
    raise exception 'not allowed to revoke this link';
  end if;
  update public.document_shares set revoked_at = now() where id = p_share and revoked_at is null;
  insert into public.audit_log(tenant_id, actor, action, target, meta)
  values (v_s.tenant_id, auth.uid(), 'share.revoked', 'share:' || p_share, jsonb_build_object('recipient', v_s.recipient_email));
end $function$;

create or replace function public.membership_scope_set(p_membership uuid, p_entities uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v_tenant uuid; v_n integer;
begin
  select tenant_id into v_tenant from public.memberships where id = p_membership;
  if v_tenant is null then raise exception 'member not found'; end if;
  perform private.require_role(v_tenant, 'admin', true);
  p_entities := coalesce(p_entities, '{}'::uuid[]);
  select count(*) into v_n from public.entities where id = any (p_entities) and tenant_id = v_tenant;
  if v_n <> (select count(distinct x) from unnest(p_entities) x) then raise exception 'entity not found'; end if;
  delete from public.membership_scopes where membership_id = p_membership;
  insert into public.membership_scopes (membership_id, entity_id) select p_membership, x from (select distinct unnest(p_entities) x) s;
  insert into public.audit_log (tenant_id, actor, action, target, meta)
    values (v_tenant, auth.uid(), 'membership.scope_set', 'membership:' || p_membership, jsonb_build_object('entities', p_entities));
end $$;
