// Staff-only provisioning of a client business. Pure and dependency-injected so it is testable without
// a network: `staff` is the caller's own session client (database enforces staff + MFA), `admin` is the
// service-role Auth admin API (server only) used solely to invite the owner. Nothing here sends mail itself.

export type RpcResult = { data: unknown; error: { message: string } | null };
export type StaffClient = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult> };
export type AdminAuth = {
  inviteUserByEmail(email: string, opts: { redirectTo?: string }): Promise<{ data: { user: { id: string } | null } | null; error: { message: string } | null }>;
  listUsers(p: { page: number; perPage: number }): Promise<{ data: { users: { id: string; email?: string | null }[] } | null; error: { message: string } | null }>;
};

export type ProvisionResult =
  | { ok: true; tenantId: string; ownerId: string; invited: boolean }
  | { ok: false; status: number; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

async function findUserByEmail(admin: AdminAuth, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email || "").toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < 1000) break;
  }
  return null;
}

export async function provisionTenant(
  staff: StaffClient,
  admin: AdminAuth,
  input: { name?: unknown; slug?: unknown; ownerEmail?: unknown },
  redirectTo?: string,
): Promise<ProvisionResult> {
  const name = String(input.name ?? "").trim();
  const slug = String(input.slug ?? "").trim().toLowerCase();
  const email = String(input.ownerEmail ?? "").trim().toLowerCase();
  if (name.length < 2 || name.length > 120) return { ok: false, status: 400, error: "Business name must be 2 to 120 characters." };
  if (!SLUG.test(slug)) return { ok: false, status: 400, error: "Slug must be 3 to 40 lowercase letters, digits or hyphens." };
  if (!EMAIL.test(email)) return { ok: false, status: 400, error: "Enter a valid owner email address." };

  // Staff gate and duplicate check first, so a refused request never creates an auth user.
  const taken = await staff.rpc("staff_slug_taken", { p_slug: slug });
  if (taken.error) return /staff only/i.test(taken.error.message) ? { ok: false, status: 403, error: "Only LOVELEEDAY staff can add a client." } : { ok: false, status: 500, error: "Something went wrong. Try again." };
  if (taken.data === true) return { ok: false, status: 409, error: "That slug is already in use." };

  let ownerId: string | null = null;
  let invited = false;
  const inv = await admin.inviteUserByEmail(email, { redirectTo });
  if (inv.data?.user?.id && !inv.error) {
    ownerId = inv.data.user.id;
    invited = true;
  } else if (/already|registered|exists/i.test(inv.error?.message || "")) {
    ownerId = await findUserByEmail(admin, email);
  }
  if (!ownerId) return { ok: false, status: 502, error: "Couldn't invite the owner. Try again." };

  const res = await staff.rpc("staff_provision_tenant", { p_name: name, p_slug: slug, p_owner: ownerId });
  if (res.error) {
    const m = res.error.message;
    if (/slug already/i.test(m)) return { ok: false, status: 409, error: "That slug is already in use." };
    if (/staff only/i.test(m)) return { ok: false, status: 403, error: "Only LOVELEEDAY staff can add a client." };
    if (/must be|slug must/i.test(m)) return { ok: false, status: 400, error: m.charAt(0).toUpperCase() + m.slice(1) + "." };
    return { ok: false, status: 500, error: "Something went wrong. Try again." };
  }
  return { ok: true, tenantId: String(res.data), ownerId, invited };
}
