"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { Card, FormField, PortalButton, inputClass } from "@/components/client-portal/ui";

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
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-7">
          <div className="font-serif italic text-[28px] text-text-active">loveleeday</div>
          <p className="text-small text-text-muted mt-1">Client portal</p>
        </div>

        <Card className="p-8">
          <h1 className="font-serif text-h3 text-text-active mb-1">Sign in</h1>
          <p className="text-small text-text-muted mb-6">Access your Loveleeday account.</p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
            {error && <p className="text-small text-red-600">{error}</p>}
            <PortalButton type="submit" disabled={loading || !email || !password} className="w-full mt-1">
              {loading ? "Signing in…" : "Sign in"}
            </PortalButton>
          </form>
        </Card>

        <p className="text-small text-text-muted text-center mt-5">
          New to Loveleeday? Use the invite link your contact sent you to create your account.
        </p>
      </div>
    </div>
  );
}

export default function ClientLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
