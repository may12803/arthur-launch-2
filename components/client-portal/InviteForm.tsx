"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, FormField, PortalButton, inputClass } from "./ui";

export function InviteForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setInviteLink(null);
    try {
      const res = await fetch("/api/client/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't send that invite.");
        setSubmitting(false);
        return;
      }
      setInviteLink(`${window.location.origin}/client/invite/${data.invite.token}`);
      setEmail("");
      router.refresh();
    } catch {
      setError("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6">
      <h2 className="font-serif text-h3 text-text-active mb-4">Invite a teammate</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-4 max-w-[420px]">
        <FormField label="Email" htmlFor="invite-email">
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="teammate@company.com"
          />
        </FormField>
        <FormField label="Role" htmlFor="invite-role">
          <select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className={inputClass}
          >
            <option value="viewer">Viewer</option>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </FormField>
        {error && <p className="text-small text-red-600">{error}</p>}
        {inviteLink && (
          <div className="text-small text-text-main">
            Invite created. Share this link:{" "}
            <span className="font-mono text-[12px] break-all">{inviteLink}</span>
          </div>
        )}
        <div>
          <PortalButton type="submit" disabled={submitting || !email}>
            {submitting ? "Sending…" : "Send invite"}
          </PortalButton>
        </div>
      </form>
    </Card>
  );
}
