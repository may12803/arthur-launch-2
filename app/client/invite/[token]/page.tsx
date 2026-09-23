"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { Card, PortalButton, FormField, inputClass } from "@/components/client-portal/ui";

type Preview = { tenant_name: string; role: string; expired: boolean } | null;

// `get_invite_preview(p_token text)` is a SECURITY DEFINER RPC granted to
// anon, so this call works before the visitor has any session — it shows
// the inviting company + role, and flags an expired token, before the
// signup form ever renders. `invites` itself still has no anon/public
// SELECT policy (only invites_admin_manage, scoped to an accepted
// owner/admin of the tenant); the RPC is the sanctioned narrow read. A
// failed call (network blip, bad deploy) falls back to generic copy — it
// never blocks the actual accept flow, which goes through accept_invite()
// below regardless of whether the preview loaded.
async function fetchPreview(token: string): Promise<Preview> {
  const { data, error } = await loveleeday.rpc("get_invite_preview", { p_token: token });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

function friendlyAcceptError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("expired")) return "This invite has expired. Ask your contact to send a new one.";
  if (m.includes("not found") || m.includes("invalid")) return "This invite link isn't valid. Check that you copied the whole link.";
  if (m.includes("already") || m.includes("accepted")) return "This invite has already been used. Try signing in instead.";
  return message || "Couldn't accept this invite.";
}

export default function InvitePage({ params }: { params: { token: string } }) {
  const { token } = params;

  const [preview, setPreview] = useState<Preview>(null);
  const [previewChecked, setPreviewChecked] = useState(false);
  const [authedEmail, setAuthedEmail] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  useEffect(() => {
    fetchPreview(token).then((p) => {
      setPreview(p);
      setPreviewChecked(true);
    });
    loveleeday.auth.getUser().then(({ data }) => {
      setAuthedEmail(data.user?.email ?? null);
      setCheckingSession(false);
    });
  }, [token]);

  const finishAccept = useCallback(async () => {
    setSubmitting(true);
    setError("");
    const { error: acceptError } = await loveleeday.rpc("accept_invite", { p_token: token });
    if (acceptError) {
      setError(friendlyAcceptError(acceptError.message));
      setSubmitting(false);
      return;
    }
    const { data: aal } = await loveleeday.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel !== "aal2") {
      window.location.href = "/client/mfa/enroll";
      return;
    }
    window.location.href = "/client";
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    if (mode === "signup") {
      const { data, error: signUpError } = await loveleeday.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        setSubmitting(false);
        return;
      }
      if (!data.session) {
        // Email confirmation is required before a session exists — the
        // invite is still pending, come back to this same link afterward.
        setAwaitingConfirmation(true);
        setSubmitting(false);
        return;
      }
    } else {
      const { error: signInError } = await loveleeday.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message || "That email and password didn't match.");
        setSubmitting(false);
        return;
      }
    }

    await finishAccept();
  }

  if (checkingSession || !previewChecked) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-6 font-sans">
        <p className="text-small text-text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-[440px]">
        <div className="text-center mb-7">
          <div className="font-serif italic text-[28px] text-text-active">loveleeday</div>
        </div>

        <Card className="p-8">
          {preview?.expired ? (
            <>
              <h1 className="font-serif text-h3 text-text-active mb-1">This invite has expired</h1>
              <p className="text-small text-text-muted">
                Your invite to join {preview.tenant_name} on Loveleeday as {preview.role} is no longer
                valid. Ask your contact there to send a new one.
              </p>
            </>
          ) : (
            <>
          <h1 className="font-serif text-h3 text-text-active mb-1">You&apos;re invited</h1>
          <p className="text-small text-text-muted mb-6">
            {preview
              ? `Join ${preview.tenant_name} on Loveleeday as ${preview.role}.`
              : "Join your company's Loveleeday account."}
          </p>

          {awaitingConfirmation && (
            <p className="text-small text-text-main">
              Check {email} for a confirmation link, then open this invite link again to finish joining.
            </p>
          )}

          {!awaitingConfirmation && authedEmail && (
            <div className="flex flex-col gap-4">
              <p className="text-small text-text-main">
                Signed in as <span className="font-medium">{authedEmail}</span>.
              </p>
              {error && <p className="text-small text-red-600">{error}</p>}
              <PortalButton onClick={finishAccept} disabled={submitting}>
                {submitting ? "Joining…" : "Accept invite"}
              </PortalButton>
            </div>
          )}

          {!awaitingConfirmation && !authedEmail && (
            <>
              <div className="flex gap-1 mb-5 bg-[var(--glass-bg-faint)] rounded-[var(--radius-pill)] p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className={`px-3.5 py-1.5 text-[12.5px] font-medium rounded-[var(--radius-pill)] ${
                    mode === "signup" ? "bg-accent-orange text-accent-text-on" : "text-text-muted"
                  }`}
                >
                  New account
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className={`px-3.5 py-1.5 text-[12.5px] font-medium rounded-[var(--radius-pill)] ${
                    mode === "signin" ? "bg-accent-orange text-accent-text-on" : "text-text-muted"
                  }`}
                >
                  I have an account
                </button>
              </div>

              <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <FormField label="Email" htmlFor="invite-email">
                  <input
                    id="invite-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Password" htmlFor="invite-password">
                  <input
                    id="invite-password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={inputClass}
                  />
                </FormField>
                {error && <p className="text-small text-red-600">{error}</p>}
                <PortalButton type="submit" disabled={submitting || !email || !password}>
                  {submitting ? "Working…" : mode === "signup" ? "Create account & join" : "Sign in & join"}
                </PortalButton>
              </form>
            </>
          )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
