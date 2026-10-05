// Tenant context for the portal-side engine. Ported from ~/arthur lib/tenant/context.mjs (arthur/runtime @ 95170c8b):
// same slug rule, same house-tenant list. The difference is deliberate: there is no ARTHUR_TENANT env fallback here. The
// portal job always names the tenant it is running, and a HOUSE tenant is refused outright: house data (Daniel's own
// businesses) is processed on the Mac, client data only here.
export const HOUSE_TENANTS: readonly string[] = Object.freeze(["aspen-may", "dabney-and-co"]);
export const isHouseTenant = (t: string): boolean => HOUSE_TENANTS.includes(t);
const SLUG = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export function assertTenantSlug(t: unknown): string {
  if (typeof t !== "string" || !SLUG.test(t)) throw new Error(`invalid tenant "${String(t)}" (lowercase letters, digits, - and _ only)`);
  return t;
}

// Every engine entry point calls this first. Missing tenant: throws. House tenant: throws.
export function clientTenant(t: unknown, caller: string): string {
  if (t == null || t === "") throw new Error(`tenant required: ${caller} was called with no tenant; refusing rather than guessing`);
  const slug = assertTenantSlug(t);
  if (isHouseTenant(slug)) throw new Error(`${caller}: "${slug}" is a house tenant; house data is processed on the Mac, never by the portal engine`);
  return slug;
}
