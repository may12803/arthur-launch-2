// Single-use claim on a pending email approval. The claim is ONE conditional UPDATE ... WHERE (not yet sent AND not
// already claimed) ... RETURNING, so of any number of concurrent approvals exactly one gets a row back and may send.
// It reuses approved_at as the claim marker rather than introducing a new status value, so no schema change is needed:
// approved_at is only ever set by a claim or by the final "sent" write, and a failed send releases it.
import { createHash } from "node:crypto";

type Chain = {
  eq(col: string, v: unknown): Chain;
  in(col: string, v: unknown[]): Chain;
  is(col: string, v: null): Chain;
  lt(col: string, v: unknown): Chain;
  select(cols: string): Chain;
  then: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>["then"];
};
export interface ApprovalDb {
  from(table: string): { update(patch: Record<string, unknown>): Chain };
}

export const CLAIMABLE_STATUSES = ["pending", "edited", "failed"];

// A claim is a lease. A process that crashed mid-send never releases it, so after CLAIM_LEASE_MS another request may
// take it over. That retry is safe to send: approvalIdempotencyKey() makes Resend drop a duplicate of the same content.
export const CLAIM_LEASE_MS = 15 * 60 * 1000;

/** True when this caller now owns the send. False when it was already sent or another request holds a live claim. */
export async function claimApproval(db: ApprovalDb, approvalId: string, now = new Date().toISOString()): Promise<boolean> {
  const res = await db
    .from("arthur_email_approvals")
    .update({ approved_at: now, approved_by: "claiming" })
    .eq("id", approvalId)
    .in("status", CLAIMABLE_STATUSES)
    .is("approved_at", null)
    .select("id");
  if (res.error) throw new Error(`approval claim failed: ${res.error.message}`);
  if ((res.data?.length ?? 0) === 1) return true;
  // Take over a claim whose holder stopped without sending or releasing. Still one conditional UPDATE, so of several
  // concurrent takeovers exactly one matches the old approved_at.
  const staleBefore = new Date(new Date(now).getTime() - CLAIM_LEASE_MS).toISOString();
  const stale = await db
    .from("arthur_email_approvals")
    .update({ approved_at: now, approved_by: "claiming" })
    .eq("id", approvalId)
    .in("status", CLAIMABLE_STATUSES)
    .eq("approved_by", "claiming")
    .lt("approved_at", staleBefore)
    .select("id");
  if (stale.error) throw new Error(`approval claim failed: ${stale.error.message}`);
  const took = (stale.data?.length ?? 0) === 1;
  if (took) console.warn("[approval] took over an expired send claim", { approvalId });
  return took;
}

/** Give the claim back after a failed send so the approval can be retried. */
export async function releaseApproval(db: ApprovalDb, approvalId: string, sendError: string) {
  await db
    .from("arthur_email_approvals")
    .update({ status: "failed", send_error: sendError, approved_at: null, approved_by: null })
    .eq("id", approvalId);
}

/** Provider idempotency key: same approval + same content dedupes at Resend; an edited body gets a fresh key. */
export function approvalIdempotencyKey(approvalId: string, to: string, subject: string, body: string): string {
  const h = createHash("sha256").update(`${to}\n${subject}\n${body}`).digest("hex").slice(0, 16);
  return `approval-${approvalId}-${h}`;
}
