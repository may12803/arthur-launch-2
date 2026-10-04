import type { Metadata } from "next";
import { LegalPage } from "@/components/client-portal/LegalPage";

export const metadata: Metadata = { title: { absolute: "Privacy — LOVELEEDAY client portal" }, robots: { index: true, follow: true } };

// [NEEDS: Daniel review] Plain, honest draft written from what the portal code does on 2026-10-04. It is not legal
// advice and has not been reviewed by counsel. Re-check every statement against the code before relying on it.
export default function PortalPrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="4 October 2026">
      <p>
        This page covers the LOVELEEDAY client portal at portal.loveleedaystudios.com. Our marketing site has its own
        <a href="https://loveleedaystudios.com/privacy"> privacy page</a>. This is a plain-language draft that is being reviewed.
      </p>

      <h2>What the portal holds about you</h2>
      <ul>
        <li>Your email address and a password (stored as a one-way hash by our authentication provider, never in readable form).</li>
        <li>Your second factor: an authenticator-app secret and backup codes, used only to sign you in.</li>
        <li>Which company you belong to and your role there (owner, admin, member or viewer).</li>
        <li>The files you or LOVELEEDAY upload, and the deliverables, contracts and workstream records prepared for your company.</li>
        <li>An access history for your company: who uploaded, downloaded, shared or deleted a document, and every time LOVELEEDAY staff opened access. Entries cannot be edited from the portal.</li>
        <li>If your company connects a platform such as a point-of-sale or email system, the connection details needed to read it.</li>
      </ul>

      <h2>Who can see your company&apos;s information</h2>
      <p>
        Members of your company see that company&apos;s information according to their role. Nobody in another company can see it.
        LOVELEEDAY staff have no standing access to client accounts. A staff member must open a time-limited grant with a stated
        reason, your company&apos;s owners and admins are emailed when it opens, and the grant appears in your access history.
      </p>

      <h2>Who handles data for us</h2>
      <ul>
        <li>Supabase hosts the portal database and the sign-in system.</li>
        <li>Fly.io runs the portal application.</li>
        <li>Resend delivers the portal&apos;s security emails: invitations, one-time codes and staff-access notices.</li>
        <li>Stripe handles card payments if your company has billing set up. We do not store card numbers.</li>
      </ul>

      <h2>Cookies</h2>
      <p>
        The portal sets only the cookies it needs to keep you signed in and to remember which company you are working in. It does
        not use advertising or tracking cookies.
      </p>

      <h2>Sharing outside your company</h2>
      <p>
        If your owner turns outside sharing on, a member can create a link to one document. The recipient proves their email address
        with a one-time code, links expire, and each share is recorded in the access history. Your owner can turn sharing off at any time.
      </p>

      <h2>Your choices</h2>
      <p>
        Ask us to correct or delete your information, or your company&apos;s, by writing to
        <a href="mailto:hello@loveleedaystudios.com"> hello@loveleedaystudios.com</a>. Uploaded documents can be deleted in the portal by the people your company allows to do so.
      </p>
    </LegalPage>
  );
}
