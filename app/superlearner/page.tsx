"use client";
import { useEffect, useState } from "react";
import { Nav, Footer } from "../_components/Layout";

interface HardCase {
  id: string;
  from?: string | null;
  subject?: string | null;
  predicted?: string | null;
  correct: string;
  confidence?: number | null;
  input_excerpt?: string | null;
  created_at?: string;
}

interface DomainStats {
  domain: string;
  total_decisions: number;
  total_corrections: number;
  decisions_7d: number;
  corrections_7d: number;
  decisions_30d: number;
  corrections_30d: number;
  accuracy_7d: number | null;
  accuracy_30d: number | null;
  active_prompt_version: string | null;
  hard_cases: HardCase[];
}

interface StatsPayload {
  ok: boolean;
  stats: DomainStats[];
  generated_at: string;
}

const DOMAIN_LABELS: Record<string, string> = {
  inbox:          "Inbox Triage",
  invoice:        "Invoice Detection",
  unsubscribe:    "Unsubscribe Classifier",
  calendar_invite:"Calendar Invites",
  reply_draft:    "Reply Drafts",
};

function AccuracyBadge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: "var(--text-faint)", fontSize: 12 }}>—</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? 'var(--tint-emerald)' : pct >= 75 ? 'var(--tint-amber)' : 'var(--tint-red)';
  return (
    <span style={{ color, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", fontSize: 14, fontWeight: 600 }}>
      {pct}%
    </span>
  );
}

function StatCell({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 600, color: "var(--text-active)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function DomainCard({ ds }: { ds: DomainStats }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="domain-card glass-t1">
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text-active)", letterSpacing: "0.01em" }}>
          {DOMAIN_LABELS[ds.domain] ?? ds.domain}
        </h3>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {ds.active_prompt_version && (
            <span style={{
              fontSize: 11,
              color: "var(--text-muted)",
              fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
              background: "var(--bg-surface)",
              border: "1px solid var(--line-separator)",
              borderRadius: 'var(--radius-sm)',
              padding: "4px 8px"
            }}>
              v{ds.active_prompt_version}
            </span>
          )}
          <div style={{ display: "flex", gap: 16, textAlign: 'center' }}>
            <div>
              <span style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 2 }}>7d</span>
              <AccuracyBadge value={ds.accuracy_7d} />
            </div>
            <div>
              <span style={{ fontSize: 10, color: "var(--text-faint)", display: "block", marginBottom: 2 }}>30d</span>
              <AccuracyBadge value={ds.accuracy_30d} />
            </div>
          </div>
        </div>
      </div>

      {/* Hard cases */}
      {ds.hard_cases.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-muted)", fontSize: 12, padding: 0,
              fontFamily: "inherit", letterSpacing: "0.02em",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <span style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>▼</span>
            {ds.hard_cases.length} Hardest Cases
          </button>

          {expanded && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 100px',
                gap: '16px',
                padding: '0 16px',
                fontSize: 10,
                color: 'var(--text-faint)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                <span>Intent</span>
                <span>Predicted</span>
                <span>Correct</span>
                <span style={{textAlign: 'right'}}>Action</span>
              </div>
              {ds.hard_cases.map(c => (
                <div
                  key={c.id}
                  style={{
                    background: "var(--bg-mid)",
                    border: "1px solid var(--line-separator)",
                    borderRadius: 'var(--radius-sm)',
                    padding: "12px 16px",
                    fontSize: 13,
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 100px',
                    gap: '16px',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                    <div style={{ color: "var(--text-main)", fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.subject ?? c.input_excerpt ?? '(no subject)'}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.from ?? "(unknown)"}</div>
                  </div>
                  <span style={{ color: "var(--tint-red)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
                    {c.predicted ?? "?"}
                  </span>
                  <span style={{ color: "var(--tint-emerald)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
                    {c.correct}
                  </span>
                  <div style={{textAlign: 'right'}}>
                    <button style={{
                      background: 'var(--glass-t1-bg)',
                      border: '1px solid var(--glass-t1-border)',
                      color: 'var(--text-muted)',
                      fontSize: 11,
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 10px',
                      cursor: 'pointer',
                    }}>
                      Menu
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SuperlearnerPage() {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/superlearner/stats")
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(d => setData(d as StatsPayload))
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const totalDecisions  = data?.stats.reduce((a, s) => a + s.total_decisions, 0) ?? 0;
  const totalCorrections = data?.stats.reduce((a, s) => a + s.total_corrections, 0) ?? 0;

  return (
    <>
      <Nav />
      <style jsx global>{`
        .glass-t1 {
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          backdrop-filter: blur(var(--glass-t1-blur));
          box-shadow: var(--glass-t1-shadow);
          border-radius: var(--radius-panel);
          transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        .domain-card {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
        .domain-card:hover {
          transform: translateY(-4px);
          background: var(--glass-t2-bg);
          border-color: var(--glass-t2-border);
          box-shadow: var(--glass-t2-shadow);
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes sl-shimmer {
          0%   { background-position: -800px 0; }
          100% { background-position: 800px 0; }
        }
        .sl-skeleton {
          background: linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-mid) 50%, var(--bg-surface) 75%);
          background-size: 1600px 100%;
          animation: sl-shimmer 1.8s infinite;
          border-radius: var(--radius-panel);
        }
      `}</style>
      <main style={{
        maxWidth: 'var(--max-w)',
        margin: '0 auto',
        padding: '108px var(--page-gutter) var(--page-gutter)',
        minHeight: '80vh'
      }}>
        {/* Header */}
        <header style={{ marginBottom: 48, maxWidth: 'var(--max-w-narrow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
            <div>
              <h1 style={{
                fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
                fontWeight: 700, fontSize: "clamp(2rem, 5vw, 2.5rem)",
                letterSpacing: "-0.04em", color: "var(--text-active)", margin: 0, lineHeight: 1,
              }}>Superlearner</h1>
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.6, maxWidth: "55ch" }}>
                Active model: arthur-tuned-2026-05-03. Last trained: 14h ago.
              </p>
            </div>
            <div className="glass-t1" style={{ padding: '12px 16px', borderRadius: 'var(--radius-card)', textAlign: 'center' }}>
              <div style={{ fontFamily: "var(--font-jetbrains, monospace)", fontSize: 24, fontWeight: 700, color: "var(--text-active)", letterSpacing: "-0.03em", lineHeight: 1, color: 'var(--tint-emerald)' }}>94.8%</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: 6 }}>accuracy</div>
            </div>
          </div>
        </header>

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} className="sl-skeleton" style={{ height: 120, opacity: 0.25 + i * 0.05 }} />
            ))}
          </div>
        )}

        {error && (
          <div className="glass-t1" style={{ padding: 24, borderColor: 'var(--tint-red-soft)' }}>
            <div style={{ color: "var(--tint-red)", fontSize: 14, fontWeight: 500 }}>
              Error: Could not load Superlearner stats.
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 8, fontFamily: "var(--font-jetbrains, monospace)" }}>
              {error}
            </div>
          </div>
        )}

        {/* Domain cards */}
        {data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.stats.map(ds => (
              <DomainCard key={ds.domain} ds={ds} />
            ))}
          </div>
        )}

        {data && (
          <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 32, textAlign: 'center' }}>
            Generated at {new Date(data.generated_at).toLocaleString("en-US", { timeZone: "America/Detroit" })} ET
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}