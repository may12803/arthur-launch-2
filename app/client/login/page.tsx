"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { FormField, PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";
import { emailDomain } from "@/lib/client-portal/sso";

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
      setError(signInError.message || "That email and password didn't match.");
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
      headline="Your work,"
      muted="in one place."
      lead="Deliverables, contracts and billing for your LOVELEEDAY engagement — every figure sourced, every change dated."
      footer={
        <p className="ll-note">
          New here? Use the invite link your contact sent you to create your account.
        </p>
      }
    >
      <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">Sign in</h2>
      <p className="ll-note mt-1 mb-5">
        {mode === "password"
          ? "Two-factor verification follows your password."
          : "You'll continue to your organization's sign-in page."}
      </p>

      <div className="ll-tabs mb-6" role="group" aria-label="Sign-in method">
        <button type="button" aria-pressed={mode === "password"} onClick={() => { setMode("password"); setError(""); }}>
          Email and password
        </button>
        <button type="button" aria-pressed={mode === "sso"} onClick={() => { setMode("sso"); setError(""); }}>
          Single sign-on
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
          {loading ? "Signing in…" : "Sign in"}
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
