import { Suspense } from "react";
import TelemetryDashboard from "./TelemetryDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function TelemetryPage() {
  return (
    <div style={{ padding: "28px 32px", background: "#0F0E0D", minHeight: "100vh", color: "#F0EDE8" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-.03em", margin: 0, color: "#F0EDE8", fontFamily: "var(--font-lora,'Lora',Georgia,serif)", fontStyle: "italic" }}>
            Telemetry
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#6B6560" }}>Live — last 24h</p>
        </div>
        <Suspense fallback={<div style={{ color: "#6B6560", fontSize: 13 }}>Loading...</div>}>
          <TelemetryDashboard />
        </Suspense>
      </div>
    </div>
  );
}
