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
      eyebrow={data.user.email ? `Signed in as ${data.user.email}` : "Client portal"}
      headline="You don’t have access to an organization yet"
      rail={{ kicker: "Access", line: "Your organization’s admin controls who can join." }}
      footer={<ul className="links"><li><a href="mailto:hello@loveleedaystudios.com">Get help</a></li></ul>}
    >
      <div className="box" style={{ marginTop: 0 }}>
        <b>To get access</b>
        <ul className="steps-plain">
          <li>Open the invitation link from your email, if you received one.</li>
          <li>Otherwise, ask the person who manages your organization’s LOVELEEDAY account to invite this email address.</li>
        </ul>
      </div>
      <div className="stack" style={{ marginTop: 24 }}>
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
