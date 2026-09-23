"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MfaSettings } from "@/components/settings/MfaSettings";

const D = {
  bg: "#0c0e12",
  glass: "rgba(255,255,255,0.04)",
  glassBorder: "rgba(255,255,255,0.08)",
  textActive: "#f5f6f8",
  textMuted: "rgba(245,246,248,0.50)",
  radius: "16px",
  mono: "'JetBrains Mono','GeistMono',monospace",
  sans: "var(--font-inter,Inter,system-ui,sans-serif)",
  serif: "var(--font-lora,Lora,Georgia,serif)",
};

function SecurityPageInner() {
  const searchParams = useSearchParams();
  const forceEnroll = searchParams.get("enroll") === "1";

  return (
    <div style={{ minHeight: "100vh", background: D.bg, padding: "32px 40px", fontFamily: D.sans }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: D.mono, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: D.textMuted, marginBottom: 8 }}>
            preferences
          </div>
          <h1 style={{ fontFamily: D.serif, fontSize: 28, fontWeight: 500, color: D.textActive, letterSpacing: "-.025em", lineHeight: 1.2, margin: "0 0 6px" }}>
            Security
          </h1>
          <p style={{ fontSize: 13.5, color: D.textMuted, maxWidth: "52ch", lineHeight: 1.6, margin: 0 }}>
            {forceEnroll
              ? "Two-factor authentication is required before you can continue."
              : "Manage two-factor authentication for your Arthur account."}
          </p>
        </div>

        <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radius, padding: 28, backdropFilter: "blur(16px)" }}>
          <MfaSettings autoEnroll={forceEnroll} />
        </div>

        <div style={{ marginTop: 16 }}>
          <a href="/settings" style={{ fontSize: 13, color: D.textMuted, fontFamily: D.sans }}>&larr; Back to settings</a>
        </div>
      </div>
    </div>
  );
}

export default function SecurityPage() {
  return (
    <Suspense fallback={null}>
      <SecurityPageInner />
    </Suspense>
  );
}
