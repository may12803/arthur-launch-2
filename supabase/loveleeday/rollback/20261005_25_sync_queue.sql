drop function if exists public.sync_jobs_finish(text,uuid,text,text);
drop function if exists public.sync_jobs_claim(text,text,integer);
drop function if exists public.sync_jobs_enqueue(text);
drop table if exists public.sync_jobs;
