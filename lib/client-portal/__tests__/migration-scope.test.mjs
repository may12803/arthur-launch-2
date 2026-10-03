// Red team PORTAL-1 P6: the hardening migration must only ever touch the enumerated portal tables.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(path.join(here, "../../../supabase/loveleeday/20261003_tenant_isolation_hardening.sql"), "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"); // statements only, comments dropped
const PORTAL = ["audit_log", "connectors", "contracts", "coverage_areas", "deliverables", "document_shares", "documents", "invites", "memberships",
  "staff_grants", "tenant_connections", "tenants", "workstream_decisions", "workstream_grades", "workstream_tasks", "workstreams"];

test("no schema-wide revoke or default-privilege change", () => {
  assert.doesNotMatch(code, /all\s+tables\s+in\s+schema/i);
  assert.doesNotMatch(code, /alter\s+default\s+privileges/i);
});

test("every revoke names only enumerated portal tables", () => {
  const revokes = [...code.matchAll(/revoke\s[\s\S]*?\sfrom\s+(anon|authenticated)\s*;/gi)];
  assert.ok(revokes.length >= 3, "expected the anon, authenticated and write revokes");
  for (const m of revokes) {
    const tables = [...m[0].matchAll(/public\.([a-z_]+)/g)].map((x) => x[1]);
    assert.ok(tables.length > 0, `revoke without a named table: ${m[0].slice(0, 60)}`);
    for (const t of tables) assert.ok(PORTAL.includes(t), `revoke touches non-portal table ${t}`);
  }
  const anon = revokes.find((m) => /from\s+anon/i.test(m[0]))[0];
  for (const t of PORTAL) assert.match(anon, new RegExp(`public\\.${t}\\b`), `anon revoke misses portal table ${t}`);
});

test("the RLS guard only blocks on portal tables", () => {
  assert.match(code, /raise exception 'portal tables without RLS/);
  assert.doesNotMatch(code, /raise exception 'tables without RLS/);
});
