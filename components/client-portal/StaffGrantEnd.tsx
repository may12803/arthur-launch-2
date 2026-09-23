"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Lets a client owner/admin end LOVELEEDAY staff access early, or staff end
// their own; the database logs who closed it.
export function StaffGrantEnd({ grantId, label = "End access now" }: { grantId: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function end() {
    setBusy(true); setError("");
    const res = await fetch(`/api/client/staff?grant=${grantId}`, { method: "DELETE" });
    if (!res.ok) { setError("Couldn't end it. Try again."); setBusy(false); return; }
    router.refresh();
  }
  return (
    <span className="inline-flex items-center gap-3">
      <button type="button" className="ll-text-link" onClick={end} disabled={busy}>{busy ? "Ending…" : label}</button>
      {error && <span className="ll-feedback warn">{error}</span>}
    </span>
  );
}
