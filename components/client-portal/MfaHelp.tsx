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
    <p className="ll-note mt-6">
      Lost your phone and your backup codes? Email <a href="mailto:daniel@loveleedaystudios.com?subject=Reset%20my%20two-factor" className="underline">daniel@loveleedaystudios.com</a>. We&apos;ll call the number on your account to confirm it&apos;s you before we reset anything.{" "}
      <button type="button" onClick={signOut} className="underline">Sign out</button>
    </p>
  );
}
