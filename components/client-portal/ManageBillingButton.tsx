"use client";

import { useState } from "react";
import { PortalButton } from "./ui";

export function ManageBillingButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/client/billing/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error || "Couldn't open the billing portal.");
        setLoading(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error — try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <PortalButton onClick={onClick} disabled={loading}>
        {loading ? "Opening…" : "Manage billing"}
      </PortalButton>
      {error && <p className="text-small text-red-600">{error}</p>}
    </div>
  );
}
