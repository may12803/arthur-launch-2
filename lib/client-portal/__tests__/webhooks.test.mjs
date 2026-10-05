import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { signature, deliverWebhook, BACKOFF_SECONDS } from "../webhooks.ts";

const payload = { id: "evt-1", type: "record.ingested", tenant: "tenant-a", created_at: "2026-10-05T00:00:00Z", data: { object: "invoice" } };
const base = { id: "delivery-1", url: "https://hooks.example.test/events", secret: "signing-secret", payload, attempt: 1 };
const resolve = async () => ["8.8.8.8"];
const recorded = [];
const store = { record: async (_id, result) => { recorded.push(result); } };

test("documented signature verifies exact body and rejects changed body", () => {
  const body = JSON.stringify(payload), t = 100;
  const expected = createHmac("sha256", base.secret).update(`${t}.${body}`).digest("hex");
  assert.equal(signature(base.secret, body, t), `t=${t},v1=${expected}`);
  assert.notEqual(signature(base.secret, body + " ", t), `t=${t},v1=${expected}`);
});

test("private URL is refused at send time", async () => {
  let sent = false;
  const result = await deliverWebhook({ ...base, url: "https://127.0.0.1/hook" }, store, { fetch: async () => { sent = true; return new Response(); } });
  assert.equal(sent, false);
  assert.equal(result.status, "retry");
});

test("backoff and delivery outcomes", async () => {
  assert.deepEqual(BACKOFF_SECONDS, [60, 300, 1800, 7200, 43200]);
  const now = new Date("2026-10-05T00:00:00Z");
  const fetch = async () => new Response(null, { status: 204 });
  assert.equal((await deliverWebhook(base, store, { fetch, resolve, now, testOnlyAllowUnpinnedFetch: true })).status, "delivered");
  const retry = await deliverWebhook(base, store, { fetch: async () => new Response("", { status: 500 }), resolve, now, testOnlyAllowUnpinnedFetch: true });
  assert.equal(retry.status, "retry");
  assert.equal(retry.next_at, "2026-10-05T00:01:00.000Z");
  const final = await deliverWebhook({ ...base, attempt: 6 }, store, { fetch: async () => new Response("", { status: 500 }), resolve, now, testOnlyAllowUnpinnedFetch: true });
  assert.equal(final.status, "failed");
  assert.equal(recorded.at(-1).status, "failed");
});

test("webhook redirects are recorded as failed attempts without sending the signature onward", async () => {
  let calls = 0;
  const result = await deliverWebhook(base, store, { resolve, testOnlyAllowUnpinnedFetch: true, fetch: async () => { calls++; return new Response(null, { status: 302, headers: { location: "https://other.example.test/collect" } }); } });
  assert.equal(calls, 1);
  assert.equal(result.response_code, 302);
  assert.equal(result.status, "retry");
});

test("webhook timeout ends a stalled native connection in ten seconds", async () => {
  const stalledFetch = (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true }));
  const started = Date.now();
  const result = await deliverWebhook(base, store, { resolve, fetch: stalledFetch, testOnlyAllowUnpinnedFetch: true });
  const elapsed = Date.now() - started;
  assert.equal(result.status, "retry");
  assert.equal(result.response_code, null);
  assert.ok(elapsed >= 9500 && elapsed < 12000, `elapsed ${elapsed}ms`);
});
