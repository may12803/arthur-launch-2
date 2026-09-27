"use client";

import { loveleeday } from "@/lib/supabase/loveleeday";

// Shown under both two-factor screens so nobody who loses their phone is left at a dead end.
export function MfaHelp() {
  async function signOut() {
    await loveleeday.auth.signOut();
    window.location.href = "/client/login";
  }
  return (
    <p className="ll-note mt-6">
      Lost your phone or authenticator? Email <a href="mailto:daniel@loveleedaystudios.com?subject=Reset%20my%20two-factor" className="underline">daniel@loveleedaystudios.com</a> and we&apos;ll reset it.{" "}
      <button type="button" onClick={signOut} className="underline">Sign out</button>
    </p>
  );
}
