"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Owners and admins withdraw a pending invite (sent to the wrong address, or expired and being replaced).
export function RevokeInvite({ id, email }: { id: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function revoke() {
    if (busy || !window.confirm(`Withdraw the invite to ${email}? Their link will stop working.`)) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/client/team/invite", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't withdraw that invite.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" onClick={revoke} disabled={busy} className="ll-text-link text-[12.5px]">
        {busy ? "Withdrawing…" : "Withdraw"}
      </button>
      {error && <span className="text-[12px] text-red-700">{error}</span>}
    </span>
  );
}
