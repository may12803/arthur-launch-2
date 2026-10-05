// Runs the tenant pipeline for every CLIENT tenant with ingested records past its cursor. Each tenant is isolated: its own
// graph (tenant_id-scoped), reader, sink and cursor; a failure is logged and the loop moves on. The cursor advances only after
// a successful run, by compare-and-set, so a failed or overlapping run re-reads the same records (proposals are idempotent).
import { clientTenant, isHouseTenant } from "./context.ts";
import { runTenantPipeline, type Graph, type Reader, type Sink } from "./pipeline.ts";
import type { Due } from "./pg.ts";

export type Engine = {
  state: { due(limit?: number): Promise<Due[]>; advance(tenantId: string, from: number, to: number): Promise<boolean>; logRun(row: Record<string, unknown>): Promise<void> };
  graphFor(tenantId: string): Graph;
  readerFor(tenantId: string, slug: string): Reader;
  sinkFor(tenantId: string, slug: string): Sink;
};
export type TenantResult = { tenant: string; status: "ok" | "failed" | "skipped"; read: number; tasks: number; approvals: number; rejected: number; unverified: number; unrouted: number; advanced?: boolean; error?: string };

export async function runClientTenants(engine: Engine, { limit = 500, maxTenants = 50, log = console.log }: { limit?: number; maxTenants?: number; log?: (s: string) => void } = {}): Promise<TenantResult[]> {
  const due = await engine.state.due(maxTenants);
  const results: TenantResult[] = [];
  for (const d of due) {
    const base = { tenant: d.slug, read: 0, tasks: 0, approvals: 0, rejected: 0, unverified: 0, unrouted: 0 };
    if (isHouseTenant(d.slug)) { results.push({ ...base, status: "skipped", error: "house tenant" }); continue; }
    const started = new Date().toISOString();
    try {
      const slug = clientTenant(d.slug, "engine.runClientTenants");
      const out = await runTenantPipeline({ tenant: slug, reader: engine.readerFor(d.tenant_id, slug), sink: engine.sinkFor(d.tenant_id, slug), graph: engine.graphFor(d.tenant_id), cursor: d.after_seq, limit });
      const to = Number(out.cursor ?? d.after_seq);
      const advanced = to > d.after_seq ? await engine.state.advance(d.tenant_id, d.after_seq, to) : false;
      const r: TenantResult = { tenant: slug, status: "ok", read: out.read, tasks: out.tasks.length, approvals: out.approvals.length, rejected: out.rejected.length, unverified: out.unverified.length, unrouted: out.unrouted.length, advanced };
      results.push(r);
      log(`[tenant-pipeline] tenant=${slug} read=${r.read} tasks=${r.tasks} approvals=${r.approvals} rejected=${r.rejected} unverified=${r.unverified} unrouted=${r.unrouted} cursor=${d.after_seq}->${to}${advanced ? "" : " (cursor not advanced)"}`);
      await engine.state.logRun({ tenant_id: d.tenant_id, started_at: started, finished_at: new Date().toISOString(), status: "ok", from_seq: d.after_seq, to_seq: to,
        read: r.read, tasks: r.tasks, approvals: r.approvals, rejected: r.rejected, unverified: r.unverified, unrouted: r.unrouted,
        detail: { rejected: out.rejected.slice(0, 20), unverified: out.unverified.slice(0, 20), unrouted: out.unrouted.slice(0, 20), advanced } }).catch((e) => log(`[tenant-pipeline] tenant=${slug} run-log write failed: ${(e as Error).message}`));
    } catch (e) {
      const msg = (e as Error).message || "error";
      results.push({ ...base, status: "failed", error: msg });
      log(`[tenant-pipeline] tenant=${d.slug} FAILED: ${msg.slice(0, 200)}`);
      await engine.state.logRun({ tenant_id: d.tenant_id, started_at: started, finished_at: new Date().toISOString(), status: "failed", from_seq: d.after_seq, error: msg.slice(0, 1000) })
        .catch(() => { /* the failure is already in the log line; the run log is best effort */ });
    }
  }
  return results;
}
