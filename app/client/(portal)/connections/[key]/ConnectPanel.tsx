"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eyebrow } from "@/components/client-portal/ui";
import type { ConnStatus } from "@/lib/client-portal/connections";

type C = { key: string; name: string; method: "oauth" | "invite" | "key"; invite_steps: string | null; key_fields: { name: string; label: string; hint?: string }[] | null; key_help: string | null; oneclick_ready: boolean };

// The connect flow for one platform: add LOVELEEDAY as a user, hand over a read-only key (write-only field),
// or ask for one-click sign-in. Disconnect deletes the stored key.
export function ConnectPanel({ connector: c, status, managedBy }: { connector: C; status: ConnStatus; managedBy: string }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const connected = !["not_connected", "disconnected"].includes(status);

  async function act(action: string, payload?: Record<string, string>) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/client/connections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connector: c.key, action, payload }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error || "Couldn't save that." }); return; }
    setVals({});
    setMsg({ ok: true, text: action === "key" ? "Key received and encrypted. We'll verify it with a live read and show the proof here." : action === "disconnect" ? "Disconnected. Any stored key was deleted." : "Thanks. We'll confirm the connection and show the proof here." });
    router.refresh();
  }

  return (
    <div>
      <Eyebrow>{managedBy === "loveleeday" && connected ? "Managed by LOVELEEDAY" : "Connect"}</Eyebrow>
      {managedBy === "loveleeday" && connected ? (
        <p className="mt-2 text-[14.5px] leading-[1.6] text-[#303238]">We connected this for you and check it on a schedule. To switch it to your own account, use one of the options below any time.</p>
      ) : null}

      {c.method === "invite" && (
        <div className="mt-3">
          <p className="text-[14.5px] leading-[1.65] text-[#303238]">{c.invite_steps}</p>
          <button type="button" className="ll-primary mt-4" disabled={busy} onClick={() => act("invited")}>{busy ? "Saving…" : "I've added LOVELEEDAY"}</button>
        </div>
      )}

      {c.method === "key" && (
        <form className="mt-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); act("key", vals); }}>
          {(c.key_fields ?? []).map((f) => (
            <label key={f.name} className="ll-field"><span>{f.label}</span>
              <input className="ll-input" type="password" autoComplete="off" value={vals[f.name] ?? ""} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} required />
              {f.hint && <span className="text-[12px] text-[var(--muted)]">{f.hint}</span>}
            </label>
          ))}
          {c.key_help && <p className="text-[12.5px] text-[var(--muted)]">{c.key_help} Keys are encrypted with your account's own key and are never shown again, to you or to us in the portal.</p>}
          <button type="submit" className="ll-primary justify-self-start" disabled={busy}>{busy ? "Encrypting…" : "Save key"}</button>
        </form>
      )}

      {c.method === "oauth" && (
        <div className="mt-3">
          <p className="text-[14.5px] leading-[1.65] text-[#303238]">{c.oneclick_ready ? `Sign in with ${c.name} and approve read-only access.` : `One-click sign-in for ${c.name} is being set up. Request it and we'll connect it with you, usually within a business day.`}</p>
          <button type="button" className="ll-primary mt-4" disabled={busy || status === "requested"} onClick={() => act("request")}>{status === "requested" ? "Requested" : busy ? "Saving…" : `Request ${c.name}`}</button>
        </div>
      )}

      {connected && (
        <button type="button" className="ll-secondary mt-6" disabled={busy} onClick={() => { if (confirm(`Disconnect ${c.name}? Any stored key is deleted.`)) act("disconnect"); }}>Disconnect</button>
      )}
      {msg && <p className={`mt-4 text-[13px] ${msg.ok ? "text-[#1e6b3a]" : "text-[#a1291f]"}`}>{msg.text}</p>}
    </div>
  );
}
