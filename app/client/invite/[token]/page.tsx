"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { loveleeday } from "@/lib/supabase/loveleeday";
import { PortalButton, FormField, inputClass } from "@/components/client-portal/ui";
import { AuthShell } from "@/components/client-portal/AuthShell";
import { isSsoSession } from "@/lib/client-portal/sso";
import { friendlyAuthError } from "@/lib/client-portal/auth-errors";
import { ROLE_HELP } from "@/lib/client-portal/team";

// One example per surface (VOICE.md in the site repo): this question appears nowhere else.
const INVITE_EXAMPLE = {
  ask: "Which shifts next week still need someone?",
  answer: "Four shifts are open, two of them on Saturday.",
  next: "Ask the three people who picked up extra shifts last month.",
};

type Preview = { tenant_name: string; role: string; expired: boolean; email_hint?: string | null; inviter_name?: string | null } | "invalid" | null;

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
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  // A clean answer with no row means no open invite carries this token: unknown, already used, or withdrawn.
  return row || "invalid";
}

function friendlyAcceptError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("not found") && m.includes("used")) return "This invite can't be used: it may have expired, already been accepted, or been withdrawn. Ask your contact to send a new one.";
  if (m.includes("expired")) return "This invite has expired. Ask your contact to send a new one.";
  if (m.includes("not found") || m.includes("invalid")) return "This invite link isn't valid. Check that you copied the whole link.";
  if (m.includes("different email")) return "This invite was sent to a different email address than the account you're signed in with. Use the account the invite was sent to.";
  if (m.includes("confirm your email")) return "Confirm your email address first (check your inbox for our message), then open this invite again.";
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
  const [fullName, setFullName] = useState("");
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

  async function switchAccount() {
    await loveleeday.auth.signOut();
    setAuthedEmail(null);
    setError("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");

    if (mode === "signup") {
      // Accounts are created on the server against this invite (public sign-up is off), then signed in here.
      const res = await fetch("/api/client/invite/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, email, password, name: fullName }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "We couldn't create your account. Try again.");
        setSubmitting(false);
        return;
      }
      if (j.exists) {
        setError("You already have an account with that email. Choose \"I have an account\" and sign in.");
        setSubmitting(false);
        return;
      }
      const { error: signInError } = await loveleeday.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(friendlyAuthError(signInError.message).text);
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

  const invalidRail = { kicker: "Invitation", line: "Invitations are tied to one email address, so only the right person can join." };

  if (checkingSession || !previewChecked) {
    return (
      <AuthShell pill={{ text: "Invitation" }} headline="Opening your invitation" rail={invalidRail}>
        <p className="note" style={{ marginTop: 0 }}>Loading…</p>
      </AuthShell>
    );
  }

  const info = preview === "invalid" ? null : preview;
  if ((preview === "invalid" && !authedEmail) || info?.expired) {
    const expired = !!info?.expired;
    return (
      <AuthShell
        pill={{ text: "Invitation", warn: true }}
        headline={expired ? "This invitation has expired" : "This invitation can’t be used"}
        lead={expired ? `Invitations last seven days. Ask the person who invited you to send a new one to join ${info!.tenant_name}.` : "It may be incomplete, already accepted, expired or withdrawn."}
        rail={invalidRail}
        footer={<ul className="links"><li><a href="mailto:hello@loveleedaystudios.com">Get help</a></li></ul>}
      >
        <div className="box" style={{ marginTop: 0 }}>
          <b>What to do</b>
          <ul className="steps-plain">
            <li>Already joined? Sign in below.</li>
            <li>Need a new invitation? Ask the person who invited you to send one.</li>
          </ul>
        </div>
        <div className="stack" style={{ marginTop: 24 }}>
          <a href="/client/login" className="ll-primary">Sign in</a>
        </div>
      </AuthShell>
    );
  }

  const roleName = info ? info.role.charAt(0).toUpperCase() + info.role.slice(1) : "";
  const initials = info ? info.tenant_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") : "";

  return (
    <AuthShell
      eyebrow={null}
      stepper={1}
      headline={info ? `Join ${info.tenant_name}` : "You’ve been invited"}
      photo={{
        src: "/brand/auth/invite-photo.jpg",
        tag: info ? `${info.tenant_name} uses LOVELEEDAY to see its answers and work in one place.` : "Your organization uses LOVELEEDAY to see its answers and work in one place.",
        example: INVITE_EXAMPLE,
      }}
      footer={
        !authedEmail && !awaitingConfirmation ? (
          <p className="note">
            {mode === "signup" ? "Already have an account with this email? " : "New to LOVELEEDAY? "}
            <button type="button" className="linkbtn" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); }}>
              {mode === "signup" ? "Sign in to accept" : "Create an account instead"}
            </button>
          </p>
        ) : null
      }
    >
      {info && (
        <div className="box" style={{ marginTop: 0 }}>
          <div className="org">
            <div className="av" aria-hidden>{initials}</div>
            <div>
              <b>{info.tenant_name}</b>
              <small>{info.inviter_name ? <>{info.inviter_name} invited you as a <b>{roleName}</b></> : <>You are invited as a <b>{roleName}</b></>}</small>
            </div>
          </div>
          {ROLE_HELP[info.role] && <p className="role">{ROLE_HELP[info.role]} An admin can change your role later.</p>}
        </div>
      )}
      {awaitingConfirmation ? (
        <>
          <p className="lead"><b>Check your email.</b> We sent a confirmation link to {email}. Confirm it, then open this invitation link again to finish joining.</p>
        </>
      ) : authedEmail ? (
        <>
          <p className="lead">You are signed in as <b>{authedEmail}</b>.{info ? ` Accept to join ${info.tenant_name} as ${roleName}.` : ""}</p>
          <div className="stack" style={{ marginTop: 24 }}>
            {error && <p className="ll-feedback warn">{error}</p>}
            <PortalButton onClick={finishAccept} disabled={submitting}>
              {submitting ? "Joining…" : "Accept invitation"}
            </PortalButton>
            <button type="button" className="linkbtn" onClick={switchAccount}>
              Not {authedEmail}? Sign out and use a different account
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="lead">
            {info?.email_hint ? <>This invitation was sent to <b>{info.email_hint}</b> and only works with that address.</> : "Use the email this invitation was sent to. It only works with that address."}
          </p>
          <form onSubmit={onSubmit} style={{ marginTop: 24 }}>
            {mode === "signup" && (
              <FormField label="Your name" htmlFor="invite-name">
                <input
                  id="invite-name"
                  type="text"
                  autoComplete="name"
                  maxLength={80}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                  placeholder="First and last name"
                />
              </FormField>
            )}
            <FormField label="Email" htmlFor="invite-email">
              <input
                id="invite-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="name@organization.com"
              />
            </FormField>
            <FormField label={mode === "signup" ? "Create a password" : "Password"} htmlFor="invite-password">
              <input
                id="invite-password"
                type="password"
                required
                minLength={mode === "signup" ? 12 : undefined}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                placeholder={mode === "signup" ? "At least 12 characters" : "Your password"}
              />
            </FormField>
            {error && <p className="ll-feedback warn">{error}</p>}
            <PortalButton type="submit" disabled={submitting || !email || !password}>
              {submitting ? "Working…" : mode === "signup" ? "Create account and continue" : "Sign in and accept"}
            </PortalButton>
          </form>
        </>
      )}
    </AuthShell>
  );
}
