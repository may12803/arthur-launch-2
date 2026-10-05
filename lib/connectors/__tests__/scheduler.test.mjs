import test from "node:test";
import assert from "node:assert/strict";
import { startScheduler, JOBS } from "../scheduler.ts";

test("scheduler is off without a secret or when disabled", () => {
  assert.equal(startScheduler({}), null);
  assert.equal(startScheduler({ LOVELEEDAY_CONNECTORS_SERVER_SECRET: "x", DISABLE_CONNECTOR_SCHEDULER: "1" }), null);
});

test("schedule: sync hourly, webhooks every five minutes", () => {
  const by = Object.fromEntries(JOBS.map((j) => [j.path, j.everyMs]));
  assert.equal(by["/api/cron/sync"], 3600000);
  assert.equal(by["/api/cron/webhooks"], 300000);
});

test("scheduler starts and stops cleanly", () => {
  const stop = startScheduler({ LOVELEEDAY_CONNECTORS_SERVER_SECRET: "x" }, async () => new Response("{}"));
  assert.equal(typeof stop, "function");
  stop();
});
