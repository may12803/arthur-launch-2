-- Rollback for 20261005_24_engine_links_watches_pipeline.sql. Drops the pipeline RPCs, then the tables (children first), then the
-- composite key added to engine_properties. Every client link, watch, firing, cursor and run-log row is lost; the portal
-- tenant-pipeline job then fails closed (engine_pipeline_due is gone, so the cron route returns 502 and processes nothing).
drop function if exists public.engine_pipeline_advance(uuid, bigint, bigint);
drop function if exists public.engine_pipeline_due(int);
drop table if exists public.engine_pipeline_runs;
drop table if exists public.engine_pipeline_cursors;
drop table if exists public.engine_watch_firings;
drop table if exists public.engine_watches;
drop table if exists public.engine_links;
alter table public.engine_properties drop constraint if exists engine_properties_id_tenant_key;
