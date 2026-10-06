"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { FormField, PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";

const RAIL = {
  kicker: "Password reset",
  line: "Reset links expire after one hour.",
  tips: ["Check your spam folder", "Open the link on this device", "Choose a new password"],
};

// Forgot password: always answers the same way, so the page never reveals whether an address has an account.
export default function ClientForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    await loveleeday.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/client/reset` });
    setBusy(false);
    setSent(true);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    await send();
  }

  if (sent) {
    return (
      <AuthShell
        pill={{ text: "Password reset" }}
        headline="Check your email"
        lead={<>If <b>{email.trim()}</b> has a LOVELEEDAY account, we have sent it a link to choose a new password. The link works for one hour.</>}
        rail={RAIL}
        footer={
          <ul className="links">
            <li><button type="button" className="linkbtn" disabled={busy} onClick={send}>{busy ? "Sending…" : "Didn’t get it? Send another link"}</button></li>
          </ul>
        }
      >
        <p className="note" style={{ marginTop: 0 }}>After you choose a new password, you will still enter the code from your authenticator app.</p>
        <div className="stack" style={{ marginTop: 24 }}>
          <Link href="/client/login" className="ll-secondary">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      pill={{ text: "Password reset" }}
      headline="Reset your password"
      lead="Enter the email you use to sign in. We will send you a link to choose a new password."
      rail={RAIL}
      footer={<ul className="links"><li><Link href="/client/login">Back to sign in</Link></li></ul>}
    >
      <form onSubmit={onSubmit}>
        <FormField label="Work email" htmlFor="forgot-email">
          <input id="forgot-email" type="email" required autoFocus autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="name@organization.com" />
        </FormField>
        <PortalButton type="submit" disabled={busy || !email}>{busy ? "Sending…" : "Send reset link"}</PortalButton>
      </form>
    </AuthShell>
  );
}
