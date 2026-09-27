"use client";

import { useState, useEffect, useCallback, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";
import { MfaHelp } from "@/components/client-portal/MfaHelp";
import { BackupCodes } from "@/components/client-portal/BackupCodes";
import { friendlyAuthError, sendToSignIn } from "@/lib/client-portal/auth-errors";
import { isSsoSession } from "@/lib/client-portal/sso";

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/client") && !raw.startsWith("//") ? raw : "/client";
}

type Enroll = { factorId: string; qrSvg: string; secret: string } | null;
const PENDING_KEY = "ll-mfa-pending-setup";

function EnrollForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enroll, setEnroll] = useState<Enroll>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [codes, setCodes] = useState<string[] | null>(null);

  const startEnroll = useCallback(async (fresh = false) => {
    setError("");
    setStarting(true);
    const { data: existing, error: listError } = await loveleeday.auth.mfa.listFactors();
    if (listError) {
      setStarting(false);
      const f = friendlyAuthError(listError.message);
      if (f.signedOut) return sendToSignIn(`/client/mfa/enroll?next=${encodeURIComponent(next)}`);
      setError(f.text);
      return;
    }
    // Reloading must not change the code: a person may already have scanned it. Reuse this tab's pending
    // setup while its factor still exists; only then clear leftovers from abandoned attempts.
    let pending: Enroll = null;
    try { pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null"); } catch {}
    const unverified = (existing?.all ?? []).filter((f) => f.factor_type === "totp" && f.status === "unverified");
    if (!fresh && pending && unverified.some((f) => f.id === pending!.factorId)) {
      setEnroll(pending);
      setStarting(false);
      return;
    }
    for (const f of unverified) await loveleeday.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: enrollError } = await loveleeday.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toISOString()}`,
    });
    setStarting(false);
    if (enrollError) {
      const f = friendlyAuthError(enrollError.message);
      if (f.signedOut) return sendToSignIn(`/client/mfa/enroll?next=${encodeURIComponent(next)}`);
      setError(f.text);
      return;
    }
    const e = { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(e)); } catch {}
    setEnroll(e);
  }, [next]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    const { data: userData, error: userError } = await loveleeday.auth.getUser();
    if (userError || !userData.user) {
      window.location.href = `/client/login?next=${encodeURIComponent(next)}`;
      return;
    }
    const { data: aal } = await loveleeday.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && isSsoSession(aal.currentAuthenticationMethods)) {
      // Company sign-in already carries the company's own second factor; the server gate exempts it too.
      window.location.href = next;
      return;
    }
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal2") {
      // Already fully enrolled and verified — nothing to do here.
      window.location.href = next;
      return;
    }
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      // Has a verified factor already, just needs to challenge it.
      window.location.href = `/client/mfa/challenge?next=${encodeURIComponent(next)}`;
      return;
    }
    setLoading(false);
    await startEnroll();
  }, [next, startEnroll]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!enroll || verifying) return;
    setError("");
    setVerifying(true);
    const { data: challenge, error: challengeError } = await loveleeday.auth.mfa.challenge({
      factorId: enroll.factorId,
    });
    const failed = challengeError || null;
    const { error: verifyError } = failed
      ? { error: failed }
      : await loveleeday.auth.mfa.verify({ factorId: enroll.factorId, challengeId: challenge!.id, code: code.trim() });
    if (verifyError) {
      const f = friendlyAuthError(verifyError.message);
      setVerifying(false);
      setCode("");
      if (f.signedOut) return sendToSignIn(`/client/mfa/enroll?next=${encodeURIComponent(next)}`);
      if (/factor.*not found|expired/i.test(verifyError.message)) {
        try { sessionStorage.removeItem(PENDING_KEY); } catch {}
        await startEnroll(true);
      }
      setError(f.text);
      return;
    }
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
    const { data: newCodes } = await loveleeday.rpc("mfa_recovery_codes_generate");
    if (Array.isArray(newCodes) && newCodes.length) {
      setCodes(newCodes as string[]);
      setVerifying(false);
      return;
    }
    window.location.href = next;
  }

  return (
    <AuthShell
      eyebrow="Two-factor authentication"
      headline="Secure your"
      muted="account."
      lead="One-time setup, required for every LOVELEEDAY account. Scan the code once with an authenticator app (Google Authenticator, 1Password or Authy). After this, you'll sign in with your password and the 6-digit code from the app."
    >
          <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)] mb-5">{codes ? "Two-factor is on" : "Scan once and verify"}</h2>

          {codes ? (
            <BackupCodes codes={codes} onDone={() => { window.location.href = next; }} />
          ) : loading || starting || !enroll ? (
            <p className="ll-note">
              {error ? <span className="ll-feedback warn">{error}</span> : "Setting up…"}
            </p>
          ) : (
            <form onSubmit={onVerify} className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <span className="ll-label">1 · Scan this code with your authenticator app</span>
                <div className="bg-white p-3 rounded-lg w-[176px] h-[176px] flex items-center justify-center border border-[var(--line)]">
                  {/* Supabase returns the QR as an inline SVG data URI. */}
                  <img src={enroll.qrSvg} alt="Scan with your authenticator app" width={150} height={150} />
                </div>
                <span className="ll-note">Can&apos;t scan it? Enter this setup key in the app instead:</span>
                <div className="font-mono text-[12px] text-[#36475c] bg-[#fafbfd] border border-[#dce3ed] rounded-lg px-3 py-2 break-all select-all">
                  {enroll.secret}
                </div>
              </div>
              <div className="ll-field">
                <label htmlFor="enroll-code">2 · Enter the 6-digit code the app shows</label>
                <input
                  id="enroll-code"
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                  className={`${inputClass} text-center tracking-[0.4em] !text-[20px] font-mono`}
                  placeholder="000000"
                />
              </div>
              {error && <p className="ll-feedback warn">{error}</p>}
              <PortalButton type="submit" disabled={verifying || code.length < 6} className="w-full">
                {verifying ? "Verifying…" : "Verify and enable"}
              </PortalButton>
            </form>
          )}
          <MfaHelp />
    </AuthShell>
  );
}

export default function ClientMfaEnrollPage() {
  return (
    <Suspense fallback={null}>
      <EnrollForm />
    </Suspense>
  );
}
