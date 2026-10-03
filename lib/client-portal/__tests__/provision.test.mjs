// Run: npm test   (node:test; no network, no email, no production access)
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { provisionTenant } from "../provision.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- unit: orchestration with a mocked staff session and a mocked Auth admin (no email is ever sent) ----
function mocks({ staff = true, taken = false, existing = false, provisionError = null, deleteFails = false } = {}) {
  const calls = { rpc: [], invites: [], deleted: [] };
  const staffClient = {
    async rpc(fn, args) {
      calls.rpc.push([fn, args]);
      if (!staff) return { data: null, error: { message: "staff only" } };
      if (fn === "staff_slug_taken") return { data: taken, error: null };
      return provisionError ? { data: null, error: { message: provisionError } } : { data: "tenant-uuid", error: null };
    },
  };
  const admin = {
    async inviteUserByEmail(email) {
      calls.invites.push(email);
      return existing
        ? { data: null, error: { message: "A user with this email address has already been registered" } }
        : { data: { user: { id: "owner-uuid" } }, error: null };
    },
    async deleteUser(id) { calls.deleted.push(id); return deleteFails ? { error: { message: "boom" } } : { error: null }; },
    async listUsers() { return { data: { users: [{ id: "existing-uuid", email: "Owner@Example.com" }] }, error: null }; },
  };
  return { calls, staffClient, admin };
}
const input = { name: "Harbor Bar", slug: "harbor-bar", ownerEmail: "Owner@Example.com" };

test("staff can provision: invites owner, then creates tenant as staff", async () => {
  const m = mocks();
  const r = await provisionTenant(m.staffClient, m.admin, input);
  assert.deepEqual(r, { ok: true, tenantId: "tenant-uuid", ownerId: "owner-uuid", invited: true, pendingOwnerAcceptance: false });
  assert.deepEqual(m.calls.invites, ["owner@example.com"]);
  assert.deepEqual(m.calls.rpc.at(-1), ["staff_provision_tenant", { p_name: "Harbor Bar", p_slug: "harbor-bar", p_owner: "owner-uuid", p_owner_email: "owner@example.com" }]);
});

test("non-staff refused with 403 and no auth user is created", async () => {
  const m = mocks({ staff: false });
  const r = await provisionTenant(m.staffClient, m.admin, input);
  assert.equal(r.ok, false); assert.equal(r.status, 403);
  assert.equal(m.calls.invites.length, 0);
});

test("duplicate slug refused with 409 before any invite", async () => {
  const m = mocks({ taken: true });
  const r = await provisionTenant(m.staffClient, m.admin, input);
  assert.equal(r.ok, false); assert.equal(r.status, 409);
  assert.equal(m.calls.invites.length, 0);
});

test("already-registered owner is reused, not re-invited", async () => {
  const m = mocks({ existing: true });
  const r = await provisionTenant(m.staffClient, m.admin, input);
  assert.deepEqual(r, { ok: true, tenantId: "tenant-uuid", ownerId: "existing-uuid", invited: false, pendingOwnerAcceptance: true });
});

// P4: no orphan Auth user may remain when the tenant transaction fails after the invite.
test("tenant transaction fails after a fresh invite: the invited user is deleted (no orphan)", async () => {
  for (const [err, status] of [["slug already in use", 409], ["boom: connection lost", 500], ["owner must be the user of the invited email", 400]]) {
    const m = mocks({ provisionError: err });
    const r = await provisionTenant(m.staffClient, m.admin, input);
    assert.equal(r.ok, false); assert.equal(r.status, status);
    assert.deepEqual(m.calls.invites, ["owner@example.com"]);
    assert.deepEqual(m.calls.deleted, ["owner-uuid"], `deleted for ${err}`);
    assert.equal(r.orphanedUserId, undefined);
  }
});

test("a pre-existing account is never deleted when provisioning fails", async () => {
  const m = mocks({ existing: true, provisionError: "slug already in use" });
  const r = await provisionTenant(m.staffClient, m.admin, input);
  assert.equal(r.ok, false); assert.equal(r.status, 409);
  assert.deepEqual(m.calls.deleted, []);
});

test("if the compensating delete itself fails, the orphan is reported, not hidden", async () => {
  const m = mocks({ provisionError: "boom", deleteFails: true });
  const r = await provisionTenant(m.staffClient, m.admin, input);
  assert.equal(r.ok, false); assert.equal(r.status, 500); assert.equal(r.orphanedUserId, "owner-uuid");
});

test("a refused or invalid request never invites, so there is nothing to clean up", async () => {
  for (const m of [mocks({ staff: false }), mocks({ taken: true })]) {
    await provisionTenant(m.staffClient, m.admin, input);
    assert.equal(m.calls.invites.length, 0); assert.equal(m.calls.deleted.length, 0);
  }
});

test("bad input is rejected before touching anything", async () => {
  const m = mocks();
  for (const bad of [{ ...input, slug: "Bad Slug!" }, { ...input, ownerEmail: "nope" }, { ...input, name: "x" }]) {
    assert.equal((await provisionTenant(m.staffClient, m.admin, bad)).status, 400);
  }
  assert.equal(m.calls.rpc.length, 0);
});

// ---- integration: the real migration SQL against a throwaway local Postgres, with prod's RLS policies mirrored ----
const hasPg = spawnSync("which", ["initdb"]).status === 0;
test("database: provisioning, refusals, and tenant isolation", { skip: !hasPg && "no local postgres" }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bar7pg-"));
  const port = String(55000 + Math.floor(Math.random() * 4000));
  const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts });
  try {
    sh("initdb", ["-D", dir, "-A", "trust", "-U", "postgres"], { stdio: "pipe" });
    sh("pg_ctl", ["-D", dir, "-o", `-p ${port} -k ${dir}`, "-l", path.join(dir, "log"), "-w", "start"], { stdio: "pipe" });
    const psql = (file) => spawnSync("psql", ["-h", dir, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=0", "-At", "-f", file], { encoding: "utf8" });
    const fixture = path.join(here, "provision.fixture.sql");
    const migration = path.join(here, "../../../supabase/loveleeday/20261003_staff_provision_tenant.sql");
    const fx = readFileSync(fixture, "utf8").split("-- SCENARIOS");
    const full = path.join(dir, "run.sql");
    writeFileSync(full, fx[0] + "\n" + readFileSync(migration, "utf8") + "\n-- SCENARIOS" + fx[1]);
    const out = psql(full);
    const lines = out.stdout.split("\n").filter((l) => l.startsWith("RESULT|"));
    const get = (k) => lines.find((l) => l.startsWith(`RESULT|${k}|`))?.split("|").slice(2).join("|");
    assert.equal(get("staff_provisions"), "ok", out.stderr);
    assert.equal(get("tenant_row"), "1");
    assert.equal(get("owner_membership"), "owner");
    assert.equal(get("audit_row"), "tenant.provisioned");
    assert.equal(get("nonstaff"), "refused:staff only");
    assert.equal(get("weak_session"), "refused:staff only");
    assert.equal(get("dup_slug"), "refused:slug already in use");
    assert.equal(get("bad_slug"), "refused:slug must be 3 to 40 lowercase letters, digits or hyphens");
    assert.equal(get("anon_exec"), "false");
    // P5: owner must be the invited email's user; pre-existing accounts become pending owners; everything is audited.
    assert.equal(get("arbitrary_owner"), "refused:owner must be the user of the invited email");
    assert.equal(get("no_email"), "refused:owner must be the user of the invited email");
    assert.equal(get("existing_owner"), "allowed");
    assert.equal(get("pending_accepted_at"), "null");
    assert.equal(get("pending_audit"), "tenant.provisioned_pending_owner|existing_account_pending_acceptance|otherowner@y.test");
    assert.equal(get("fresh_audit_state"), "freshly_invited");
    assert.equal(get("new_owner_sees_tenants"), "1");
    assert.equal(get("new_owner_sees_other_members"), "0");
    assert.equal(get("new_owner_sees_other_audit"), "0");
    assert.equal(get("other_owner_sees_new_tenant"), "0");
    assert.equal(get("other_owner_sees_new_members"), "0");
  } finally {
    spawnSync("pg_ctl", ["-D", dir, "-m", "immediate", "stop"], { stdio: "pipe" });
    rmSync(dir, { recursive: true, force: true });
  }
});
