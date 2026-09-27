"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eyebrow } from "@/components/client-portal/ui";

// Approve / Approve with changes / Not now, with an optional note. Posts to /api/client/workstreams/decide,
// which calls workstream_decide() under the client's own two-factor session.
export function DecisionForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "approve" | "approve_with_changes" | "not_now") {
    if (decision === "approve_with_changes" && !note.trim()) { setError("Add a note saying what should change."); return; }
    setBusy(decision); setError(null);
    const r = await fetch("/api/client/workstreams/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: taskId, decision, note }) });
    const j = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) { setError(j.error || "Couldn't save your decision."); return; }
    router.refresh();
  }

  return (
    <div>
      <Eyebrow>Your decision</Eyebrow>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team (optional)" className="ll-input mt-3 min-h-[92px] w-full" />
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="ll-primary" disabled={!!busy} onClick={() => decide("approve")}>{busy === "approve" ? "Saving…" : "Approve"}</button>
        <button type="button" className="ll-secondary" disabled={!!busy} onClick={() => decide("approve_with_changes")}>Approve with changes</button>
        <button type="button" className="ll-secondary" disabled={!!busy} onClick={() => decide("not_now")}>Not now</button>
      </div>
      {error && <p className="mt-3 text-[13px] text-[#a1291f]">{error}</p>}
    </div>
  );
}
