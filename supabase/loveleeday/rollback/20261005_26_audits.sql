drop function if exists public.audit_pending(text,integer,uuid);
drop function if exists public.audit_save(text,uuid,text,text,uuid,text,date,integer,numeric,text,jsonb,integer);
drop function if exists public.audit_input_document(text,uuid,uuid);
drop function if exists public.audit_input_documents(text,uuid,integer);
drop function if exists public.audit_claim(text,uuid);
drop function if exists public.audit_record_purchase(text,text,text,timestamptz,uuid,text,text,text,integer,text,boolean);
drop table if exists public.audits;
