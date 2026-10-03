// Run: npm test   (node:test; no network)
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listCandidates, pickActive, resolveActiveTenant } from "../active-tenant.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const A = "aaaaaaaa-0000-4000-8000-00000000000a";
const B = "bbbbbbbb-0000-4000-8000-00000000000b";
const C = "cccccccc-0000-4000-8000-00000000000c";

// Minimal supabase-js stand-in: every filter is chainable, awaiting yields the table's rows.
function fake({ memberships = [], grants = [] }) {
  return {
    from(table) {
      const rows = table === "memberships" ? memberships : grants;
      const q = { select: () => q, eq: () => q, not: () => q, is: () => q, gt: () => q, then: (ok) => ok({ data: rows, error: null }) };
      return q;
    },
  };
}

// Reproduction of the red-team P1 case: viewer in A (joined later), owner in B (created earlier).
const both = { memberships: [
  { tenant_id: B, role: "owner", created_at: "2026-01-01", accepted_at: "2026-09-02" },
  { tenant_id: A, role: "viewer", created_at: "2026-02-01", accepted_at: "2026-09-01" },
] };

test("two memberships and no selection is ambiguous, never 'the first membership'", async () => {
  const r = await resolveActiveTenant(fake(both), "u1", null);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "ambiguous");
  assert.equal(r.candidates.length, 2);
});

test("explicit selection wins and carries THAT tenant's role: screen and API agree", async () => {
  const sc = await resolveActiveTenant(fake(both), "u1", A); // what a screen resolves from the cookie
  const api = await resolveActiveTenant(fake(both), "u1", A); // what an API call resolves from the same cookie
  assert.deepEqual([sc.tenantId, sc.role], [A, "viewer"]);
  assert.deepEqual([api.tenantId, api.role], [sc.tenantId, sc.role]);
  const other = await resolveActiveTenant(fake(both), "u1", B);
  assert.deepEqual([other.tenantId, other.role], [B, "owner"]);
});

test("a selection the caller does not belong to is refused (not silently replaced)", async () => {
  const r = await resolveActiveTenant(fake(both), "u1", C);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not_member");
  const stale = await resolveActiveTenant(fake({ memberships: [{ tenant_id: A, role: "owner" }] }), "u1", B);
  assert.equal(stale.reason, "not_member"); // even with a single membership, a wrong explicit id is not "fixed up"
});

test("one membership resolves without a selection; none is 'none'", async () => {
  const one = await resolveActiveTenant(fake({ memberships: [{ tenant_id: A, role: "member" }] }), "u1", null);
  assert.deepEqual([one.ok, one.tenantId, one.role], [true, A, "member"]);
  assert.equal((await resolveActiveTenant(fake({}), "u1", null)).reason, "none");
});

test("staff grants are candidates; a membership outranks a grant on the same company", async () => {
  const c = await listCandidates(fake({ memberships: [{ tenant_id: A, role: "viewer" }], grants: [{ tenant_id: A }, { tenant_id: B }] }), "u1");
  assert.deepEqual(c.map((x) => [x.tenantId, x.role, x.source]), [[A, "viewer", "membership"], [B, "staff", "grant"]]);
  assert.equal(pickActive(c, B).role, "staff");
  assert.equal(pickActive(c, A).role, "viewer");
});

test("selection is case/whitespace tolerant but exact otherwise", () => {
  const c = [{ tenantId: A, role: "owner", source: "membership" }];
  assert.equal(pickActive(c, ` ${A.toUpperCase()} `).ok, true);
  assert.equal(pickActive(c, A.slice(0, -1)).ok, false);
});

// Structural guard: the old "pick a membership" shortcuts must not come back in routes or screens.
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    statSync(p).isDirectory() ? walk(p, out) : /\.(ts|tsx)$/.test(f) && out.push(p);
  }
  return out;
}
test("no API route or portal screen selects a tenant straight from the memberships table", () => {
  const files = [...walk(path.join(root, "app/api/client")), ...walk(path.join(root, "app/client"))];
  const bad = files.filter((f) => /from\("memberships"\)/.test(readFileSync(f, "utf8")) && !/team[\\/]page\.tsx$/.test(f));
  assert.deepEqual(bad.map((f) => path.relative(root, f)), []);
});
test("invite and billing routes resolve the tenant through getApiContext", () => {
  for (const r of ["app/api/client/team/invite/route.ts", "app/api/client/billing/portal/route.ts"]) {
    assert.match(readFileSync(path.join(root, r), "utf8"), /getApiContext\(\)/, r);
  }
});
