"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { FormField, PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";
import { friendlyAuthError } from "@/lib/client-portal/auth-errors";

// Landing page for the reset email. The link carries a one-time code; exchanging it signs the person in with
// their password factor only, so after the new password is set the portal still asks for the authenticator code.
function ResetForm() {
  const params = useSearchParams();
  const [ready, setReady] = useState<"checking" | "ok" | "bad">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const code = params.get("code");
      if (code) {
        const { error: exErr } = await loveleeday.auth.exchangeCodeForSession(code);
        if (exErr) return setReady("bad");
      }
      const { data } = await loveleeday.auth.getUser();
      setReady(data.user ? "ok" : "bad");
    })();
  }, [params]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError("");
    const { error: upErr } = await loveleeday.auth.updateUser({ password });
    setBusy(false);
    if (upErr) {
      // With two-factor on, changing a password needs the authenticator code first.
      if (/aal2|assurance/i.test(upErr.message)) {
        window.location.href = `/client/mfa/challenge?next=${encodeURIComponent("/client/reset")}`;
        return;
      }
      return setError(friendlyAuthError(upErr.message).text);
    }
    window.location.href = "/client";
  }

  return (
    <AuthShell eyebrow="Password" headline="Choose a new" muted="password." lead="At least 12 characters. Passwords that have appeared in a data breach are refused.">
      {ready === "checking" ? (
        <p className="ll-note">Checking your link…</p>
      ) : ready === "bad" ? (
        <p className="ll-note">This reset link has expired or was already used. <Link href="/client/forgot" className="underline">Send a new one</Link>.</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <FormField label="New password" htmlFor="reset-password">
            <input id="reset-password" type="password" autoComplete="new-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </FormField>
          <FormField label="Type it again" htmlFor="reset-confirm">
            <input id="reset-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
          </FormField>
          {error && <p className="ll-feedback warn">{error}</p>}
          <PortalButton type="submit" disabled={busy || !password || !confirm} className="w-full">{busy ? "Saving…" : "Save new password"}</PortalButton>
        </form>
      )}
    </AuthShell>
  );
}

export default function ClientResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
