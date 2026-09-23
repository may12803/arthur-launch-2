import { redirect } from "next/navigation";
import { getLoveleedayServer } from "@/lib/supabase/loveleeday-server";
import { Card } from "@/components/client-portal/ui";
import { SignOutButton } from "@/components/client-portal/SignOutButton";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const supabase = await getLoveleedayServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/client/login");

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-6 font-sans">
      <Card className="p-8 w-full max-w-[440px] text-center">
        <div className="font-serif italic text-[19px] text-text-active mb-6">loveleeday</div>
        <p className="font-serif text-h3 text-text-active mb-2">No active company access</p>
        <p className="text-small text-text-muted leading-relaxed mb-6">
          {data.user.email} is signed in, but isn&apos;t an accepted member of a Loveleeday account yet.
          If you were sent an invite link, use that link to join. Otherwise, ask your contact to send
          you one.
        </p>
        <SignOutButton />
      </Card>
    </div>
  );
}
