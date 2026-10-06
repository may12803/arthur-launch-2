"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { FormField, PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";
import { emailDomain, ssoRequiredForMe } from "@/lib/client-portal/sso";
import { friendlyAuthError } from "@/lib/client-portal/auth-errors";

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
      headline="Sign in to your workspace"
      lead={mode === "password" ? "Use the email connected to your LOVELEEDAY account. You'll enter your authenticator code next." : "Your organization uses its own sign-in. Enter your work email and we'll send you there."}
      footer={
        <p className="ll-note">
          New here? Open the invitation link in your email to create your account. No invitation yet? Ask the person who manages your organization's account.
        </p>
      }
    >

      <div className="ll-tabs mb-6" role="group" aria-label="Sign-in method">
        <button type="button" aria-pressed={mode === "password"} onClick={() => { setMode("password"); setError(""); }}>
          Email and password
        </button>
        <button type="button" aria-pressed={mode === "sso"} onClick={() => { setMode("sso"); setError(""); }}>
          Sign in with your organization
        </button>
      </div>

      {mode === "sso" ? (
        <form onSubmit={onSso} className="flex flex-col gap-5">
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
              placeholder="name@organization.org"
            />
          </FormField>
          {error && <p className="ll-feedback warn">{error}</p>}
          <PortalButton type="submit" disabled={loading || !email} className="w-full mt-1">
            {loading ? "Redirecting…" : "Continue with single sign-on ↗"}
          </PortalButton>
        </form>
      ) : (
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <FormField label="Email" htmlFor="login-email">
          <input
            id="login-email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </FormField>
        <FormField label="Password" htmlFor="login-password">
          <input
            id="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </FormField>
        {error && <p className="ll-feedback warn">{error}</p>}
        <PortalButton type="submit" disabled={loading || !email || !password} className="w-full mt-1">
          {loading ? "Signing in…" : "Continue"}
        </PortalButton>
        <a href="/client/forgot" className="ll-note underline self-center">Forgot your password?</a>
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
