// Run: npm test. The screen's offered actions must match what the membership RPCs allow (86_membership_lifecycle.sql).
import test from "node:test";
import assert from "node:assert/strict";
import { allowedActions, inviteEmail, teamErrorMessage, ROLE_HELP } from "../team.ts";
import { ROLE_ORDER } from "../roles.ts";

const row = (userId, role, accepted = true) => ({ userId, membershipId: "m-" + userId, role, accepted });

test("owner can change, remove and promote anyone but themselves", () => {
  const owner = { userId: "o", role: "owner" };
  assert.deepEqual(allowedActions(owner, row("a", "admin")), { changeRole: true, remove: true, makeOwner: true });
  assert.deepEqual(allowedActions(owner, row("o", "owner")), { changeRole: false, remove: false, makeOwner: false });
  assert.equal(allowedActions(owner, row("p", "member", false)).makeOwner, false, "pending people cannot become owner");
});

test("admin manages members and viewers, never the owner or another admin", () => {
  const admin = { userId: "a", role: "admin" };
  assert.deepEqual(allowedActions(admin, row("m", "member")), { changeRole: true, remove: true, makeOwner: false });
  assert.deepEqual(allowedActions(admin, row("a2", "admin")), { changeRole: false, remove: false, makeOwner: false });
  assert.deepEqual(allowedActions(admin, row("o", "owner")), { changeRole: false, remove: false, makeOwner: false });
  assert.deepEqual(allowedActions(admin, row("a", "admin")), { changeRole: false, remove: true, makeOwner: false }, "an admin can leave");
});

test("members and viewers can only leave", () => {
  for (const role of ["member", "viewer"]) {
    const me = { userId: "me", role };
    assert.deepEqual(allowedActions(me, row("x", "viewer")), { changeRole: false, remove: false, makeOwner: false });
    assert.deepEqual(allowedActions(me, row("me", role)), { changeRole: false, remove: true, makeOwner: false });
  }
});

test("every role has help text and RPC errors become plain sentences", () => {
  for (const r of ROLE_ORDER) assert.ok(ROLE_HELP[r]?.length > 20, r);
  assert.match(teamErrorMessage("only the owner can change another admin's role"), /Only the owner/);
  assert.match(teamErrorMessage("two-factor sign-in required"), /two-factor/);
  assert.match(teamErrorMessage("duplicate key violates something"), /didn't go through/, "raw database text never reaches the screen");
});

test("invite email names the company, role and link", () => {
  const m = inviteEmail("Northside Charter", "viewer", "https://portal.example.test/client/invite/tok");
  assert.match(m.subject, /Northside Charter/);
  assert.ok(m.lines.some((l) => /as a viewer/.test(l)));
  assert.ok(m.lines.some((l) => l.includes("https://portal.example.test/client/invite/tok")));
  assert.ok(inviteEmail("X", "admin", "https://x").lines[0].includes("an admin"));
});
