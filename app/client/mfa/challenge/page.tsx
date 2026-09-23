"use client";

import { useState, useEffect, useCallback, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";

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
    <AuthShell
      eyebrow="Two-factor verification"
      headline="One more"
      muted="step."
      lead="Every LOVELEEDAY account is protected by a second factor. Enter the current code from your authenticator app."
    >
          <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">Verification code</h2>
          <p className="ll-note mt-1 mb-6">The 6-digit code from your authenticator app.</p>

          {loading ? (
            <p className="ll-note">Loading…</p>
          ) : (
            <form aria-label="Verification code" onSubmit={onSubmit} className="flex flex-col gap-4">
              <input
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                className={`${inputClass} text-center tracking-[0.4em] !text-[20px] font-mono`}
              />
              {error && <p className="ll-feedback warn">{error}</p>}
              <PortalButton type="submit" disabled={verifying || code.length < 6} className="w-full">
                {verifying ? "Verifying…" : "Verify"}
              </PortalButton>
            </form>
          )}
    </AuthShell>
  );
}

export default function ClientMfaChallengePage() {
  return (
    <Suspense fallback={null}>
      <ChallengeForm />
    </Suspense>
  );
}
