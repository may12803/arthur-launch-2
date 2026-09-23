import type { ReactNode } from "react";
import { requireClientPortal } from "@/lib/client-portal/session";
import { PortalShell } from "@/components/client-portal/PortalShell";

// Gate for every screen in this route group (/client, /client/deliverables/*,
// /client/account, /client/team, /client/contracts, /client/billing).
// requireClientPortal() redirects to /client/login, /client/mfa/challenge,
// /client/mfa/enroll, or /client/no-access when the session/MFA/membership
// isn't ready, and never returns in those cases — so every page rendered
// through this layout is authenticated, AAL2, and has an accepted tenant.
export default async function ClientPortalLayout({ children }: { children: ReactNode }) {
  const ctx = await requireClientPortal();
  return <PortalShell tenantName={ctx.tenantName}>{children}</PortalShell>;
}
