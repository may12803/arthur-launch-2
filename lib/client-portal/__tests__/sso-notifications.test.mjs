import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ssoRequiredForMe, tenantSessionAllowed } from "../sso.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = (file) => readFileSync(path.join(root, file), "utf8");

test("the SSO check runs after the password sign-in, on the account's own memberships, and signs out when required", async () => {
  let call;
  const client = { rpc: async (name, args) => { call = { name, args }; return { data: true, error: null }; } };
  assert.equal(await ssoRequiredForMe(client), true);
  assert.deepEqual(call, { name: "sso_required_for_me", args: undefined });
  const login = source("app/client/login/page.tsx");
  assert.match(login, /signInWithPassword[\s\S]*ssoRequiredForMe\(loveleeday\)[\s\S]*signOut\(\)[\s\S]*Your company signs in with single sign-on\./);
  assert.doesNotMatch(login, /sso_required_for_email|passwordSignInAllowed/, "no anonymous domain lookup before sign-in");
});

test("the SSO check fails closed on errors", async () => {
  assert.equal(await ssoRequiredForMe({ rpc: async () => ({ data: false, error: null }) }), false);
  await assert.rejects(ssoRequiredForMe({ rpc: async () => ({ data: null, error: new Error("offline") }) }), /could not be checked/);
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
  assert.match(sql, /create or replace function public\.is_tenant_member[\s\S]*not private\.sso_blocks\(p_tenant\)/);
  assert.match(sql, /drop function if exists public\.sso_required_for_email/);
  assert.match(sql, /if not public\.is_tenant_member\(p_tenant\) then raise exception 'not allowed'/);
  assert.match(sql, /user_id = \(select auth\.uid\(\)\) and public\.is_tenant_member\(tenant_id\)/);
});
