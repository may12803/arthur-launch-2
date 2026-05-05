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

  const confidenceLevels = [
    { color: "var(--accent-orange)", label: "high confidence", range: "≥ 85%" },
    { color: "var(--tint-blue)", label: "solid", range: "70–84%" },
    { color: "var(--text-muted)", label: "emerging", range: "< 70%" },
  ];

  return (
    <>
      <Nav />
      <main className="principles-page">
        <div className="header">
          <span className="eyebrow">
            EvolveR distillation · {principles.length} principles · nightly 03:25
          </span>
          <h1>principles.</h1>
          <p className="description">
            Distilled from session trajectories. Ranked by confidence. The brain reads its own logs and gets smarter while you sleep.
          </p>
        </div>

        <div className="legend">
          {confidenceLevels.map(({ color, label, range }) => (
            <div key={label} className="legend-item">
              <span className="legend-dot" style={{ backgroundColor: color }} />
              <span className="legend-label">{label}</span>
              <span className="legend-range">{range}</span>
            </div>
          ))}
        </div>

        <div className="content-area">
          {principles.length === 0 ? (
            <div className="no-principles-card">
              <p>
                No principles yet. Run: <code>node ~/arthur/agentic/evolver-distill.js --window 30</code>
              </p>
            </div>
          ) : (
            <PrinciplesSearch principles={principles} />
          )}
        </div>

        <div className="actions">
          <Link href="/dashboard" className="cta-button">open dashboard →</Link>
          <Link href="/" className="ghost-button">← home</Link>
        </div>
      </main>
      <Footer />

      <style jsx>{`
        .principles-page {
          width: 100%;
          max-width: var(--max-w);
          margin: 0 auto;
          padding: 120px var(--page-gutter) 80px;
          display: flex;
          flex-direction: column;
          gap: 48px;
        }

        .header {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .eyebrow {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.875rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-faint);
        }

        h1 {
          font-family: 'Space Grotesk', sans-serif;
          font-weight: 700;
          font-size: clamp(2.5rem, 5vw, 3.5rem);
          letter-spacing: -0.03em;
          color: var(--text-active);
          line-height: 1;
          margin: 0;
        }

        .description {
          font-size: 1.125rem;
          color: var(--text-muted);
          max-width: 60ch;
          line-height: 1.6;
          margin: 0;
        }

        .legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 6px 16px;
          border-radius: var(--radius-pill);
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          backdrop-filter: blur(var(--glass-t1-blur));
          box-shadow: var(--glass-t1-shadow);
          transition: all 0.2s ease;
        }
        
        .legend-item:hover {
          background: var(--glass-t2-bg);
          border-color: var(--glass-t2-border);
          box-shadow: var(--glass-t2-shadow);
          transform: translateY(-2px);
        }

        .legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .legend-label, .legend-range {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.875rem;
          line-height: 1;
        }

        .legend-label {
          color: var(--text-main);
        }

        .legend-range {
          color: var(--text-muted);
        }

        .content-area {
          width: 100%;
        }

        .no-principles-card {
          padding: 24px;
          border-radius: var(--radius-panel);
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          backdrop-filter: blur(var(--glass-t1-blur));
          box-shadow: var(--glass-t1-shadow);
        }
        
        .no-principles-card p {
          margin: 0;
          color: var(--text-muted);
          font-size: 1rem;
        }
        
        .no-principles-card code {
          background: var(--glass-t2-bg);
          color: var(--text-main);
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--glass-t1-border);
          font-family: 'JetBrains Mono', monospace;
        }

        .actions {
          display: flex;
          gap: 12px;
          margin-top: 16px;
        }

        .cta-button, .ghost-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 24px;
          font-size: 1rem;
          font-weight: 500;
          border-radius: var(--radius-pill);
          text-decoration: none;
          transition: all 0.2s ease;
          border: 1px solid transparent;
        }

        .cta-button {
          background-color: var(--accent-orange);
          color: var(--accent-text-on);
          box-shadow: 0 0 20px -5px var(--accent-glow);
        }

        .cta-button:hover {
          background-color: var(--accent-hover);
          transform: translateY(-2px);
          box-shadow: 0 4px 25px -5px var(--accent-glow);
        }

        .ghost-button {
          background-color: transparent;
          color: var(--text-main);
          border-color: var(--glass-t1-border);
        }

        .ghost-button:hover {
          background-color: var(--glass-t2-bg);
          border-color: var(--glass-t2-border);
          color: var(--text-active);
          transform: translateY(-2px);
        }
      `}</style>
    </>
  );
}