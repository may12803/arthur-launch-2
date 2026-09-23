"use client";

import { useState, useEffect, useCallback, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { Card, PortalButton, inputClass } from "@/components/client-portal/ui";

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/client") && !raw.startsWith("//") ? raw : "/client";
}

function ChallengeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError("");

    const { data: userData, error: userError } = await loveleeday.auth.getUser();
    if (userError || !userData.user) {
      window.location.href = `/client/login?next=${encodeURIComponent(next)}`;
      return;
    }

    const { data: aal, error: aalError } = await loveleeday.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) {
      setError("Could not read your sign-in level. Try again.");
      setLoading(false);
      return;
    }
    if (aal.nextLevel !== "aal2") {
      router.replace(`/client/mfa/enroll?next=${encodeURIComponent(next)}`);
      return;
    }
    if (aal.currentLevel === "aal2") {
      router.replace(next);
      return;
    }

    const { data: factorsData, error: factorsError } = await loveleeday.auth.mfa.listFactors();
    if (factorsError) {
      setError(factorsError.message);
      setLoading(false);
      return;
    }
    const verifiedTotp = factorsData.totp.find((f) => f.status === "verified");
    if (!verifiedTotp) {
      router.replace(`/client/mfa/enroll?next=${encodeURIComponent(next)}`);
      return;
    }

    const { data: challenge, error: challengeError } = await loveleeday.auth.mfa.challenge({
      factorId: verifiedTotp.id,
    });
    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    setFactorId(verifiedTotp.id);
    setChallengeId(challenge.id);
    setLoading(false);
  }, [next, router]);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!factorId || !challengeId || verifying) return;
    setError("");
    setVerifying(true);
    const { error: verifyError } = await loveleeday.auth.mfa.verify({
      factorId,
      challengeId,
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
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-7">
          <div className="font-serif italic text-[28px] text-text-active">loveleeday</div>
        </div>
        <Card className="p-8">
          <h1 className="font-serif text-h3 text-text-active mb-1">Two-factor verification</h1>
          <p className="text-small text-text-muted mb-6">
            Enter the 6-digit code from your authenticator app.
          </p>

          {loading ? (
            <p className="text-small text-text-muted">Loading…</p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                className={`${inputClass} text-center tracking-[0.4em] text-[20px] font-mono`}
              />
              {error && <p className="text-small text-red-600">{error}</p>}
              <PortalButton type="submit" disabled={verifying || code.length < 6} className="w-full">
                {verifying ? "Verifying…" : "Verify"}
              </PortalButton>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ClientMfaChallengePage() {
  return (
    <Suspense fallback={null}>
      <ChallengeForm />
    </Suspense>
  );
}
