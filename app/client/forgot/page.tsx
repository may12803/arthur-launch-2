"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { FormField, PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";

// Forgot password: always answers the same way, so the page never reveals whether an address has an account.
export default function ClientForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    await loveleeday.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/client/reset` });
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthShell eyebrow="Password" headline="Reset your password" lead="Enter the email you use to sign in. We'll send a link to choose a new password." context={null}>
      {sent ? (
        <div><p className="text-[17px] font-medium text-[var(--ink)]">Check your email</p><p className="ll-note mt-2">If an account exists for that address, a reset link is on its way. It expires in an hour. You&apos;ll still need your authenticator code after you set the new password.</p></div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <FormField label="Email" htmlFor="forgot-email">
            <input id="forgot-email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </FormField>
          <PortalButton type="submit" disabled={busy || !email} className="w-full">{busy ? "Sending…" : "Send reset link"}</PortalButton>
        </form>
      )}
      <p className="ll-note mt-6"><Link href="/client/login" className="underline">Back to sign in</Link></p>
    </AuthShell>
  );
}
