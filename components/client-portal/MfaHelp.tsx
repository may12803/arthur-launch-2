"use client";

import { loveleeday } from "@/lib/supabase/loveleeday";

// Shown under both two-factor screens so nobody who loses their phone is left at a dead end. Backup codes are
// the first way back; a manual reset follows docs/portal-two-factor-reset.md (identity confirmed by phone first).
export function MfaHelp() {
  async function signOut() {
    await loveleeday.auth.signOut();
    window.location.href = "/client/login";
  }
  return (
    <p className="note" style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
      Lost your phone and your backup codes?{" "}
      <a href="mailto:daniel@loveleedaystudios.com?subject=Reset%20my%20two-factor">Get help</a>. We call the number on your account to confirm it&apos;s you before we reset anything.{" "}
      <button type="button" onClick={signOut} className="linkbtn" style={{ fontSize: "inherit" }}>Sign out</button>
    </p>
  );
}
