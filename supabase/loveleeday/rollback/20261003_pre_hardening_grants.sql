-- Rollback for 20261003_tenant_isolation_hardening.sql: restores the exact table grants production
-- (eydcfgoklajcztpoprsl) had on 2026-10-03 before the hardening, read from
-- information_schema.role_table_grants. Apply only to undo the hardening.
grant insert, references, select, trigger, truncate on public.audit_log to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.connectors to anon, authenticated;
grant references, select, trigger, truncate on public.contracts to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.coverage_areas to anon, authenticated;
grant references, select, trigger, truncate on public.deliverables to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.document_shares to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.documents to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.invites to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.memberships to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.staff_grants to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.tenant_connections to anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.tenants to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.workstream_decisions to anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.workstream_grades to anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.workstream_tasks to anon, authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.workstreams to anon, authenticated;
