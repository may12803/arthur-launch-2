import fs from "fs";
import path from "path";
import PrinciplesSearch from "./_components/PrinciplesSearch";

interface Principle {
  id?: string;
  principle: string;
  applicable_when?: string;
  trigger_conditions?: string;
  rationale?: string;
  evidence_turn_ids?: string[];
  source_trajectory_count?: number;
  confidence: number;
  created_at?: string;
}

function loadPrinciples(): Principle[] {
  try {
    const file = path.join(process.cwd(), "public", "principles.json");
    return JSON.parse(fs.readFileSync(file, "utf8")) as Principle[];
  } catch {
    return [];
  }
}

export default function PrinciplesPage() {
  const principles = loadPrinciples().sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  return (
    <div style={{ minHeight: "100vh", background: "#0c0e12", padding: "32px 40px", fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: "'JetBrains Mono','GeistMono',monospace",
            fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
            color: "rgba(245,246,248,0.50)", marginBottom: 8,
          }}>
            EvolveR distillation · {principles.length} principles · nightly 03:25
          </div>
          <h1 style={{
            fontFamily: "var(--font-lora, Lora, Georgia, serif)", fontWeight: 500, fontSize: 28,
            letterSpacing: "-0.025em", color: "#f5f6f8", margin: "0 0 6px", lineHeight: 1.2,
          }}>Principles</h1>
          <p style={{ fontSize: 13.5, color: "rgba(245,246,248,0.50)", maxWidth: "58ch", lineHeight: 1.6, margin: 0 }}>
            Distilled from session trajectories. Ranked by confidence. The brain reads its own logs and gets smarter while you sleep.
          </p>
        </div>

        {/* Confidence legend */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
          {[
            { color: "#d4ff3d", label: "high confidence", range: "≥ 85%" },
            { color: "rgba(91,141,239,0.90)", label: "solid", range: "70–84%" },
            { color: "rgba(245,246,248,0.30)", label: "emerging", range: "< 70%" },
          ].map(({ color, label, range }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 100, padding: "4px 12px",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "#f5f6f8", fontWeight: 500 }}>{label}</span>
              <span style={{ fontFamily: "'JetBrains Mono','GeistMono',monospace", fontSize: 10, color: "rgba(245,246,248,0.50)", fontVariantNumeric: "tabular-nums" }}>{range}</span>
            </div>
          ))}
        </div>

        {principles.length === 0 ? (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "32px 24px" }}>
            <p style={{ fontSize: 13.5, color: "rgba(245,246,248,0.50)", margin: 0 }}>
              No principles yet. Run: <code style={{ fontFamily: "'JetBrains Mono',monospace", color: "#d4ff3d", fontSize: 12 }}>node ~/arthur/agentic/evolver-distill.js --window 30</code>
            </p>
          </div>
        ) : (
          <PrinciplesSearch principles={principles} />
        )}
      </div>
    </div>
  );
}
