-- Rollback for 20261005_27_outreach.sql. Drops all outreach contacts, messages, tokens and the suppression list.
-- WARNING: the suppression list is the record of who must never be emailed again; export it first if any row exists.
drop table if exists public.outreach_unsubscribe_tokens;
drop table if exists public.outreach_messages;
drop table if exists public.suppression_list;
drop table if exists public.outreach_contacts;
drop function if exists public.outreach_store(text,text,text,jsonb,jsonb);
