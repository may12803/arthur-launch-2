-- Rollback for 20261005_21_market_data.sql. Drops the market data tables and functions; all stored observations are lost
-- (they can be re-fetched with scripts/market-backfill.mjs).
drop function if exists public.market_sparklines(integer);
drop function if exists public.market_snapshot_rows();
drop function if exists public.market_upsert(text, jsonb, jsonb);
drop table if exists public.market_observations;
drop table if exists public.market_series;
