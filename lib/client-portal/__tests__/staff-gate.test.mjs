import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { staffGate, signedInGate, UUID_RE } from "../staff-gate.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const client = ({ user, isStaff, rpcError }) => ({
  auth: { getUser: async () => ({ data: { user } }) },
  rpc: async (fn) => { assert.equal(fn, "is_staff"); return { data: isStaff, error: rpcError ?? null }; },
});

test("anonymous caller gets 401 and never reaches the staff RPC", async () => {
  const c = client({ user: null });
  c.rpc = async () => { throw new Error("rpc must not run for an anonymous caller"); };
  assert.deepEqual(await staffGate(c), { ok: false, status: 401, error: "Not signed in." });
});

test("signed-in viewer, member or owner who is not staff gets 403", async () => {
  for (const who of ["viewer", "member", "owner"]) {
    const r = await staffGate(client({ user: { id: who }, isStaff: false }));
    assert.equal(r.ok, false); assert.equal(r.status, 403);
  }
});

test("an is_staff error is a 403, never a 500", async () => {
  const r = await staffGate(client({ user: { id: "x" }, isStaff: null, rpcError: { message: "boom" } }));
  assert.equal(r.ok, false); assert.equal(r.status, 403);
});

test("staff passes the gate; signedInGate needs only a session", async () => {
  assert.deepEqual(await staffGate(client({ user: { id: "s" }, isStaff: true })), { ok: true });
  assert.deepEqual(await signedInGate(client({ user: { id: "m" } })), { ok: true });
  assert.equal((await signedInGate(client({ user: null }))).status, 401);
});

test("uuid check rejects the empty payload that used to crash the RPC", () => {
  assert.ok(!UUID_RE.test("")); assert.ok(UUID_RE.test("aaaaaaaa-0000-4000-8000-00000000000a"));
});

test("the route runs the gate before parsing the body in POST, PATCH and DELETE", () => {
  const src = readFileSync(path.join(here, "../../../app/api/client/staff/route.ts"), "utf8");
  for (const m of ["POST", "PATCH", "DELETE"]) {
    const fn = src.slice(src.indexOf(`export async function ${m}`));
    const gate = fn.search(/staffGate\(|signedInGate\(/), rpc = fn.search(/supabase\.rpc\(/);
    assert.ok(gate > 0 && gate < rpc, `${m}: gate precedes the first RPC`);
  }
});
