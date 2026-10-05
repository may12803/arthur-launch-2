// Auth gate for /api/client/staff: anonymous callers get 401, signed-in non-staff callers get 403, before any payload is parsed
// or any RPC that casts the payload runs. (Before: an empty body reached staff_open_access, the uuid cast failed, and the route
// answered 500 for anonymous, viewer and member callers.) Pure, with no framework imports, so node:test can exercise it.
type RpcClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type GateResult = { ok: true } | { ok: false; status: 401 | 403; error: string };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function staffGate(supabase: RpcClient): Promise<GateResult> {
  const { data } = await supabase.auth.getUser();
  if (!data?.user) return { ok: false, status: 401, error: "Not signed in." };
  const { data: isStaff, error } = await supabase.rpc("is_staff");
  if (error || isStaff !== true) return { ok: false, status: 403, error: "Only LOVELEEDAY staff can do this." };
  return { ok: true };
}

// Signed-in only (closing a grant is also allowed for a client owner or admin, so no staff check).
export async function signedInGate(supabase: RpcClient): Promise<GateResult> {
  const { data } = await supabase.auth.getUser();
  return data?.user ? { ok: true } : { ok: false, status: 401, error: "Not signed in." };
}
