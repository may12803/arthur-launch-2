"use client";

import { useState, FormEvent } from "react";
import { PortalButton, FormField, inputClass } from "./ui";

// Recipient flow: request a code by email, enter it, receive the file. The
// code never touches the browser except as typed by the recipient.
export function ShareOpen({ token, documentName, recipientHint }: { token: string; documentName: string; recipientHint: string }) {
  const [step, setStep] = useState<"request" | "enter" | "done">("request");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function requestCode() {
    setBusy(true); setError("");
    const res = await fetch(`/api/share/${token}/code`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.error || "We couldn't send the code. Try again."); return; }
    setStep("enter");
  }

  async function open(e: FormEvent) {
    e.preventDefault();
    if (busy || code.length < 6) return;
    setBusy(true); setError("");
    const res = await fetch(`/api/share/${token}/open`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "That didn't work. Try again.");
      setBusy(false);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = documentName; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setBusy(false);
    setStep("done");
  }

  if (step === "done") {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">Downloaded</h2>
        <p className="ll-note">&ldquo;{documentName}&rdquo; is in your downloads. To open it again later, use the link from the email and request a new code.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)]">
        {step === "request" ? "Confirm it's you" : "Enter your code"}
      </h2>
      {step === "request" ? (
        <>
          <p className="ll-note -mt-3">We&apos;ll email a 6-digit code to {recipientHint}.</p>
          {error && <p className="ll-feedback warn">{error}</p>}
          <PortalButton onClick={requestCode} disabled={busy} className="w-full">{busy ? "Sending…" : "Email me a code"}</PortalButton>
        </>
      ) : (
        <form onSubmit={open} className="flex flex-col gap-5">
          <p className="ll-note -mt-3">Sent to {recipientHint}. It works once and expires in 10 minutes.</p>
          <FormField label="6-digit code" htmlFor="share-code">
            <input id="share-code" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000"
              className={`${inputClass} text-center tracking-[0.4em] !text-[20px] font-mono`} />
          </FormField>
          {error && <p className="ll-feedback warn">{error}</p>}
          <PortalButton type="submit" disabled={busy || code.length < 6} className="w-full">{busy ? "Opening…" : "Open document"}</PortalButton>
          <button type="button" className="ll-text-link self-start" onClick={requestCode} disabled={busy}>Send a new code</button>
        </form>
      )}
    </div>
  );
}
