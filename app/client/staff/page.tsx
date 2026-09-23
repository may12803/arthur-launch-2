import { redirect } from "next/navigation";
import { requireStrongSession } from "@/lib/client-portal/session";
import { AuthShell } from "@/components/client-portal/AuthShell";
import { StaffConsole, type StaffTenant } from "@/components/client-portal/StaffConsole";

export const dynamic = "force-dynamic";

// LOVELEEDAY staff have no standing access to any client. From here they open
// a time-limited grant into one client with a stated reason; the client's
// owners and admins are emailed and see it in their access history.
export default async function StaffConsolePage() {
  const { supabase } = await requireStrongSession();
  const { data: staff } = await supabase.rpc("is_staff");
  if (!staff) redirect("/client/no-access");
  const { data } = await supabase.rpc("staff_list_tenants");
  const tenants = (data as StaffTenant[] | null) || [];

  return (
    <AuthShell
      eyebrow="LOVELEEDAY staff"
      headline="Open access"
      muted="to one client."
      lead="There is no standing access to client accounts. Give a reason and a time limit; the client's owners and admins are emailed right away and can end it at any time."
    >
      <StaffConsole tenants={tenants} />
    </AuthShell>
  );
}
