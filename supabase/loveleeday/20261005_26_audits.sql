-- Purchased audits. Repeatable DDL; all writes and encrypted document reads use the connectors server secret.
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  stripe_event_id text not null unique,
  stripe_session_id text not null unique,
  payment_intent text,
  offer_key text not null check (offer_key in ('ll_audit_standard', 'll_audit_plus')),
  record_limit integer not null,
  amount_cents integer,
  currency text,
  livemode boolean not null default false,
  status text not null default 'queued' check (status in ('queued','generating','ready','needs_data','failed')),
  status_reason text,
  created_at timestamptz not null default now(),
  generated_at timestamptz,
  attempted_at timestamptz,
  attempts integer not null default 0,
  as_of date,
  score integer,
  loss_total numeric(18,2),
  headline text,
  source_document_id uuid,
  source_filename text,
  result jsonb,
  version integer
);
create index if not exists audits_tenant_created_idx on public.audits (tenant_id, created_at desc);
alter table public.audits enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audits' and policyname='require_mfa_aal2') then
    create policy require_mfa_aal2 on public.audits as restrictive for all to authenticated
      using ((select public.session_is_strong())) with check ((select public.session_is_strong()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audits' and policyname='audits_member_select') then
    create policy audits_member_select on public.audits for select to authenticated using (public.is_tenant_member(tenant_id));
  end if;
end $$;
revoke all on public.audits from anon, authenticated;
grant select on public.audits to authenticated;

create or replace function public.audit_record_purchase(
  p_secret text, p_event_id text, p_event_type text, p_event_created timestamptz, p_tenant uuid, p_session text,
  p_payment_intent text, p_lookup_key text, p_amount_cents integer, p_currency text, p_livemode boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_created boolean := false;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if not exists (select 1 from public.tenants where id=p_tenant) then raise exception 'tenant not found'; end if;
  if p_lookup_key not in ('ll_audit_standard','ll_audit_plus') then raise exception 'unknown audit offer'; end if;
  insert into public.audits (tenant_id,stripe_event_id,stripe_session_id,payment_intent,offer_key,record_limit,amount_cents,currency,livemode,created_at)
    values (p_tenant,p_event_id,p_session,p_payment_intent,p_lookup_key,
      case when p_lookup_key='ll_audit_standard' then 5000 else 25000 end,p_amount_cents,p_currency,coalesce(p_livemode,false),p_event_created)
    on conflict do nothing returning id into v_id;
  if v_id is not null then v_created := true; end if;
  if v_id is null then
    select id into v_id from public.audits where stripe_session_id=p_session and tenant_id=p_tenant;
    if v_id is null then raise exception 'audit checkout conflict'; end if;
  end if;
  return jsonb_build_object('audit_id',v_id,'created',v_created);
end $$;

create or replace function public.audit_claim(p_secret text,p_audit uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.audits%rowtype;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  update public.audits set status='generating',attempts=attempts+1,attempted_at=now()
  where id=p_audit and (status='queued' or (status='generating' and attempted_at<now()-interval '10 minutes')
    or (status='failed' and attempted_at<now()-interval '10 minutes')
    or (status='needs_data' and exists(select 1 from public.documents d where d.tenant_id=audits.tenant_id and d.created_at>audits.attempted_at)))
  returning * into v;
  if not found then return null; end if;
  return jsonb_build_object('id',v.id,'tenant_id',v.tenant_id,'offer_key',v.offer_key,'record_limit',v.record_limit,'created_at',v.created_at,'attempts',v.attempts);
end $$;

create or replace function public.audit_input_documents(p_secret text,p_tenant uuid,p_limit integer)
returns table(id uuid,name text,content_type text,size_bytes integer,created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  return query select d.id,d.name,d.content_type,d.size_bytes,d.created_at from public.documents d
    where d.tenant_id=p_tenant and (lower(d.name) like '%.csv' or lower(d.name) like '%.xlsx')
    order by d.created_at desc limit least(greatest(p_limit,0),20);
end $$;

create or replace function public.audit_input_document(p_secret text,p_tenant uuid,p_doc uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v bytea; v_hash text;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  select extensions.pgp_sym_decrypt_bytea(b.ciphertext,private.tenant_key(d.tenant_id)),d.sha256
    into v,v_hash from public.documents d join private.document_blobs b on b.document_id=d.id
    where d.id=p_doc and d.tenant_id=p_tenant;
  if v is null then return null; end if;
  if encode(extensions.digest(v,'sha256'),'hex')<>v_hash then raise exception 'document failed its integrity check'; end if;
  return encode(v,'base64');
end $$;

create or replace function public.audit_save(
  p_secret text,p_audit uuid,p_status text,p_reason text,p_document uuid,p_filename text,p_as_of date,
  p_score integer,p_loss numeric,p_headline text,p_result jsonb,p_version integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  if p_status not in ('ready','needs_data','failed') then raise exception 'invalid status'; end if;
  if p_document is not null and not exists (
    select 1 from public.audits a join public.documents d on d.id=p_document and d.tenant_id=a.tenant_id where a.id=p_audit
  ) then raise exception 'document not in audit tenant'; end if;
  update public.audits set status=p_status,status_reason=p_reason,source_document_id=p_document,
    source_filename=p_filename,as_of=p_as_of,score=p_score,loss_total=p_loss,headline=p_headline,
    result=p_result,version=p_version,generated_at=case when p_status='ready' then now() else null end
    where id=p_audit and status='generating';
  get diagnostics v_n=row_count;
  return v_n=1;
end $$;

create or replace function public.audit_pending(p_secret text,p_limit integer,p_tenant uuid default null)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare v uuid[];
begin
  if not private.server_ok_named(p_secret, 'connectors-server') then raise exception 'server only'; end if;
  select coalesce(array_agg(id),array[]::uuid[]) into v from (
    select a.id from public.audits a where (p_tenant is null or a.tenant_id=p_tenant)
      and (a.status='queued' or (a.status='generating' and a.attempted_at<now()-interval '10 minutes')
        or (a.status='failed' and a.attempted_at<now()-interval '10 minutes')
        or (a.status='needs_data' and exists(select 1 from public.documents d where d.tenant_id=a.tenant_id and d.created_at>a.attempted_at)))
    order by a.created_at limit least(greatest(p_limit,0),20)
  ) q;
  return v;
end $$;

revoke all on function public.audit_record_purchase(text,text,text,timestamptz,uuid,text,text,text,integer,text,boolean),
  public.audit_claim(text,uuid),public.audit_input_documents(text,uuid,integer),
  public.audit_input_document(text,uuid,uuid),
  public.audit_save(text,uuid,text,text,uuid,text,date,integer,numeric,text,jsonb,integer),
  public.audit_pending(text,integer,uuid) from public;
grant execute on function public.audit_record_purchase(text,text,text,timestamptz,uuid,text,text,text,integer,text,boolean),
  public.audit_claim(text,uuid),public.audit_input_documents(text,uuid,integer),
  public.audit_input_document(text,uuid,uuid),
  public.audit_save(text,uuid,text,text,uuid,text,date,integer,numeric,text,jsonb,integer),
  public.audit_pending(text,integer,uuid) to anon,authenticated;
