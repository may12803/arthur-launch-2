import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clientMfaVerdict, adminMfaVerdict } from "../mfa-gate.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const aal2 = { currentLevel: "aal2", nextLevel: "aal2" };

test("client: an assurance error or empty answer is unavailable, never ok (finding 1)", () => {
  assert.equal(clientMfaVerdict(null, { message: "down" }, false), "unavailable");
  assert.equal(clientMfaVerdict(null, null, false), "unavailable");
  assert.equal(clientMfaVerdict(aal2, { message: "x" }, true), "unavailable");
});

test("client: normal outcomes still route to challenge, enroll or ok; SSO passes on a good answer", () => {
  assert.equal(clientMfaVerdict({ currentLevel: "aal1", nextLevel: "aal2" }, null, false), "challenge");
  assert.equal(clientMfaVerdict({ currentLevel: "aal1", nextLevel: "aal1" }, null, false), "enroll");
  assert.equal(clientMfaVerdict(aal2, null, false), "ok");
  assert.equal(clientMfaVerdict({ currentLevel: "aal1", nextLevel: "aal1" }, null, true), "ok");
});

test("client: requireStrongSession uses the verdict and sends 'unavailable' to sign-in", () => {
  const src = readFileSync(path.join(root, "lib/client-portal/session.ts"), "utf8");
  assert.match(src, /clientMfaVerdict\(/);
  assert.match(src, /unavailable"\) redirect\("\/client\/login/);
});

const base = { requireMfa: false, configured: true, hasAuthCookie: true, user: { id: "u" }, aal: aal2 };

test("admin: AAL error with a live auth session denies (finding 2)", () => {
  assert.deepEqual(adminMfaVerdict({ ...base, aal: null, aalError: { message: "x" } }), { kind: "deny" });
  assert.deepEqual(adminMfaVerdict({ ...base, aal: null }), { kind: "deny" });
});

test("admin: exception denies when a session requires MFA, passes only when nothing could require it", () => {
  assert.deepEqual(adminMfaVerdict({ ...base, threw: true }), { kind: "deny" });
  assert.deepEqual(adminMfaVerdict({ ...base, threw: true, hasAuthCookie: false, user: null }), { kind: "pass" });
  assert.deepEqual(adminMfaVerdict({ ...base, threw: true, hasAuthCookie: false, requireMfa: true }), { kind: "deny" });
});

test("admin: missing Supabase config denies when MFA is mandatory", () => {
  assert.deepEqual(adminMfaVerdict({ ...base, configured: false, requireMfa: true }), { kind: "deny" });
  assert.deepEqual(adminMfaVerdict({ ...base, configured: false }), { kind: "pass" });
});

test("admin: a transient auth fault is not 'no session' when auth cookies are present", () => {
  assert.deepEqual(adminMfaVerdict({ ...base, user: null, userError: { status: 503 } }), { kind: "deny" });
  assert.deepEqual(adminMfaVerdict({ ...base, user: null, userError: { message: "Auth session missing!", status: 400 } }), { kind: "pass" });
});

test("admin: challenge, enroll and pass behave as before", () => {
  assert.deepEqual(adminMfaVerdict({ ...base, aal: { currentLevel: "aal1", nextLevel: "aal2" } }), { kind: "redirect", to: "/mfa/challenge" });
  assert.deepEqual(adminMfaVerdict({ ...base, requireMfa: true, aal: { currentLevel: "aal1", nextLevel: "aal1" } }), { kind: "redirect", to: "/settings/security?enroll=1" });
  assert.deepEqual(adminMfaVerdict({ ...base, aal: { currentLevel: "aal1", nextLevel: "aal1" } }), { kind: "pass" });
  assert.deepEqual(adminMfaVerdict(base), { kind: "pass" });
});

test("middleware: wired to the verdict, MFA recovery pages stay exempt, no silent null returns remain", () => {
  const src = readFileSync(path.join(root, "middleware.ts"), "utf8");
  assert.match(src, /adminMfaVerdict\(/);
  assert.match(src, /MFA_EXEMPT_PATHS = \["\/mfa\/challenge", "\/settings\/security", "\/api\/logout"\]/);
  assert.doesNotMatch(src, /Fails open/);
});
