"use client";

import { useState } from "react";
import { loveleeday } from "@/lib/supabase/loveleeday";

export function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function onSignOut() {
    if (loading) return;
    setLoading(true);
    await loveleeday.auth.signOut();
    window.location.href = "/client/login";
  }

  return (
    <button
      onClick={onSignOut}
      disabled={loading}
      className="text-[13px] font-medium text-text-muted hover:text-text-active transition-colors disabled:opacity-50"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
