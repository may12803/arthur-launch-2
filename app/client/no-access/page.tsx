import { redirect } from "next/navigation";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { AuthShell } from "@/components/client-portal/AuthShell";
import { SignOutButton } from "@/components/client-portal/SignOutButton";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const supabase = await getLoveleedayServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/client/login");

  return (
    <AuthShell
      eyebrow="Client portal"
      headline="No active"
      muted="company access."
      lead="You're signed in, but this account isn't an accepted member of a LOVELEEDAY client company yet."
    >
      <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">Signed in as {data.user.email}</h2>
      <p className="ll-note mt-2 mb-6">
        If you were sent an invite link, open that link to join. Otherwise, ask your contact to send you one.
      </p>
      <SignOutButton />
    </AuthShell>
  );
}
