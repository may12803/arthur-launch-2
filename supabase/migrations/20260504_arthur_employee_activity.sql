-- Arthur employee activity log — recorder layer of the learning-layer mandate.
-- Every dispatch from /api/chat (and any future dispatch site) writes one row here.
-- Read by /api/employees/activity for the dashboard widget + /employees page.

create table if not exists arthur_employee_activity (
  id           bigserial primary key,
  ts           timestamptz not null default now(),
  team         text not null,
  employee_id  text not null,
  task         text not null,
  model_used   text,
  state        text not null default 'active',  -- active | training | idle | error
  duration_ms  integer,
  metadata     jsonb default '{}'::jsonb
);

create index if not exists arthur_employee_activity_ts_idx
  on arthur_employee_activity (ts desc);

create index if not exists arthur_employee_activity_emp_idx
  on arthur_employee_activity (team, employee_id, ts desc);

-- Auto-prune rows older than 30 days (cron job; ignore if pg_cron missing)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'prune-arthur-employee-activity',
      '0 4 * * *',
      $$delete from arthur_employee_activity where ts < now() - interval '30 days'$$
    );
  end if;
exception when others then null;
end$$;
