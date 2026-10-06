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
      headline="Your workspace access isn't ready yet"
      lead={`You're signed in as ${data.user.email}, but this account hasn't joined an organization yet.`}
    >
      <p className="ll-note mb-6">
        If you received an invitation email, open its link to join. If not, ask the person who manages your organization's account to invite this email address, or write to us at hello@loveleedaystudios.com.
      </p>
      <SignOutButton />
    </AuthShell>
  );
}
