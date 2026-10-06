"use client";

import { useState, useEffect, useCallback, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";
import { MfaHelp } from "@/components/client-portal/MfaHelp";
import { friendlyAuthError, sendToSignIn } from "@/lib/client-portal/auth-errors";

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
  const [useBackup, setUseBackup] = useState(false);
  const [backup, setBackup] = useState("");

  const bootstrap = useCallback(async (keepError = false) => {
    setLoading(true);
    if (!keepError) setError("");

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
      const f = friendlyAuthError(factorsError.message);
      if (f.signedOut) return sendToSignIn(next);
      setError(f.text);
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
      const f = friendlyAuthError(challengeError.message);
      if (f.signedOut) return sendToSignIn(next);
      setError(f.text);
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
      const f = friendlyAuthError(verifyError.message);
      if (f.signedOut) return sendToSignIn(next);
      setError(f.text);
      setVerifying(false);
      setCode("");
      // A challenge is single-use and expires; get a fresh one so the next attempt can succeed.
      bootstrap(true);
      return;
    }
    window.location.href = next;
  }

  async function onBackup(e: FormEvent) {
    e.preventDefault();
    if (verifying) return;
    setError("");
    setVerifying(true);
    const { data: ok, error: rpcError } = await loveleeday.rpc("mfa_recovery_redeem", { p_code: backup.trim() });
    setVerifying(false);
    if (rpcError) {
      const f = friendlyAuthError(rpcError.message);
      if (f.signedOut) return sendToSignIn(next);
      setError(f.text);
      return;
    }
    if (!ok) {
      setError("That backup code didn't match, or it's already been used.");
      return;
    }
    // The code removed the lost authenticator; set up the new phone now.
    await loveleeday.auth.refreshSession();
    window.location.href = `/client/mfa/enroll?next=${encodeURIComponent(next)}`;
  }

  return (
    <AuthShell
      eyebrow="Sign in"
      headline={useBackup ? "Enter a backup code" : "Enter the code from your authenticator app"}
      lead={useBackup
        ? "Use one of the ten backup codes you saved when you set up two-factor. It works once, then you will set up your new phone."
        : "Open the app and enter the six-digit code shown for LOVELEEDAY. It changes every 30 seconds."}
      rail={{ kicker: "Sign in", line: "A second check keeps your work private.", tips: ["Open your authenticator app", "Find the LOVELEEDAY entry", "Enter the six digits it shows"] }}
      footer={<MfaHelp />}
    >
      {useBackup ? (
        <form aria-label="Backup code" onSubmit={onBackup}>
          <div className="ll-field">
            <label htmlFor="backup-code">Backup code</label>
            <input
              id="backup-code"
              autoFocus
              autoComplete="off"
              value={backup}
              onChange={(e) => setBackup(e.target.value)}
              placeholder="XXXXX-XXXXX"
              className={`${inputClass} code`}
              style={{ textTransform: "uppercase", letterSpacing: ".2em", fontSize: 18 }}
            />
          </div>
          {error && <p className="ll-feedback warn">{error}</p>}
          <PortalButton type="submit" disabled={verifying || backup.replace(/[^0-9a-f]/gi, "").length < 10}>
            {verifying ? "Checking…" : "Use backup code"}
          </PortalButton>
          <ul className="links" style={{ marginTop: 2 }}>
            <li><button type="button" className="linkbtn" onClick={() => { setUseBackup(false); setError(""); }}>Use my authenticator app instead</button></li>
          </ul>
        </form>
      ) : loading ? (
        <p className="note" style={{ marginTop: 0 }}>Loading…</p>
      ) : (
        <form aria-label="Verification code" onSubmit={onSubmit}>
          <div className="ll-field">
            <label htmlFor="challenge-code">Six-digit code</label>
            <input
              id="challenge-code"
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
          </div>
          {error && <p className="ll-feedback warn">{error}</p>}
          <PortalButton type="submit" disabled={verifying || code.length < 6 || !factorId || !challengeId}>
            {verifying ? "Verifying…" : "Verify and sign in"}
          </PortalButton>
          {(!factorId || !challengeId) && (
            <PortalButton type="button" variant="secondary" onClick={() => bootstrap()}>Try again</PortalButton>
          )}
          <ul className="links" style={{ marginTop: 2 }}>
            <li><button type="button" className="linkbtn" onClick={() => { setUseBackup(true); setError(""); }}>Use a backup code instead</button></li>
          </ul>
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
