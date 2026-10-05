// Postgres (Supabase, project eydcfgoklajcztpoprsl) backing for the portal engine. The ONLY storage the engine has.
// Ontology operations are ported from ~/arthur lib/ontology/pg-store.mjs (arthur/runtime @ 95170c8b) onto the same tables and
// RPCs (migration 20) plus links/watches and pipeline state (migration 24).
//
// Credentials (names only; values are never logged or put into an error): LOVELEEDAY_SUPABASE_SERVICE_ROLE_KEY (runtime
// secret) and NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL (build arg). Task/approval proposals go through the existing
// connectors-server RPCs (anon key + LOVELEEDAY_CONNECTORS_SERVER_SECRET), which validate the tenant and write the audit log.
//
// Every engine query filters on tenant_id even though the service role bypasses RLS: RLS protects members reading through the
// portal; the explicit filter protects the engine from itself. A house tenant never gets this far (clientTenant).
import { clientTenant } from "./context.ts";
import type { Graph, IngestRecord, Reader, Sink, Task, Approval } from "./pipeline.ts";
import type { FactRow } from "./verdict.ts";

type Fetch = typeof fetch;
export type PgClient = {
  call(method: string, path: string, o?: { body?: unknown; prefer?: string }): Promise<{ data: any; headers: Headers }>;
  rpc(fn: string, args: Record<string, unknown>): Promise<any>;
};

export function pgClient({ url, key, fetchImpl = fetch }: { url: string; key: string; fetchImpl?: Fetch }): PgClient {
  if (!url || !key) throw new Error("engine: database is not configured (NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL / LOVELEEDAY_SUPABASE_SERVICE_ROLE_KEY)");
  const redact = (s: string) => String(s).split(key).join("[redacted]");
  async function call(method: string, path: string, { body, prefer }: { body?: unknown; prefer?: string } = {}) {
    const r = await fetchImpl(`${url}/rest/v1/${path}`, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
      signal: AbortSignal.timeout(30_000),
    });
    const t = await r.text();
    if (!r.ok) { const e = new Error(`engine ${method} ${path.split("?")[0]} HTTP ${r.status}: ${redact(t).slice(0, 240)}`) as Error & { status?: number }; e.status = r.status; throw e; }
    return { data: t ? JSON.parse(t) : null, headers: r.headers };
  }
  return { call, rpc: async (fn, args) => (await call("POST", `rpc/${fn}`, { body: args })).data };
}

const nowIso = () => new Date().toISOString();
export const objectKey = (type: string, name: string) => `${type}:${String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}`;
const enc = encodeURIComponent;

// The ontology for ONE client tenant. tenantId is the tenants.id uuid the caller already resolved from the slug.
export function pgGraph(db: PgClient, tenantId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error("pgGraph needs a tenant uuid");
  const addAlias = async (entityId: string, alias: string, { source = null as string | null, confidence = 1.0 } = {}) => {
    try { await db.call("POST", "engine_aliases", { body: [{ tenant_id: tenantId, entity_id: entityId, alias, source, confidence }], prefer: "return=minimal" }); }
    catch (e) { if ((e as { status?: number }).status !== 409) throw e; } // already an alias of this entity
  };
  const graph: Graph & Record<string, any> = {
    async resolve(text: string) {
      const rows = await db.rpc("engine_resolve", { p_tenant: tenantId, p_text: String(text) });
      if (!rows?.length) return null;
      const r = rows[0];
      return { object_id: r.entity_id, object_key: r.object_key, type: r.type, canonical_name: r.canonical_name, alias: r.alias, match: r.match };
    },
    async upsertObject({ type, name }: { type: string; name: string }) {
      if (!type || !name) throw new Error("upsertObject needs type and name");
      const { data } = await db.call("POST", "engine_entities?on_conflict=tenant_id,object_key&select=id",
        { body: [{ tenant_id: tenantId, object_key: objectKey(type, name), type, canonical_name: name, updated_at: nowIso() }], prefer: "resolution=merge-duplicates,return=representation" });
      const id = data[0].id as string;
      await addAlias(id, name, { source: "canonical" });
      return id;
    },
    addAlias,
    async setProp(id: string, prop: string, value: unknown, { validFrom = nowIso(), observedAt = nowIso(), sourceSystem, sourceRef, confidence = 1.0 }: { validFrom?: string; observedAt?: string; sourceSystem: string; sourceRef: string; confidence?: number }) {
      if (!sourceSystem || !sourceRef) throw new Error(`setProp(${id}.${prop}) requires sourceSystem and sourceRef: a value without lineage is not reportable`);
      return db.rpc("engine_set_prop", { p_tenant: tenantId, p_entity: id, p_prop: prop, p_value: String(value), p_valid_from: validFrom, p_observed_at: observedAt,
        p_source_system: sourceSystem, p_source_ref: sourceRef, p_confidence: confidence });
    },
    // Current (unsuperseded) facts with the entity name: the row shape verdictFor reads.
    async currentRows(): Promise<FactRow[]> {
      const q = `engine_properties?tenant_id=eq.${tenantId}&superseded_by=is.null&select=prop,value,value_num,source_system,source_ref,observed_at,engine_entities!engine_properties_entity_fk(canonical_name)&limit=5000`;
      return ((await db.call("GET", q)).data as any[]).map((r) => ({ canonical_name: r.engine_entities?.canonical_name, prop: r.prop, value: r.value, value_num: r.value_num, source_system: r.source_system, source_ref: r.source_ref, observed_at: r.observed_at }));
    },
    async propsAsOf(id: string, { asOf = nowIso(), asKnownAt = null as string | null } = {}) {
      return (await db.rpc("engine_props_as_of", { p_tenant: tenantId, p_entity: id, p_as_of: asOf, p_as_known_at: asKnownAt })) || [];
    },
    async lineage(id: string, prop: string) {
      return (await db.call("GET", `engine_properties?tenant_id=eq.${tenantId}&entity_id=eq.${enc(id)}&prop=eq.${enc(prop)}&select=id,value,valid_from,valid_until,observed_at,source_system,source_ref,confidence,superseded_by&order=observed_at.asc,id.asc&limit=500`)).data;
    },
    async link(fromId: string, toId: string, relation: string, { validFrom = nowIso(), sourceRef = null as string | null } = {}) {
      await db.call("POST", "engine_links?on_conflict=tenant_id,from_entity,to_entity,relation,valid_from",
        { body: [{ tenant_id: tenantId, from_entity: fromId, to_entity: toId, relation, valid_from: validFrom, source_ref: sourceRef }], prefer: "resolution=ignore-duplicates,return=minimal" });
    },
    async links(id: string) {
      const sel = "relation,valid_from,source_ref,from_entity,to_entity";
      const [o, i] = await Promise.all([
        db.call("GET", `engine_links?tenant_id=eq.${tenantId}&from_entity=eq.${enc(id)}&select=${sel}&limit=200`),
        db.call("GET", `engine_links?tenant_id=eq.${tenantId}&to_entity=eq.${enc(id)}&select=${sel}&limit=200`),
      ]);
      return [...(o.data as any[]).map((l) => ({ relation: l.relation, other: l.to_entity, dir: "out", valid_from: l.valid_from, source_ref: l.source_ref })),
        ...(i.data as any[]).map((l) => ({ relation: l.relation, other: l.from_entity, dir: "in", valid_from: l.valid_from, source_ref: l.source_ref }))];
    },
    async watch(id: string, prop: string, op: string, threshold: unknown, { note = null as string | null } = {}) {
      if (![">", ">=", "<", "<=", "==", "!=", "changed"].includes(op)) throw new Error(`watch: unknown operator "${op}"`);
      const num = Number.isFinite(Number(threshold)) && String(threshold).trim() !== "" ? Number(threshold) : null;
      const { data } = await db.call("POST", "engine_watches?select=id", { body: [{ tenant_id: tenantId, entity_id: id, prop, op, threshold: String(threshold), threshold_num: num, note }], prefer: "return=representation" });
      return data[0].id as number;
    },
    async watches() {
      return (await db.call("GET", `engine_watches?tenant_id=eq.${tenantId}&disabled_at=is.null&select=*&order=id.asc`)).data;
    },
  };
  return graph;
}

// Reads ingested_records for ONE tenant by tenant_id and stamps each row with the tenant it really belongs to, so the
// pipeline's own cross-tenant check sees real data (a row of another tenant would arrive stamped foreign and be rejected).
export function ingestReader(db: PgClient, tenantId: string, slug: string): Reader {
  return {
    async readNew({ cursor, limit }) {
      const q = `ingested_records?tenant_id=eq.${tenantId}&seq=gt.${Number(cursor) || 0}&order=seq.asc&limit=${Math.min(Math.max(Number(limit) || 500, 1), 1000)}` +
        "&select=seq,tenant_id,source_system,object,source_ref,payload,payload_sha256,observed_at,valid_from";
      const rows = (await db.call("GET", q)).data as any[];
      const records: IngestRecord[] = rows.map((r) => ({ ...r, tenant: r.tenant_id === tenantId ? slug : `foreign-${r.tenant_id}` }));
      return { records, nextCursor: rows.length ? Number(rows[rows.length - 1].seq) : cursor };
    },
  };
}

// Task + approval proposals through the connectors-server RPCs (idempotent; they validate the tenant and write audit_log).
export function portalSink({ url, anonKey, secret, tenantId, slug, fetchImpl = fetch }: { url: string; anonKey: string; secret: string; tenantId: string; slug: string; fetchImpl?: Fetch }): Sink {
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const r = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_secret: secret, ...args }), signal: AbortSignal.timeout(30_000) });
    const t = await r.text();
    if (!r.ok) throw new Error(`${fn} ${r.status} ${t.split(secret).join("[redacted]").split(anonKey).join("[redacted]").slice(0, 200)}`);
    return t ? JSON.parse(t) : null;
  };
  return {
    async proposeTask(t: Task) {
      if (t.tenant !== slug) throw new Error(`sink for ${slug} was handed a task of ${t.tenant}`);
      if (!t.workstream_id) return { unrouted: "no workstream named in the record" };
      try {
        await rpc("workstream_task_propose", { p_tenant_slug: slug, p_workstream_key: t.workstream_id, p_title: t.title, p_detail: t.detail, p_recommendation: t.recommendation,
          p_evidence: { ...t.evidence, gate: t.gate, kind: t.kind, dedupe_key: t.dedupe_key }, p_proof: t.proof });
      } catch (e) {
        if (/unknown workstream/.test(String((e as Error).message))) return { unrouted: `workstream "${t.workstream_id}" does not exist in ${slug}` };
        throw e;
      }
    },
    async proposeApproval(a: Approval) {
      if (a.tenant !== slug) throw new Error(`sink for ${slug} was handed an approval of ${a.tenant}`);
      return rpc("approval_propose", { p_tenant: tenantId, p_gate: a.gate, p_title: a.title, p_detail: a.detail, p_proposed: a.proposed, p_source_ref: a.source_ref, p_entity: null });
    },
  };
}

export type Due = { tenant_id: string; slug: string; after_seq: number; max_seq: number };
export function pipelineState(db: PgClient) {
  return {
    due: async (limit = 50): Promise<Due[]> => ((await db.rpc("engine_pipeline_due", { p_limit: limit })) || [])
      .map((d: any) => ({ tenant_id: d.tenant_id, slug: d.slug, after_seq: Number(d.after_seq), max_seq: Number(d.max_seq) })),
    advance: async (tenantId: string, from: number, to: number): Promise<boolean> => (await db.rpc("engine_pipeline_advance", { p_tenant: tenantId, p_from: from, p_to: to })) === true,
    logRun: async (row: Record<string, unknown>) => { await db.call("POST", "engine_pipeline_runs", { body: [row], prefer: "return=minimal" }); },
  };
}

// Production wiring from env. Throws (never falls back) when anything is missing.
export function engineFromEnv(env: Record<string, string | undefined> = process.env) {
  // Direct process.env reference so Next inlines the build-arg URL.
  const url = env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL ?? process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_LOVELEEDAY_ANON_KEY;
  const key = env.LOVELEEDAY_SUPABASE_SERVICE_ROLE_KEY, secret = env.LOVELEEDAY_CONNECTORS_SERVER_SECRET;
  if (!url || !anonKey || !key || !secret) throw new Error("engine is not configured");
  const db = pgClient({ url, key });
  return {
    db, state: pipelineState(db),
    graphFor: (tenantId: string) => pgGraph(db, tenantId),
    readerFor: (tenantId: string, slug: string) => ingestReader(db, tenantId, clientTenant(slug, "engine.readerFor")),
    sinkFor: (tenantId: string, slug: string) => portalSink({ url, anonKey, secret, tenantId, slug: clientTenant(slug, "engine.sinkFor") }),
  };
}
