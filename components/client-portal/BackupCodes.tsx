"use client";

import { useState } from "react";
import { PortalButton } from "./ui";

// Shown once, right after two-factor setup: ten single-use codes for the day the phone is lost. Continue stays off
// until the person ticks that they saved them; downloading or copying does not tick it for them.
export function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `LOVELEEDAY backup codes\nEach works once, in place of the 6-digit code, if you lose your phone.\n\n${codes.join("\n")}\n`;

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "loveleeday-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="stack">
      <div className="codes" aria-label="Backup codes">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      <div className="pair">
        <button type="button" className="ll-secondary sm" onClick={download}>Download as a text file</button>
        <button type="button" className="ll-secondary sm" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); }}>
          {copied ? "Copied" : "Copy all codes"}
        </button>
      </div>
      <label className="ack">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have saved these codes somewhere safe
      </label>
      <PortalButton type="button" disabled={!saved} onClick={onDone}>Continue to your workspace</PortalButton>
    </div>
  );
}
