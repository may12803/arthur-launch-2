"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { PortalButton, FormField, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";
import { isSsoSession } from "@/lib/client-portal/sso";

type Preview = { tenant_name: string; role: string; expired: boolean; email_hint?: string | null } | null;

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
    if (aal && aal.nextLevel !== "aal2" && !isSsoSession(aal.currentAuthenticationMethods)) {
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
      <AuthShell eyebrow="Invitation" headline="Opening your" muted="invitation.">
        <p className="ll-note">Loading…</p>
      </AuthShell>
    );
  }

  if (preview?.expired) {
    return (
      <AuthShell
        eyebrow="Invitation"
        headline="This invite"
        muted="has expired."
        lead="Invites carry a short window on purpose. Ask your contact to send a fresh link."
      >
        <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">Link no longer valid</h2>
        <p className="ll-note mt-2">
          Your invite to join {preview.tenant_name} as {preview.role} can&apos;t be used any more. Ask your
          contact there to send a new one.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Invitation"
      headline={preview ? `Join ${preview.tenant_name}` : "You've been"}
      muted={preview ? "on LOVELEEDAY." : "invited."}
      lead={
        preview
          ? `You've been invited as ${preview.role}. Create your account to see the deliverables, contracts and billing for this engagement.`
          : "Create your account to join your company's LOVELEEDAY client portal."
      }
      footer={<p className="ll-note">Two-factor authentication is set up right after, for every account.</p>}
    >
      {awaitingConfirmation ? (
        <>
          <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">Check your email</h2>
          <p className="ll-note mt-2">
            We sent a confirmation link to {email}. Confirm it, then open this invite link again to finish joining.
          </p>
        </>
      ) : authedEmail ? (
        <div className="flex flex-col gap-5">
          <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">Accept invite</h2>
          <p className="ll-note -mt-3">
            Signed in as <span className="text-[var(--ink)]">{authedEmail}</span>.
          </p>
          {error && <p className="ll-feedback warn">{error}</p>}
          <PortalButton onClick={finishAccept} disabled={submitting} className="w-full">
            {submitting ? "Joining…" : "Accept invite"}
          </PortalButton>
        </div>
      ) : (
        <>
          {preview?.email_hint && (
            <p className="ll-note mb-5">
              This invitation is for <span className="text-[var(--ink)]">{preview.email_hint}</span>. Use that
              address, since the invite only works for it.
            </p>
          )}
          <div className="ll-tabs mb-6" role="group" aria-label="Account">
            <button type="button" aria-pressed={mode === "signup"} onClick={() => setMode("signup")}>
              New account
            </button>
            <button type="button" aria-pressed={mode === "signin"} onClick={() => setMode("signin")}>
              I have an account
            </button>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <FormField label="Email" htmlFor="invite-email">
              <input
                id="invite-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="name@company.com"
              />
            </FormField>
            <FormField label={mode === "signup" ? "Choose a password" : "Password"} htmlFor="invite-password">
              <input
                id="invite-password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder={mode === "signup" ? "At least 8 characters" : undefined}
              />
            </FormField>
            {error && <p className="ll-feedback warn">{error}</p>}
            <PortalButton type="submit" disabled={submitting || !email || !password} className="w-full mt-1">
              {submitting ? "Working…" : mode === "signup" ? "Create account and join ↗" : "Sign in and join ↗"}
            </PortalButton>
          </form>
        </>
      )}
    </AuthShell>
  );
}
