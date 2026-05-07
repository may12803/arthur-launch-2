import fs from "fs";
import path from "path";
import Link from "next/link";
import { Nav, Footer } from "../_components/Layout";
import { PageHeader } from "../_components/PageHeader";
import { TokenChip } from "../_components/TokenChip";
import { EmptyState } from "../_components/EmptyState";
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

        <PageHeader
          title="principles."
          eyebrow="EvolveR distillation · nightly 03:25"
          subtitle={`${principles.length} principles — distilled from session trajectories. Ranked by confidence. The brain reads its own logs and gets smarter while you sleep.`}
          style={{ marginBottom: "var(--space-lg)" }}
        />

        {/* Confidence legend strip */}
        <div style={{
          display: "flex",
          gap: "var(--space-md)",
          marginBottom: "var(--space-lg)",
          flexWrap: "wrap",
        }}>
          <TokenChip label="high confidence" color="orange" size="sm" icon={<span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent-orange)", flexShrink: 0, display: "inline-block" }} />} title="≥ 85%" />
          <TokenChip label="solid" color="blue" size="sm" icon={<span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--tint-blue)", flexShrink: 0, display: "inline-block" }} />} title="70–84%" />
          <TokenChip label="emerging" color="muted" size="sm" icon={<span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--text-muted)", flexShrink: 0, display: "inline-block" }} />} title="< 70%" />
        </div>

        {principles.length === 0 ? (
          <EmptyState
            title="no principles yet."
            subtitle="Run: node ~/arthur/agentic/evolver-distill.js --window 30"
            size="md"
          />
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
