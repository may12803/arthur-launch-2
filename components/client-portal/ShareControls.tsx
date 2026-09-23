"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { PortalButton, inputClass } from "./ui";

export type ShareRow = { id: string; recipient_email: string; expires_at: string; open_count: number; revoked_at: string | null };

// Per-document outside sharing: a named recipient, a day limit, and the list of
// that document's live links with revoke.
export function ShareControls({ documentId, shares, maxDays }: { documentId: string; shares: ShareRow[]; maxDays: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [days, setDays] = useState(Math.min(7, maxDays));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const live = shares.filter((s) => !s.revoked_at && new Date(s.expires_at) > new Date());

  async function share(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/client/documents/${documentId}/share`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, days }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ tone: "warn", text: data.error || "Couldn't share it. Try again." }); return; }
    setMsg({ tone: "ok", text: data.emailed ? `Link sent to ${email}.` : `Link created, but the email didn't send. Try sharing again.` });
    setEmail("");
    router.refresh();
  }

  async function revoke(id: string) {
    await fetch(`/api/client/shares/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="w-full">
      {!open ? (
        <button type="button" className="ll-text-link" onClick={() => setOpen(true)}>
          Share outside{live.length ? ` (${live.length})` : ""}
        </button>
      ) : (
        <div className="mt-3 flex flex-col gap-3 rounded-xl border border-[var(--line)] p-4">
          <form onSubmit={share} className="flex flex-wrap items-end gap-3">
            <div className="ll-field flex-1 min-w-[200px]">
              <label htmlFor={`share-email-${documentId}`}>Recipient&apos;s email</label>
              <input id={`share-email-${documentId}`} type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="auditor@firm.com" className={inputClass} />
            </div>
            <div className="ll-field w-[120px]">
              <label htmlFor={`share-days-${documentId}`}>Works for</label>
              <select id={`share-days-${documentId}`} value={days} onChange={(e) => setDays(Number(e.target.value))} className={inputClass}>
                {[1, 3, 7, 14, 30].filter((d) => d <= maxDays).map((d) => <option key={d} value={d}>{d} day{d === 1 ? "" : "s"}</option>)}
              </select>
            </div>
            <PortalButton type="submit" disabled={busy || !email}>{busy ? "Sending…" : "Send link"}</PortalButton>
          </form>
          <p className="ll-note">They confirm a one-time code sent to that address before the file opens. Every open is recorded.</p>
          {msg && <p className={`ll-feedback ${msg.tone}`}>{msg.text}</p>}
          {live.length > 0 && (
            <ul className="flex flex-col gap-2 border-t border-[var(--line)] pt-3">
              {live.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
                  <span className="text-[var(--ink)]">{s.recipient_email}</span>
                  <span className="text-[var(--muted)]">
                    until {new Date(s.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · opened {s.open_count}×
                    <button type="button" className="ll-text-link ml-3" onClick={() => revoke(s.id)}>Revoke</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="text-[12px] text-[var(--muted)] self-start" onClick={() => setOpen(false)}>Close</button>
        </div>
      )}
    </div>
  );
}

export function SharingSwitch({ enabled, regulated }: { enabled: boolean; regulated: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    await fetch("/api/client/settings/sharing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !enabled }) });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="text-[15px] text-[var(--ink)]">Sharing outside your company is {enabled ? "on" : "off"}</div>
        <p className="ll-note mt-1">
          {regulated ? "Your account is classified as regulated data: links last at most 7 days. " : "Links last at most 30 days. "}
          Turning sharing off revokes every outside link at once.
        </p>
      </div>
      <PortalButton variant="secondary" onClick={toggle} disabled={busy}>{busy ? "Saving…" : enabled ? "Turn off" : "Turn on"}</PortalButton>
    </div>
  );
}
