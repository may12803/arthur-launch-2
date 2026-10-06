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
  const [copied, setCopied] = useState(false);

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
      eyebrow={null}
      stepper={codes ? 3 : 2}
      headline={codes ? "Save your backup codes" : "Add your authenticator app"}
      lead={codes ? "Your authenticator app is connected. If you ever lose your phone, each of these ten codes signs you in once. This is the only time they are shown." : "Your account needs a code from an authenticator app, such as Google Authenticator, 1Password or Authy, each time you sign in with your password."}
      rail={codes
        ? { kicker: "Account setup", line: "Last step. Then you are in.", steps: 3, brainPosition: "12% 60%" }
        : { kicker: "Account setup", line: "Two steps keep your organization’s work yours.", steps: 2, brainPosition: "88% 40%" }}
      footer={<MfaHelp />}
    >
      {codes ? (
        <BackupCodes codes={codes} onDone={() => { window.location.href = next; }} />
      ) : loading || starting || !enroll ? (
        error ? <p className="ll-feedback warn">{error}</p> : <p className="note" style={{ marginTop: 0 }}>Setting up…</p>
      ) : (
        <form onSubmit={onVerify}>
          <div className="block">
            <p className="step">1. Scan this code with the app</p>
            {/* Supabase returns the QR as an inline SVG data URI. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qrimg" src={enroll.qrSvg} alt="QR code to scan with your authenticator app" width={168} height={168} />
            <p className="note">Can&apos;t scan it? Type this key into the app instead. Keep it private.</p>
            <div className="keyrow">
              <span className="key">{enroll.secret.replace(/(.{4})(?=.)/g, "$1 ")}</span>
              <button type="button" className="ll-secondary sm" onClick={() => { navigator.clipboard?.writeText(enroll.secret); setCopied(true); }}>
                {copied ? "Copied" : "Copy key"}
              </button>
            </div>
          </div>
          <div className="block">
            <label className="step" htmlFor="enroll-code">2. Enter the six-digit code the app shows</label>
            <input
              id="enroll-code"
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              className={`${inputClass} code`}
              placeholder="000000"
            />
            <p className="note">If the code is not accepted, wait for the next one and try again.</p>
          </div>
          {error && <p className="ll-feedback warn">{error}</p>}
          <PortalButton type="submit" disabled={verifying || code.length < 6}>
            {verifying ? "Verifying…" : "Verify code"}
          </PortalButton>
        </form>
      )}
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
