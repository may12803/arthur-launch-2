import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { passwordSignInAllowed, tenantSessionAllowed } from "../sso.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = (file) => readFileSync(path.join(root, file), "utf8");

test("password sign-in checks the email policy and refuses an enforced domain", async () => {
  let call;
  const client = { rpc: async (name, args) => { call = { name, args }; return { data: true, error: null }; } };
  assert.equal(await passwordSignInAllowed(client, "person@company.example"), false);
  assert.deepEqual(call, { name: "sso_required_for_email", args: { p_email: "person@company.example" } });
  assert.match(source("app/client/login/page.tsx"), /passwordSignInAllowed\(loveleeday, email\)[\s\S]*signInWithPassword/);
  assert.match(source("app/client/login/page.tsx"), /Your company signs in with single sign-on\./);
});

test("password sign-in allows an unenforced domain and fails closed on lookup errors", async () => {
  assert.equal(await passwordSignInAllowed({ rpc: async () => ({ data: false, error: null }) }, "person@other.example"), true);
  await assert.rejects(passwordSignInAllowed({ rpc: async () => ({ data: null, error: new Error("offline") }) }, "person@company.example"), /could not be checked/);
});

test("both portal gates require the database session decision", async () => {
  const client = { rpc: async (name, args) => {
    assert.equal(name, "sso_session_allowed");
    assert.deepEqual(args, { p_tenant: "tenant-a" });
    return { data: false, error: null };
  } };
  assert.equal(await tenantSessionAllowed(client, "tenant-a"), false);
  assert.equal(await tenantSessionAllowed({ rpc: async () => ({ data: true, error: null }) }, "tenant-a"), true);
  assert.match(source("lib/client-portal/session.ts"), /tenantSessionAllowed\(supabase, r\.tenantId\)/);
  assert.match(source("lib/client-portal/api.ts"), /tenantSessionAllowed\(supabase, r\.tenantId\)/);
});

test("fixture uses NetSuite objects and a month-first written date", () => {
  const fixture = source("app/client/dev-preview/[page]/page.tsx");
  assert.match(fixture, /object: \["vendorBill", "invoice", "journalEntry"\]/);
  assert.doesNotMatch(fixture, /object: \["Tenant ledger"/);
  assert.match(fixture, /Sends Oct 8, 2026/);
  assert.doesNotMatch(fixture, /Sends 8 Oct/);
});

test("status shows the preference form and trust list has a source date", () => {
  assert.match(source("app/client/(portal)/status/page.tsx"), /<NotificationForm/);
  assert.match(source("app/client/(portal)/status/notification-form.tsx"), /notification_prefs_set/);
  const trust = source("app/trust/trust-view.tsx");
  assert.match(trust, /List derived from the platform&apos;s code on 2026-10-05/);
  assert.doesNotMatch(trust, /n: "Anthropic"/);
});

test("database migration keeps the SSO and preference authorization guards", () => {
  const sql = source("supabase/loveleeday/20261005_13_notifications_and_sso.sql");
  assert.match(sql, /s\.sso_enforced and m\.user_id = auth\.uid\(\) and m\.accepted_at is not null/);
  assert.match(sql, /not private\.sso_required\(p_tenant\) or exists/);
  assert.match(sql, /a ->> 'method' = 'sso\/saml'/);
  assert.match(sql, /where s\.sso_enforced and lower\(split_part/);
  assert.match(sql, /if not public\.is_tenant_member\(p_tenant\) then raise exception 'not allowed'/);
  assert.match(sql, /user_id = \(select auth\.uid\(\)\) and public\.is_tenant_member\(tenant_id\)/);
});
