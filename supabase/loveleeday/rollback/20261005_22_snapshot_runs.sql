-- Rollback for 20261005_22_snapshot_runs.sql. Drops every anonymous snapshot run and its stored files.
delete from storage.objects where bucket_id = 'snapshot-uploads';
delete from storage.buckets where id = 'snapshot-uploads';
drop table if exists public.snapshot_runs;
