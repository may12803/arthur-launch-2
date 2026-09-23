"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { FormField, PortalButton, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/client") && !raw.startsWith("//") ? raw : "/client";
}

function LoginForm() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      <p className="ll-note mt-1 mb-6">Two-factor verification follows your password.</p>

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
