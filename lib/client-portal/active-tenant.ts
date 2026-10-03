// The ONE active-tenant resolver for the client portal. Every screen (requireClientPortal) and every
// /api/client route (getApiContext, which invite and billing now use too) resolves the company through
// resolveActiveTenant, so a person who belongs to more than one company can never see company A while an
// action lands on company B.
//
// Rules: the active company is explicit (the lv_active_tenant cookie set by /api/client/active-tenant, or an
// x-tenant-id header on an API call) and is validated against the caller's own accepted memberships (and live
// staff grants) on every request. There is no "first membership": with several candidates and no valid
// selection the result is ambiguous and the caller must ask the person to choose.

export const ACTIVE_TENANT_COOKIE = "lv_active_tenant";
export const ACTIVE_TENANT_HEADER = "x-tenant-id";

export type Candidate = { tenantId: string; role: string; source: "membership" | "grant" };
export type Resolution =
  | { ok: true; tenantId: string; role: string; source: Candidate["source"]; candidates: Candidate[] }
  | { ok: false; reason: "none" | "ambiguous" | "not_member"; candidates: Candidate[] };

type Rows = PromiseLike<{ data: unknown; error?: unknown }>;
// Structural slice of the supabase-js query builder, so tests can run without the package.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueryClient = { from(table: string): any };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

// Memberships first (a membership outranks a grant on the same company), then live staff grants. Sorted by
// tenant id so the list is stable; the order carries no meaning because nothing picks "the first".
export async function listCandidates(supabase: QueryClient, userId: string, nowIso = new Date().toISOString()): Promise<Candidate[]> {
  const [m, g] = await Promise.all([
    supabase.from("memberships").select("tenant_id, role").eq("user_id", userId).not("accepted_at", "is", null) as Rows,
    supabase.from("staff_grants").select("tenant_id").eq("staff_user_id", userId).is("revoked_at", null).gt("expires_at", nowIso) as Rows,
  ]);
  const byTenant = new Map<string, Candidate>();
  for (const r of ((m.data as { tenant_id: string; role: string }[] | null) || [])) {
    byTenant.set(r.tenant_id, { tenantId: r.tenant_id, role: r.role || "member", source: "membership" });
  }
  for (const r of ((g.data as { tenant_id: string }[] | null) || [])) {
    if (!byTenant.has(r.tenant_id)) byTenant.set(r.tenant_id, { tenantId: r.tenant_id, role: "staff", source: "grant" });
  }
  return [...byTenant.values()].sort((a, b) => a.tenantId.localeCompare(b.tenantId));
}

export function pickActive(candidates: Candidate[], requested?: string | null): Resolution {
  const want = requested ? requested.trim().toLowerCase() : "";
  if (want) {
    const hit = candidates.find((c) => c.tenantId.toLowerCase() === want);
    return hit ? { ok: true, ...hit, candidates } : { ok: false, reason: "not_member", candidates };
  }
  if (candidates.length === 0) return { ok: false, reason: "none", candidates };
  if (candidates.length === 1) return { ok: true, ...candidates[0], candidates };
  return { ok: false, reason: "ambiguous", candidates };
}

export async function resolveActiveTenant(supabase: QueryClient, userId: string, requested?: string | null): Promise<Resolution> {
  return pickActive(await listCandidates(supabase, userId), requested);
}
