"use client";

import { useState } from "react";
import { PortalButton } from "./ui";

// Shown once, right after two-factor setup: ten single-use codes for the day the phone is lost.
export function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const text = `LOVELEEDAY backup codes\nEach works once, in place of the 6-digit code, if you lose your phone.\n\n${codes.join("\n")}\n`;

  function download() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "loveleeday-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="ll-note">
        You&apos;re set. From now on you&apos;ll sign in with your password and the 6-digit code from your app. No more scanning.
      </p>
      <div>
        <span className="ll-label">Save your backup codes</span>
        <p className="ll-note mt-1">If you lose your phone, each code gets you in once. We won&apos;t show them again.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[14px] text-[#36475c] bg-[#fafbfd] border border-[#dce3ed] rounded-lg p-4 select-all">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <PortalButton type="button" variant="secondary" onClick={download} className="flex-1">Download</PortalButton>
        <PortalButton type="button" variant="secondary" onClick={() => { navigator.clipboard?.writeText(text); setSaved(true); }} className="flex-1">Copy</PortalButton>
      </div>
      <label className="flex items-center gap-2 text-[13px] text-[var(--ink)]">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I&apos;ve saved these somewhere safe
      </label>
      <PortalButton type="button" disabled={!saved} onClick={onDone} className="w-full">Continue</PortalButton>
    </div>
  );
}
