-- NOT APPLIED to prod. Proposed: a real is_demo flag on tenants.
-- On 2026-10-03 the Harbor & Vine (demo) tenant was flagged with the existing column plan = 'demo'
-- (Dabney is plan = 'operator'). Applying this migration then backfilling from plan keeps one source of truth.
alter table public.tenants add column if not exists is_demo boolean not null default false;
update public.tenants set is_demo = true where plan = 'demo';

-- Provisioning path used for the demo tenant (no self-serve path exists: auth signups are disabled and
-- public.create_tenant is EXECUTE-granted to service_role/postgres only; no app code calls it).
-- create_tenant needs auth.uid(), so the operator runs it with the new owner's uid set as the JWT subject:
--
--   -- 1. auth user (admin-equivalent; the loveleeday service-role key is intentionally not stored)
--   insert into auth.users (...) values (...);  insert into auth.identities (...) values (...);
--   -- 2. tenant + owner membership + audit row, all done by the real function
--   select set_config('request.jwt.claim.sub', '<owner uid>', true);
--   select public.create_tenant('Harbor & Vine (demo)', 'harbor-vine-demo');
--   update public.tenants set plan = 'demo' where slug = 'harbor-vine-demo';
