import fs from "fs";
import path from "path";
import Link from "next/link";
import { Nav, Footer } from "../_components/Layout";
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
    <>
      <Nav />
      <div className="wrap" style={{ paddingTop: 108, paddingBottom: "var(--space-xl)" }}>
        {/* Header */}
        <div style={{ marginBottom: "var(--space-lg)" }}>
          <span style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: "var(--fs-mono)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
          }}>
            EvolveR distillation · {principles.length} principles · nightly 03:25
          </span>
          <h1 style={{
            fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
            fontWeight: 800,
            fontSize: "var(--fs-h1)",
            letterSpacing: "-0.03em",
            color: "var(--text-active)",
            margin: "8px 0 12px",
            lineHeight: 0.95,
          }}>principles.</h1>
          <p style={{
            fontSize: "var(--fs-body)",
            color: "var(--text-muted)",
            maxWidth: "58ch",
            lineHeight: 1.65,
            margin: 0,
          }}>
            Distilled from session trajectories. Ranked by confidence. The brain reads its own logs and gets smarter while you sleep.
          </p>
        </div>

        {/* Confidence legend strip */}
        <div style={{
          display: "flex",
          gap: "var(--space-md)",
          marginBottom: "var(--space-lg)",
          flexWrap: "wrap",
        }}>
          {[
            { color: "var(--accent-orange)", label: "high confidence", range: "≥ 85%" },
            { color: "var(--accent-cool)", label: "solid", range: "70–84%" },
            { color: "var(--text-muted)", label: "emerging", range: "< 70%" },
          ].map(({ color, label, range }) => (
            <div key={label} style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-xs)",
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-pill)",
              padding: "4px 14px",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-active)", fontFamily: "var(--font-jetbrains, monospace)" }}>
                {label}
              </span>
              <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", fontFamily: "var(--font-jetbrains, monospace)" }}>
                {range}
              </span>
            </div>
          ))}
        </div>

        {principles.length === 0 ? (
          <div className="glass" style={{ borderRadius: "var(--radius-panel)", padding: "var(--space-lg)" }}>
            <p style={{ fontSize: "var(--fs-body)", color: "var(--text-muted)", margin: 0 }}>
              No principles yet. Run: <code>node ~/arthur/agentic/evolver-distill.js --window 30</code>
            </p>
          </div>
        ) : (
          <PrinciplesSearch principles={principles} />
        )}

        <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-lg)" }}>
          <Link href="/dashboard" className="cta-btn">open dashboard →</Link>
          <Link href="/" className="btn-ghost">← home</Link>
        </div>
      </div>
      <Footer />
    </>
  );
}
