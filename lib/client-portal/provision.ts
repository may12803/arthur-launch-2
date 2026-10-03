// Staff-only provisioning of a client business through the portal's own invite/accept mechanism.
// The database creates the tenant + an owner invite in ONE transaction (staff_provision_tenant) and is idempotent by request key, so there is
// no auth user creation, no membership and nothing to compensate: a lost response is simply retried. The invite email is sent AFTER the
// commit; if sending fails the tenant and invite still exist and staff re-run the same request to resend. The owner joins through
// accept_invite(p_token), whether their account is new or existing. Dependency-injected so it is testable without a network.

export type RpcResult = { data: unknown; error: { message: string } | null };
export type StaffClient = { rpc(fn: string, args?: Record<string, unknown>): PromiseLike<RpcResult> };
export type SendInvite = (msg: { to: string; tenantName: string; link: string }) => Promise<boolean>;

export type ProvisionResult =
  | { ok: true; tenantId: string; inviteId: string; created: boolean; accepted: boolean; emailSent: boolean }
  | { ok: false; status: number; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export async function provisionTenant(
  staff: StaffClient,
  sendInvite: SendInvite,
  input: { name?: unknown; slug?: unknown; ownerEmail?: unknown; idempotencyKey?: unknown },
  origin: string,
): Promise<ProvisionResult> {
  const name = String(input.name ?? "").trim();
  const slug = String(input.slug ?? "").trim().toLowerCase();
  const email = String(input.ownerEmail ?? "").trim().toLowerCase();
  const key = String(input.idempotencyKey ?? "").trim();
  if (name.length < 2 || name.length > 120) return { ok: false, status: 400, error: "Business name must be 2 to 120 characters." };
  if (!SLUG.test(slug)) return { ok: false, status: 400, error: "Slug must be 3 to 40 lowercase letters, digits or hyphens." };
  if (!EMAIL.test(email)) return { ok: false, status: 400, error: "Enter a valid owner email address." };

  const res = await staff.rpc("staff_provision_tenant", { p_name: name, p_slug: slug, p_owner_email: email, p_key: key });
  if (res.error) {
    const m = res.error.message;
    if (/staff only/i.test(m)) return { ok: false, status: 403, error: "Only LOVELEEDAY staff can add a client." };
    if (/key already used/i.test(m)) return { ok: false, status: 409, error: "That request key was already used for another business. Use a new key." };
    if (/slug already/i.test(m)) return { ok: false, status: 409, error: "That slug is already in use." };
    if (/must be|not valid/i.test(m)) return { ok: false, status: 400, error: m.charAt(0).toUpperCase() + m.slice(1) + "." };
    // Unknown outcome (for example a lost response). Nothing was created outside the transaction, so repeating the request is safe.
    return { ok: false, status: 500, error: "Something went wrong. Repeat the request; it is safe to retry." };
  }
  const d = res.data as { tenant_id?: string; invite_id?: string; token?: string; created?: boolean; accepted?: boolean } | null;
  if (!d?.tenant_id || !d.invite_id || !d.token) return { ok: false, status: 500, error: "Something went wrong. Repeat the request; it is safe to retry." };

  let emailSent = false;
  if (!d.accepted) {
    emailSent = await sendInvite({ to: email, tenantName: name, link: `${origin}/client/invite/${d.token}` }).catch(() => false);
  }
  return { ok: true, tenantId: d.tenant_id, inviteId: d.invite_id, created: d.created === true, accepted: d.accepted === true, emailSent };
}
