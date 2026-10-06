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
        const f = { id: null, inCol: null, nulls: [] };
        const chain = {
          eq: (c, v) => { f.id = v; return chain; },
          in: (c, v) => { f.inCol = [c, v]; return chain; },
          is: (c) => { f.nulls.push(c); return chain; },
          select: () => chain,
          then: (res, rej) => {
            const r = db.row;
            let hit = r.id === f.id;
            if (f.inCol) hit &&= f.inCol[1].includes(r[f.inCol[0]]);
            for (const n of f.nulls) hit &&= r[n] == null;
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
