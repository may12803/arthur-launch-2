// Run: npm test. The home checklist offers only links the role can use and closes steps from real counts.
import test from "node:test";
import assert from "node:assert/strict";
import { activationSteps } from "../activation.ts";

const zero = { connections: 0, uploads: 0, documents: 0, teammates: 1, approvals: 0 };

test("a new owner sees four open steps, each linked", () => {
  const s = activationSteps(zero, "owner");
  assert.equal(s.length, 4);
  assert.ok(s.every((x) => !x.done && x.href));
});

test("an upload counts as a first source; a second member closes the team step", () => {
  const s = activationSteps({ ...zero, uploads: 1, teammates: 2 }, "admin");
  assert.equal(s.find((x) => x.key === "source").done, true);
  assert.equal(s.find((x) => x.key === "team").done, true);
});

test("a viewer is never sent to a page that would refuse them", () => {
  const s = activationSteps(zero, "viewer");
  for (const k of ["source", "documents", "team"]) assert.equal(s.find((x) => x.key === k).href, null, k);
  assert.match(s.find((x) => x.key === "source").body, /owner or admin/);
});
