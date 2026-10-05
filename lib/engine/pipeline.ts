// Tenant pipeline for CLIENT tenants, running on Fly inside the portal: ingested_records -> client ontology (Postgres) ->
// figure-gated workstream task proposals + approvals. Nothing here executes anything.
//
// Ported from ~/arthur lib/tenant/pipeline.mjs (arthur/runtime @ 95170c8b). The record loop, gate floors, lineage rule,
// entity naming, verification and task/approval shapes are the same; lib/engine/__tests__/parity.test.mjs runs one fixture set
// through both copies and fails on any difference. Deliberate differences:
//   - the graph is INJECTED (lib/engine/pg.ts in production). There is no SQLite, no ~/.arthur path, no Mac URL anywhere here.
//   - a house tenant is refused (clientTenant); the Mac copy now refuses client tenants. Each side owns one set of tenants.
//   - a sink may report a task as unrouted (no such workstream in the tenant); that is counted, not thrown, so one bad record
//     cannot pin the tenant's cursor forever. Any other sink error throws and the run is retried from the same cursor.
import { createHash } from "node:crypto";
import { clientTenant } from "./context.ts";
import { verdictFor, type FactRow } from "./verdict.ts";

export const GATES = ["auto", "send", "money", "legal"] as const;
export type Gate = (typeof GATES)[number];
const RANK: Record<string, number> = Object.fromEntries(GATES.map((g, i) => [g, i]));
const FLOORS: Record<"money" | "send" | "legal", string[]> = {
  money: ["invoice", "bill", "payment", "payout", "charge", "refund", "transfer", "subscription"],
  send: ["message", "email", "campaign", "post", "sms", "reply"],
  legal: ["contract", "agreement", "signature", "filing", "nda", "license"],
};
const TYPE_MAP: Record<string, string> = { invoice: "invoice", bill: "invoice", order: "order", customer: "customer", contact: "customer", vendor: "vendor", supplier: "vendor",
  employee: "employee", item: "item", product: "item", location: "venue", venue: "venue", account: "account" };
const NAME_KEYS = ["name", "display_name", "title", "company", "customer_name", "vendor_name", "email"];

export type IngestRecord = {
  seq?: number; tenant: string; source_system: string; object: string; source_ref: string; observed_at: string | null;
  valid_from?: string | null; payload: Record<string, unknown> & { proposed_action?: ProposedAction }; payload_sha256?: string | null;
};
export type ProposedAction = { title?: string; detail?: string; recommendation?: string; gate?: string; workstream_id?: string };
export type Lineage = { prop: string; value: unknown; sourceSystem: string; sourceRef: string; observed_at: string; verdict?: string };
export type Task = {
  tenant: string; workstream_id: string | null; title: string; detail: string; recommendation: string | null;
  kind: "insight" | "action"; status: "proposed"; gate: Gate; dedupe_key: string;
  evidence: { object_id: string; lineage: Lineage[] }; proof: string;
};
export type Approval = {
  tenant: string; gate: Gate; title: string; detail: string; source_ref: string; status: "pending";
  proposed: { action: ProposedAction | null; object_id: string; source: { sourceSystem: string; sourceRef: string; observed_at: string } };
};
export type Graph = {
  resolve(name: string): Promise<{ object_id: string } | null>;
  upsertObject(a: { type: string; name: string }): Promise<string>;
  setProp(id: string, prop: string, value: unknown, o: { validFrom: string; observedAt: string; sourceSystem: string; sourceRef: string }): Promise<unknown>;
  currentRows(): Promise<FactRow[]>;
};
export type Reader = { readNew(a: { tenant: string; cursor: number | null; limit: number }): Promise<{ records: IngestRecord[]; nextCursor?: number | null }> };
export type Sink = {
  proposeTask(t: Task): Promise<void | { unrouted: string }>;
  proposeApproval(a: Approval): Promise<unknown>;
};
export type RunOut = {
  tenant: string; read: number; cursor: number | null;
  rejected: { ref: string; reason: string }[]; unverified: { ref: string; reason: string }[]; unrouted: { ref: string; reason: string }[];
  tasks: Task[]; approvals: Approval[];
};

export const floorGate = (object: unknown): Gate => {
  const o = String(object || "").toLowerCase();
  for (const g of ["legal", "money", "send"] as const) if (FLOORS[g].some((k) => o === k || o.endsWith(`_${k}`) || o.includes(k))) return g;
  return "auto";
};
export const gateFor = (record: { object: unknown; payload?: { proposed_action?: { gate?: unknown } } }): Gate => {
  const floor = floorGate(record.object);
  const declared = String(record.payload?.proposed_action?.gate || "auto").toLowerCase();
  const d = (declared in RANK ? declared : "legal") as Gate; // an unreadable declared gate fails to the strictest, not the loosest
  return RANK[d] > RANK[floor] ? d : floor;
};

const sha = (s: string) => createHash("sha256").update(String(s)).digest("hex");
export const lineageProblem = (r: Record<string, unknown>): string | null => {
  for (const k of ["source_system", "source_ref", "observed_at"]) if (r[k] == null || String(r[k]).trim() === "") return `missing ${k}`;
  return null;
};
function entityName(payload: Record<string, unknown> | undefined): string | null {
  for (const k of NAME_KEYS) { const v = payload?.[k]; if (typeof v === "string" && v.trim()) return v.trim(); }
  return null;
}

export async function runTenantPipeline({ tenant: tenantArg, reader, sink, graph, cursor = null, limit = 500 }:
  { tenant: string; reader: Reader; sink: Sink; graph: Graph; cursor?: number | null; limit?: number }): Promise<RunOut> {
  const tenant = clientTenant(tenantArg, "engine.runTenantPipeline");
  if (!reader || !sink || !graph) throw new Error("runTenantPipeline needs a reader, a sink and a graph");
  const out: RunOut = { tenant, read: 0, rejected: [], unverified: [], unrouted: [], tasks: [], approvals: [], cursor };
  const { records = [], nextCursor = cursor } = await reader.readNew({ tenant, cursor, limit });
  out.read = records.length; out.cursor = nextCursor ?? cursor;
  for (const r of records) {
    const ref = `${r.source_system}:${r.object}:${r.source_ref}`;
    if (r.tenant !== tenant) { out.rejected.push({ ref, reason: `record belongs to tenant ${r.tenant}, not ${tenant}` }); continue; }
    const bad = lineageProblem(r as unknown as Record<string, unknown>);
    if (bad) { out.rejected.push({ ref, reason: `no lineage (${bad})` }); continue; }
    const observedAt = String(r.observed_at);

    const name = entityName(r.payload);
    if (!name) { out.rejected.push({ ref, reason: "no entity name in payload" }); continue; }
    const found = await graph.resolve(name);
    const objectId = found ? found.object_id : await graph.upsertObject({ type: TYPE_MAP[String(r.object).toLowerCase()] || "counterparty", name });

    const lineage: Lineage[] = [];
    for (const [prop, value] of Object.entries(r.payload)) {
      if (value == null || typeof value === "object" || NAME_KEYS.includes(prop) || prop === "proposed_action") continue;
      await graph.setProp(objectId, prop, value, { validFrom: r.valid_from || observedAt, observedAt, sourceSystem: r.source_system, sourceRef: `${r.object}:${r.source_ref}` });
      lineage.push({ prop, value, sourceSystem: r.source_system, sourceRef: `${r.object}:${r.source_ref}`, observed_at: observedAt });
    }
    if (!lineage.length) { out.rejected.push({ ref, reason: "no scalar facts in payload" }); continue; }

    // Verification: every numeric fact must come back SUPPORTED from THIS tenant's rows with lineage and a named subject.
    const rows = await graph.currentRows();
    let bad2: string | null = null;
    for (const l of lineage) {
      const n = typeof l.value === "number" ? l.value : Number(String(l.value).replace(/[$,%\s]/g, ""));
      if (!Number.isFinite(n) || String(l.value).trim() === "") { l.verdict = "NON_NUMERIC"; continue; }
      const v = verdictFor({ n }, `${name} ${l.prop}`, rows);
      l.verdict = v.verdict;
      if (v.verdict !== "SUPPORTED") bad2 = `${l.prop}: ${v.verdict}`;
    }
    if (bad2) { out.unverified.push({ ref, reason: bad2 }); continue; }

    const gate = gateFor(r);
    const action = r.payload.proposed_action;
    if (!action && gate === "auto") continue; // data that only feeds the ontology: no task, no approval
    const dedupe = sha(`${tenant}|${ref}|${r.payload_sha256 || sha(JSON.stringify(r.payload))}`);
    const task: Task = {
      tenant, workstream_id: action?.workstream_id || (r.payload.workstream_id as string | undefined) || null,
      title: String(action?.title || `${r.object} ${name}`).slice(0, 200),
      detail: String(action?.detail || `Observed in ${r.source_system}: ${lineage.map((l) => `${l.prop}=${l.value}`).join(", ")}`).slice(0, 2000),
      recommendation: action?.recommendation || null,
      kind: gate === "auto" ? "insight" : "action", status: "proposed", gate, dedupe_key: dedupe,
      evidence: { object_id: objectId, lineage },
      proof: `machine: ${lineage.length} fact(s) re-read from the tenant ontology, verdicts ${[...new Set(lineage.map((l) => l.verdict))].join("/")}, source ${r.source_system} ${r.source_ref}, observed ${observedAt}`,
    };
    const placed = await sink.proposeTask(task);
    if (placed && typeof placed === "object" && "unrouted" in placed) out.unrouted.push({ ref, reason: placed.unrouted });
    else out.tasks.push(task);
    if (gate !== "auto") {
      const approval: Approval = { tenant, gate, title: task.title, detail: task.detail, source_ref: dedupe, status: "pending",
        proposed: { action: action || null, object_id: objectId, source: { sourceSystem: r.source_system, sourceRef: r.source_ref, observed_at: observedAt } } };
      await sink.proposeApproval(approval);
      out.approvals.push(approval);
    }
  }
  return out;
}
