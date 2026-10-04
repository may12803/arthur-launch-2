import type { Metadata } from "next";
import { LegalPage } from "@/components/client-portal/LegalPage";

export const metadata: Metadata = { title: { absolute: "Terms — LOVELEEDAY client portal" }, robots: { index: true, follow: true } };

// [NEEDS: Daniel review] Plain, honest draft, not legal advice and not reviewed by counsel. The engagement agreement
// signed with each client governs; these terms only cover use of the portal itself. Confirm entity name, governing law
// and any liability language with counsel before relying on this page.
export default function PortalTermsPage() {
  return (
    <LegalPage title="Terms" updated="4 October 2026">
      <p>
        These terms cover your use of the LOVELEEDAY client portal at portal.loveleedaystudios.com. If your company has signed
        an engagement agreement with LOVELEEDAY Studios, that agreement comes first where the two differ. This is a plain-language draft that is being reviewed.
      </p>

      <h2>Who may use the portal</h2>
      <p>
        The portal is for people invited by a company that works with LOVELEEDAY. You need your own account, protected by a password
        and a second factor. Do not share your sign-in. Tell us promptly if you think someone else has used it.
      </p>

      <h2>Your company&apos;s information</h2>
      <p>
        What your company uploads or connects stays your company&apos;s. We use it to do the work you have asked us to do, and for nothing else.
        Only upload material your company has the right to share with us.
      </p>

      <h2>Roles</h2>
      <p>
        Owners and admins can invite and manage teammates and decide whether outside sharing is on. Members can work with documents. Viewers can read.
        You are responsible for the people you invite.
      </p>

      <h2>What we provide, and its limits</h2>
      <p>
        We work to keep the portal available and accurate, but it is provided as is, without a promise of uninterrupted service. Grades,
        findings and recommendations in the portal are professional opinions based on the information available, and decisions that follow from them are yours.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not try to reach another company&apos;s information or probe the portal for weaknesses. If you find a flaw, tell us at hello@loveleedaystudios.com.</li>
        <li>Do not upload malicious files or material you are not allowed to share.</li>
        <li>Do not use the portal to break the law.</li>
      </ul>

      <h2>Ending access</h2>
      <p>
        An owner can remove a teammate&apos;s access. We may suspend an account that puts the portal or other clients at risk. When an engagement ends we will
        agree with your company what happens to its documents.
      </p>

      <h2>Privacy and questions</h2>
      <p>
        How we handle information is described on the <a href="/client/privacy">privacy page</a>. Questions about these terms:
        <a href="mailto:hello@loveleedaystudios.com"> hello@loveleedaystudios.com</a>.
      </p>
    </LegalPage>
  );
}
