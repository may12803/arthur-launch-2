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
const ORIGIN = "https://portal.example.test";

// ---- unit: orchestration against an in-memory stand-in for the database function (idempotent by slug, like the real one) ----
function fakeDb({ staff = true, loseFirstResponse = false } = {}) {
  const tenants = new Map(); // slug -> { tenant_id, invite_id, token, email, accepted }
  const state = { rpcCalls: 0, loseNext: loseFirstResponse, authUsersCreated: 0, deletes: 0 };
  const client = {
    async rpc(fn, args) {
      state.rpcCalls++;
      assert.equal(fn, "staff_provision_tenant", "only the single transactional RPC is used");
      assert.deepEqual(Object.keys(args).sort(), ["p_key", "p_name", "p_owner_email", "p_slug"], "no owner user id is ever passed");
      if (!staff) return { data: null, error: { message: "staff only" } };
      let row = tenants.get(args.p_slug), created = false;
      if (row && (row.email !== args.p_owner_email || row.key !== args.p_key)) return { data: null, error: { message: "slug already in use" } };
      if (!row && (!args.p_key || args.p_key.length < 8 || args.p_key.length > 128)) return { data: null, error: { message: "provisioning key must be 8 to 128 characters" } };
      if (!row) { row = { tenant_id: "t-" + args.p_slug, invite_id: "i-" + args.p_slug, token: "tok-" + args.p_slug, email: args.p_owner_email, key: args.p_key, accepted: false }; tenants.set(args.p_slug, row); created = true; }
      if (state.loseNext) { state.loseNext = false; return { data: null, error: { message: "connection lost" } }; } // committed, response lost
      return { data: { ...row, created }, error: null };
    },
  };
  return { client, state, tenants };
}
function mailer({ fail = false } = {}) {
  const sent = [];
  return { sent, send: async (m) => { sent.push(m); if (fail) throw new Error("smtp down"); return true; } };
}
const input = { name: "Harbor Bar", slug: "Harbor-Bar", ownerEmail: "Owner@Example.com", idempotencyKey: "test-key-harbor" };

test("staff provisions: tenant+invite via one RPC, invite mailed after commit with the accept link", async () => {
  const db = fakeDb(), mail = mailer();
  const r = await provisionTenant(db.client, mail.send, input, ORIGIN);
  assert.deepEqual(r, { ok: true, tenantId: "t-harbor-bar", inviteId: "i-harbor-bar", created: true, accepted: false, emailSent: true });
  assert.equal(db.state.rpcCalls, 1);
  assert.deepEqual(mail.sent, [{ to: "owner@example.com", tenantName: "Harbor Bar", link: `${ORIGIN}/client/invite/tok-harbor-bar` }]);
});

test("P7: lost response then retry is safe: same tenant and invite, nothing deleted, no duplicate", async () => {
  const db = fakeDb({ loseFirstResponse: true }), mail = mailer();
  const first = await provisionTenant(db.client, mail.send, input, ORIGIN);
  assert.equal(first.ok, false); assert.equal(first.status, 500); assert.match(first.error, /safe to retry/);
  assert.equal(mail.sent.length, 0, "no email for an unknown outcome");
  assert.equal(db.tenants.size, 1, "the tenant did commit");
  const retry = await provisionTenant(db.client, mail.send, input, ORIGIN);
  assert.deepEqual(retry, { ok: true, tenantId: "t-harbor-bar", inviteId: "i-harbor-bar", created: false, accepted: false, emailSent: true });
  assert.equal(db.tenants.size, 1);
  assert.equal(db.state.deletes, 0); assert.equal(db.state.authUsersCreated, 0);
});

test("email failure after commit: tenant and invite stand, no compensation; a repeat resends", async () => {
  const db = fakeDb(), bad = mailer({ fail: true });
  const r = await provisionTenant(db.client, bad.send, input, ORIGIN);
  assert.equal(r.ok, true); assert.equal(r.emailSent, false); assert.equal(r.created, true);
  assert.equal(db.tenants.size, 1);
  const good = mailer();
  const again = await provisionTenant(db.client, good.send, input, ORIGIN);
  assert.equal(again.ok, true); assert.equal(again.emailSent, true); assert.equal(again.created, false);
  assert.equal(good.sent.length, 1);
});

test("an accepted invite is not mailed again", async () => {
  const db = fakeDb(), mail = mailer();
  await provisionTenant(db.client, mail.send, input, ORIGIN);
  db.tenants.get("harbor-bar").accepted = true;
  const r = await provisionTenant(db.client, mail.send, input, ORIGIN);
  assert.equal(r.ok && r.accepted, true); assert.equal(mail.sent.length, 1);
});

test("non-staff refused with 403, nothing mailed", async () => {
  const db = fakeDb({ staff: false }), mail = mailer();
  const r = await provisionTenant(db.client, mail.send, input, ORIGIN);
  assert.equal(r.ok, false); assert.equal(r.status, 403); assert.equal(mail.sent.length, 0);
});

test("duplicate slug with a different owner is 409, nothing mailed", async () => {
  const db = fakeDb(), mail = mailer();
  await provisionTenant(db.client, mail.send, input, ORIGIN);
  const r = await provisionTenant(db.client, mail.send, { ...input, ownerEmail: "someone@else.test" }, ORIGIN);
  assert.equal(r.ok, false); assert.equal(r.status, 409); assert.equal(mail.sent.length, 1);
});

test("same slug with another or missing request key is refused", async () => {
  const db = fakeDb(), mail = mailer();
  await provisionTenant(db.client, mail.send, input, ORIGIN);
  assert.equal((await provisionTenant(db.client, mail.send, { ...input, idempotencyKey: "another-key" }, ORIGIN)).status, 409);
  assert.equal((await provisionTenant(db.client, mail.send, { ...input, idempotencyKey: undefined }, ORIGIN)).status, 409);
});

test("bad input is rejected before touching the database", async () => {
  const db = fakeDb(), mail = mailer();
  for (const bad of [{ ...input, slug: "Bad Slug!" }, { ...input, ownerEmail: "nope" }, { ...input, name: "x" }]) {
    assert.equal((await provisionTenant(db.client, mail.send, bad, ORIGIN)).status, 400);
  }
  assert.equal(db.state.rpcCalls, 0);
});

test("provision.ts carries no consent heuristic, auth-user creation or delete", () => {
  const src = readFileSync(path.join(here, "../provision.ts"), "utf8").replace(/\/\/.*$/gm, "");
  for (const word of ["invited_at", "last_sign_in_at", "inviteUserByEmail", "deleteUser", "createUser", "listUsers", "service"]) assert.ok(!src.includes(word), word);
});

// ---- integration: the real migration SQL + the live accept_invite against a throwaway local Postgres, with prod's RLS mirrored ----
const hasPg = spawnSync("which", ["initdb"]).status === 0;
test("database: provisioning, acceptance, idempotency, refusals, and tenant isolation", { skip: !hasPg && "no local postgres" }, () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bar7pg-"));
  const port = String(55000 + Math.floor(Math.random() * 4000));
  const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", ...opts });
  try {
    sh("initdb", ["-D", dir, "-A", "trust", "-U", "postgres"], { stdio: "pipe" });
    sh("pg_ctl", ["-D", dir, "-o", `-p ${port} -k ${dir}`, "-l", path.join(dir, "log"), "-w", "start"], { stdio: "pipe" });
    const psql = (file) => spawnSync("psql", ["-h", dir, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=0", "-At", "-f", file], { encoding: "utf8" });
    const fx = readFileSync(path.join(here, "provision.fixture.sql"), "utf8").split("-- SCENARIOS");
    const migrations = ["20261003_staff_provision_tenant.sql", "20261004_codex_round4_roles_and_provisioning.sql"]
      .map((f) => readFileSync(path.join(here, "../../../supabase/loveleeday", f), "utf8")).join("\n");
    const full = path.join(dir, "run.sql");
    writeFileSync(full, fx[0] + "\n" + migrations + "\n-- SCENARIOS" + fx[1]);
    const out = psql(full);
    const lines = out.stdout.split("\n").filter((l) => l.startsWith("RESULT|"));
    const get = (k) => lines.find((l) => l.startsWith(`RESULT|${k}|`))?.split("|").slice(2).join("|");
    const ctx = out.stderr;
    // new-account owner: tenant + invite + audit, no membership and no auth user until the owner accepts
    assert.equal(get("first_created"), "true", ctx);
    assert.equal(get("tenant_row"), "1");
    assert.equal(get("invite_row"), "owner|newowner@x.test|true");
    assert.equal(get("memberships_created"), "0");
    assert.equal(get("auth_users_created"), "0");
    assert.equal(get("audit_row"), "tenant.provisioned|false", "audit row exists and never carries the token");
    // lost response + retry
    assert.equal(get("retry_same_invite"), "true|true|created=false");
    assert.equal(get("after_retry_counts"), "1|1|1");
    // new-account owner accepts and becomes owner
    assert.equal(get("new_accept"), "accepted", ctx);
    assert.equal(get("new_owner_role"), "owner|true");
    assert.equal(get("retry_after_accept"), "true|created=false");
    // existing-account owner accepts (no membership before, owner after)
    assert.equal(get("existing_before_accept"), "0");
    assert.equal(get("existing_accept"), "accepted", ctx);
    assert.equal(get("existing_owner_role"), "owner");
    // P9: a fresh invited_at is not consent; the wrong account cannot use the token
    assert.equal(get("fresh_invited_membership"), "0");
    assert.equal(get("wrong_account"), "refused:this invite was sent to a different email address");
    // refusals
    assert.equal(get("nonstaff"), "refused:staff only");
    assert.equal(get("weak_session"), "refused:staff only");
    assert.equal(get("dup_slug_other_owner"), "refused:slug already in use");
    assert.equal(get("dup_slug_preexisting"), "refused:slug already in use");
    assert.equal(get("bad_slug"), "refused:slug must be 3 to 40 lowercase letters, digits or hyphens");
    assert.equal(get("bad_email"), "refused:owner email is not valid");
    assert.equal(get("refused_created_nothing"), "0");
    assert.equal(get("anon_exec"), "false");
    assert.equal(get("renewed"), "true|true");
    assert.equal(get("upgrade_role"), "owner|member|owner", ctx);
    assert.equal(get("retain_role"), "owner|true|owner|owner", ctx);
    assert.equal(get("wrong_key"), "refused:slug already in use");
    assert.equal(get("missing_key"), "refused:provisioning key must be 8 to 128 characters");
    // round 4 (P16-P18)
    assert.equal(get("r4_roles"), "admin,owner,owner,member", ctx);
    assert.equal(get("r4_unknown_role"), "refused:invite carries an unknown role");
    assert.equal(get("r4_weird_invite_unconsumed"), "true");
    assert.equal(get("r4_rank"), "1234null");
    assert.equal(get("r4_other_staff_replay"), "refused:slug already in use");
    assert.equal(get("r4_key_reuse"), "refused:provisioning key already used for another business");
    assert.equal(get("r4_key_reuse_created_nothing"), "0");
    assert.equal(get("r4_no_plaintext_key"), "0");
    assert.equal(get("r4_digest_shape"), "true|true");
    assert.equal(get("r4_retry_exact_invite"), "true|true|false");
    assert.equal(get("r4_renewed_audit"), "2");
    // isolation
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
