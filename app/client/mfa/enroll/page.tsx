"use client";

import { useState, useEffect, useCallback, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/client") && !raw.startsWith("//") ? raw : "/client";
}

type Enroll = { factorId: string; qrSvg: string; secret: string } | null;

function EnrollForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enroll, setEnroll] = useState<Enroll>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const startEnroll = useCallback(async () => {
    setError("");
    setStarting(true);
    const { data, error: enrollError } = await loveleeday.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
    });
    setStarting(false);
    if (enrollError) {
      setError(enrollError.message);
      return;
    }
    setEnroll({ factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret });
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    const { data: userData, error: userError } = await loveleeday.auth.getUser();
    if (userError || !userData.user) {
      window.location.href = `/client/login?next=${encodeURIComponent(next)}`;
      return;
    }
    const { data: aal } = await loveleeday.auth.mfa.getAuthenticatorAssuranceLevel();
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
    if (challengeError) {
      setError(challengeError.message);
      setVerifying(false);
      return;
    }
    const { error: verifyError } = await loveleeday.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (verifyError) {
      setError(verifyError.message || "That code didn't match. Try again.");
      setVerifying(false);
      setCode("");
      return;
    }
    window.location.href = next;
  }

  return (
    <AuthShell
      eyebrow="Two-factor authentication"
      headline="Secure your"
      muted="account."
      lead="Required for every LOVELEEDAY account. Scan the code with an authenticator app — Google Authenticator, 1Password or Authy — then enter the 6-digit code it shows."
    >
          <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)] mb-5">Scan and verify</h2>

          {loading || starting || !enroll ? (
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
