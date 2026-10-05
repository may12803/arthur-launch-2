-- Rollback for 20261005_20_engine_tenant_graph.sql. Drops the client-tenant engine graph (RPCs, then tables, children first).
-- Every client-tenant entity, alias, property and mention stored here is lost; the engine's pg-store adapter will then fail
-- closed (it refuses rather than falling back to the Mac SQLite file).
drop function if exists public.engine_resolve(uuid, text);
drop function if exists public.engine_props_as_of(uuid, uuid, timestamptz, timestamptz);
drop function if exists public.engine_set_prop(uuid, uuid, text, text, timestamptz, timestamptz, text, text, real);
drop table if exists public.engine_mentions;
drop table if exists public.engine_properties;
drop table if exists public.engine_aliases;
drop table if exists public.engine_entities;
