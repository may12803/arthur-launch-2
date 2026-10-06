// Run: npm test. One email per key per hour; every occurrence is logged; a failed email never throws.
import test from "node:test";
import assert from "node:assert/strict";
import { opsAlert, resetOpsAlertsForTests } from "../alert.ts";

test("first alert emails, repeats inside the hour only log, a new hour emails again", async () => {
  resetOpsAlertsForTests();
  const sent = [];
  const send = async (to, subject, lines) => { sent.push({ to, subject, lines }); return true; };
  const t = 1_000_000;
  assert.equal(await opsAlert("k", "m", { a: 1 }, send, t), "emailed");
  assert.equal(await opsAlert("k", "m", {}, send, t + 10 * 60_000), "logged");
  assert.equal(await opsAlert("other", "m", {}, send, t + 10 * 60_000), "emailed", "keys are independent");
  assert.equal(await opsAlert("k", "m", {}, send, t + 61 * 60_000), "emailed");
  assert.equal(sent.length, 3);
  assert.match(sent[0].subject, /Portal alert: k/);
});

test("a failing mailer degrades to a log, never an exception", async () => {
  resetOpsAlertsForTests();
  assert.equal(await opsAlert("x", "m", {}, async () => { throw new Error("smtp down"); }), "logged");
});
