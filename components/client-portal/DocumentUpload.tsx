"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalButton } from "./ui";

const MAX = 20 * 1024 * 1024;

export function DocumentUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);

  async function upload(file: File) {
    setMessage(null);
    if (file.size > MAX) {
      setMessage({ tone: "warn", text: `${file.name} is larger than 20 MB.` });
      return;
    }
    setBusy(true);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/client/documents", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "warn", text: data.error || "The upload didn't go through. Try again." });
      } else {
        setMessage({ tone: "ok", text: `${file.name} is uploaded and encrypted.` });
        router.refresh();
      }
    } catch {
      setMessage({ tone: "warn", text: "The upload didn't go through. Check your connection and try again." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={input}
        id="document-file"
        type="file"
        className="sr-only"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <div>
        <PortalButton onClick={() => input.current?.click()} disabled={busy}>
          {busy ? "Encrypting and uploading…" : "Upload a document"}
        </PortalButton>
      </div>
      <p className="ll-note">Up to 20 MB. Each file is encrypted with your company&apos;s own key before it is stored.</p>
      {message && <p className={`ll-feedback ${message.tone}`}>{message.text}</p>}
    </div>
  );
}

export function DeleteDocumentButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/client/documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't delete it. Try again.");
      setBusy(false);
      return;
    }
    router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" className="ll-text-link" onClick={() => setConfirming(true)} aria-label={`Delete ${name}`}>
        Delete
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-3">
      <span className="text-[12px] text-[var(--muted)]">Delete for everyone?</span>
      <button type="button" className="text-[12px] text-[#b3261e]" onClick={remove} disabled={busy}>
        {busy ? "Deleting…" : "Delete"}
      </button>
      <button type="button" className="text-[12px] text-[var(--muted)]" onClick={() => setConfirming(false)} disabled={busy}>
        Cancel
      </button>
      {error && <span className="ll-feedback warn">{error}</span>}
    </span>
  );
}
