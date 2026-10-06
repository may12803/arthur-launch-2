import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claimApproval, releaseApproval, approvalIdempotencyKey } from "../../email/approval-claim.ts";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// In-memory table whose conditional update is atomic, like a single SQL UPDATE ... WHERE ... RETURNING.
function fakeDb(row) {
  const db = {
    row,
    from: () => ({
      update: (patch) => {
        const f = { eqs: [], inCol: null, nulls: [], lts: [] };
        const chain = {
          eq: (c, v) => { f.eqs.push([c, v]); return chain; },
          in: (c, v) => { f.inCol = [c, v]; return chain; },
          is: (c) => { f.nulls.push(c); return chain; },
          lt: (c, v) => { f.lts.push([c, v]); return chain; },
          select: () => chain,
          then: (res, rej) => {
            const r = db.row;
            let hit = true;
            for (const [c, v] of f.eqs) hit &&= r[c] === v;
            if (f.inCol) hit &&= f.inCol[1].includes(r[f.inCol[0]]);
            for (const n of f.nulls) hit &&= r[n] == null;
            for (const [c, v] of f.lts) hit &&= r[c] != null && r[c] < v;
            if (hit) Object.assign(r, patch);
            return Promise.resolve({ data: hit ? [{ id: r.id }] : [], error: null }).then(res, rej);
          },
        };
        return chain;
      },
    }),
  };
  return db;
}

test("two concurrent approvals: exactly one claims, so exactly one email is sent (finding 3)", async () => {
  const db = fakeDb({ id: "a1", status: "pending", approved_at: null });
  const results = await Promise.all([claimApproval(db, "a1"), claimApproval(db, "a1"), claimApproval(db, "a1")]);
  assert.equal(results.filter(Boolean).length, 1);
});

test("a sent approval cannot be claimed again; a failed one can after release", async () => {
  const db = fakeDb({ id: "a2", status: "sent", approved_at: "2026-10-05T00:00:00Z" });
  assert.equal(await claimApproval(db, "a2"), false);
  const db2 = fakeDb({ id: "a3", status: "edited", approved_at: null });
  assert.equal(await claimApproval(db2, "a3"), true);
  assert.equal(await claimApproval(db2, "a3"), false);
  await releaseApproval(db2, "a3", "boom");
  assert.equal(db2.row.status, "failed");
  assert.equal(await claimApproval(db2, "a3"), true);
});

test("a claim left by a crashed send expires after the lease; a live claim does not", async () => {
  const t0 = "2026-10-06T10:00:00.000Z";
  const db = fakeDb({ id: "a3", status: "pending", approved_at: null });
  assert.equal(await claimApproval(db, "a3", t0), true);
  assert.equal(await claimApproval(db, "a3", "2026-10-06T10:05:00.000Z"), false, "still inside the lease");
  const later = "2026-10-06T10:16:00.000Z";
  const takeovers = await Promise.all([claimApproval(db, "a3", later), claimApproval(db, "a3", later)]);
  assert.deepEqual(takeovers.filter(Boolean).length, 1, "exactly one request takes over the expired claim");
  assert.equal(db.row.approved_at, later);
  const sent = fakeDb({ id: "a4", status: "sent", approved_at: t0, approved_by: "daniel" });
  assert.equal(await claimApproval(sent, "a4", later), false, "a sent approval is never reclaimed");
});

test("idempotency key is stable for the same content and changes when the body is edited", () => {
  const k = approvalIdempotencyKey("a1", "x@y.com", "Hi", "body");
  assert.equal(k, approvalIdempotencyKey("a1", "x@y.com", "Hi", "body"));
  assert.notEqual(k, approvalIdempotencyKey("a1", "x@y.com", "Hi", "body edited"));
  assert.match(k, /^approval-a1-[0-9a-f]{16}$/);
});

test("the route claims before it sends and passes the idempotency key to Resend", () => {
  const src = readFileSync(path.join(root, "app/api/email/approve/route.ts"), "utf8");
  const claim = src.indexOf("claimApproval(");
  const send = src.indexOf("resend.emails.send(");
  assert.ok(claim > 0 && send > claim, "claim precedes send");
  assert.match(src, /idempotencyKey: approvalIdempotencyKey\(/);
});
