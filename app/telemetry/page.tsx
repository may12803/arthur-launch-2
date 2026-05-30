import { Suspense } from "react";
import TelemetryDashboard from "./TelemetryDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function TelemetryPage() {
  return (
    <div style={{ padding: "28px 32px", background: "#0c0e12", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: "'JetBrains Mono','GeistMono',monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,246,248,0.50)", marginBottom: 8 }}>
            system events
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-.02em", margin: 0, color: "#f5f6f8", fontFamily: "var(--font-lora,'Lora',Georgia,serif)" }}>
            Telemetry
          </h1>
          <p style={{ margin: "4px 0 0", fontFamily: "'JetBrains Mono','GeistMono',monospace", fontSize: 11, color: "rgba(245,246,248,0.30)", letterSpacing: "0.06em" }}>Live — last 24h</p>
        </div>
        <Suspense fallback={<div style={{ fontFamily: "'JetBrains Mono',monospace", color: "rgba(245,246,248,0.30)", fontSize: 12 }}>Loading…</div>}>
          <TelemetryDashboard />
        </Suspense>
      </div>
    </div>
  );
}
