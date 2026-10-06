"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { FormField, PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";
import { emailDomain, ssoRequiredForMe } from "@/lib/client-portal/sso";
import { friendlyAuthError } from "@/lib/client-portal/auth-errors";

// One example per surface (VOICE.md in the site repo): this question appears nowhere else.
const LOGIN_EXAMPLE = {
  ask: "Which budget lines are on pace to run over before the year ends?",
  answer: "Two lines, software and substitute staffing, are at 80% with a third of the year left.",
  next: "Move the spring purchases or shift funds before March.",
};

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/client") && !raw.startsWith("//") ? raw : "/client";
}

function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [mode, setMode] = useState<"password" | "sso">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("error") || "");
  const [loading, setLoading] = useState(false);

  // SAML SSO for institutions whose accounts are managed centrally. The
  // provider is registered per email domain on the loveleeday project; a
  // domain with no provider gets a plain answer, not a raw API error.
  async function onSso(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");
    const domain = emailDomain(email);
    if (!domain) {
      setError("Enter your work email address.");
      return;
    }
    setLoading(true);
    const redirectTo = `${window.location.origin}/client/auth/callback?next=${encodeURIComponent(next)}`;
    const { data, error: ssoError } = await loveleeday.auth.signInWithSSO({ domain, options: { redirectTo } });
    if (ssoError || !data?.url) {
      setError(
        `${domain} isn't set up for single sign-on with LOVELEEDAY yet. Sign in with your password, or ask your contact to connect your organization.`
      );
      setLoading(false);
      return;
    }
    window.location.href = data.url;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    const { error: signInError } = await loveleeday.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(friendlyAuthError(signInError.message).text);
      setLoading(false);
      return;
    }

    let ssoRequired = false;
    try {
      ssoRequired = await ssoRequiredForMe(loveleeday);
    } catch (cause) {
      await loveleeday.auth.signOut();
      setError(cause instanceof Error ? cause.message : "Sign-in rules could not be checked. Try again.");
      setLoading(false);
      return;
    }
    if (ssoRequired) {
      await loveleeday.auth.signOut();
      setMode("sso");
      setError("Your company signs in with single sign-on.");
      setLoading(false);
      return;
    }

    const { data: aal, error: aalError } = await loveleeday.auth.mfa.getAuthenticatorAssuranceLevel();
    const nextParam = `?next=${encodeURIComponent(next)}`;
    if (!aalError && aal) {
      if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        window.location.href = `/client/mfa/challenge${nextParam}`;
        return;
      }
      if (aal.nextLevel !== "aal2") {
        window.location.href = `/client/mfa/enroll${nextParam}`;
        return;
      }
    }
    window.location.href = next;
  }

  return (
    <AuthShell
      headline="Sign in"
      lead={mode === "password" ? "Use the email connected to your LOVELEEDAY account. Next, you will enter the code from your authenticator app." : "Your organization uses its own sign-in. Enter your work email and we will take you there."}
      photo={{ src: "/brand/auth/login-photo.jpg", tag: "Your answers, your work and what needs your decision, in one place.", example: LOGIN_EXAMPLE }}
      footer={
        <>
          <div className="alt">
            {mode === "password" ? (
              <>
                <span>Does your organization use its own sign-in?</span>{" "}
                <button type="button" className="linkbtn" onClick={() => { setMode("sso"); setError(""); }}>Sign in through your organization</button>
              </>
            ) : (
              <button type="button" className="linkbtn" onClick={() => { setMode("password"); setError(""); }}>Sign in with your email and password instead</button>
            )}
          </div>
          <p className="note">New here? Open the invitation link in your email to create your account.</p>
        </>
      }
    >
      {mode === "sso" ? (
        <form onSubmit={onSso}>
          <FormField label="Work email" htmlFor="sso-email">
            <input
              id="sso-email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="name@organization.com"
            />
          </FormField>
          {error && <p className="ll-feedback warn">{error}</p>}
          <PortalButton type="submit" disabled={loading || !email}>
            {loading ? "Redirecting…" : "Continue with your organization"}
          </PortalButton>
        </form>
      ) : (
        <form onSubmit={onSubmit}>
          <FormField label="Work email" htmlFor="login-email">
            <input
              id="login-email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="name@organization.com"
            />
          </FormField>
          <div className="ll-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="Your password"
            />
            <a href="/client/forgot" className="under">Forgot your password?</a>
          </div>
          {error && <p className="ll-feedback warn">{error}</p>}
          <PortalButton type="submit" disabled={loading || !email || !password}>
            {loading ? "Signing in…" : "Continue"}
          </PortalButton>
        </form>
      )}
    </AuthShell>
  );
}

export default function ClientLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
