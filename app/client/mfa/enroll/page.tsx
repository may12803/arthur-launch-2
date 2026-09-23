"use client";

import { useState, useEffect, useCallback, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { Card, PortalButton, inputClass } from "@/components/client-portal/ui";

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
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-7">
          <div className="font-serif italic text-[28px] text-text-active">loveleeday</div>
        </div>
        <Card className="p-8">
          <h1 className="font-serif text-h3 text-text-active mb-1">Set up two-factor authentication</h1>
          <p className="text-small text-text-muted mb-6">
            Required for every Loveleeday account. Scan this with an authenticator app (Google
            Authenticator, 1Password, Authy).
          </p>

          {loading || starting || !enroll ? (
            <p className="text-small text-text-muted">
              {error ? <span className="text-red-600">{error}</span> : "Setting up…"}
            </p>
          ) : (
            <form onSubmit={onVerify} className="flex flex-col gap-4">
              <div className="bg-white p-3 rounded-[var(--radius-panel)] w-[176px] h-[176px] flex items-center justify-center border border-glass-border">
                {/* Supabase returns the QR as an inline SVG data URI. */}
                <img src={enroll.qrSvg} alt="Scan with your authenticator app" width={150} height={150} />
              </div>
              <div className="font-mono text-[12px] text-text-active bg-[var(--glass-bg-faint)] border border-glass-border rounded-[var(--radius-panel)] px-3 py-2 break-all">
                {enroll.secret}
              </div>
              <label htmlFor="enroll-code" className="text-[13px] font-medium text-text-main">
                6-digit code from your app
              </label>
              <input
                id="enroll-code"
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                className={`${inputClass} text-center tracking-[0.4em] text-[20px] font-mono w-[160px]`}
              />
              {error && <p className="text-small text-red-600">{error}</p>}
              <PortalButton type="submit" disabled={verifying || code.length < 6}>
                {verifying ? "Verifying…" : "Verify and enable"}
              </PortalButton>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ClientMfaEnrollPage() {
  return (
    <Suspense fallback={null}>
      <EnrollForm />
    </Suspense>
  );
}
