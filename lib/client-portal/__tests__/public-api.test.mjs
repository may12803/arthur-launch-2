import { test } from "node:test";
import assert from "node:assert/strict";
import { handlePublicApi, nextCursor, resetRateLimits } from "../public-api.ts";

const request = (path = "/api/v1/records", key = "lld_valid") => new Request(`https://portal.example${path}`, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
const rpc = async (name, args) => {
  if (name === "api_key_verify") return { data: args.p_key === "lld_revoked" ? [] : [{ key_id: "key-a", tenant_id: "tenant-a", scopes: ["records:read"] }], error: null };
  assert.equal(args.p_tenant, "tenant-a");
  return { data: Array.from({ length: 101 }, (_, i) => ({ seq: (args.p_after ?? 0) + i + 1, tenant_id: args.p_tenant })), error: null };
};

test("missing and revoked keys return 401; wrong scope returns 403", async () => {
  resetRateLimits();
  assert.equal((await handlePublicApi(request(undefined, ""), "records", rpc, "secret")).status, 401);
  assert.equal((await handlePublicApi(request(undefined, "lld_revoked"), "records", rpc, "secret")).status, 401);
  assert.equal((await handlePublicApi(request(), "approvals", rpc, "secret")).status, 403);
});

test("tenant is taken from the verified key and cursor round-trips", async () => {
  resetRateLimits();
  const first = await (await handlePublicApi(request("/api/v1/records?tenant=tenant-b"), "records", rpc, "secret")).json();
  assert.equal(first.data.length, 100);
  assert.equal(first.data[0].tenant_id, "tenant-a");
  assert.equal(first.next_cursor, nextCursor(100));
  const second = await (await handlePublicApi(request(`/api/v1/records?after=${first.next_cursor}`), "records", rpc, "secret")).json();
  assert.equal(second.data[0].seq, 101);
});

test("rate limit rejects request 61 with Retry-After", async () => {
  resetRateLimits();
  for (let i = 0; i < 60; i++) assert.equal((await handlePublicApi(request(), "records", rpc, "secret", 1000)).status, 200);
  const limited = await handlePublicApi(request(), "records", rpc, "secret", 1000);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "1");
});
