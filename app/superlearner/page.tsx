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
  inbox:          "inbox triage",
  invoice:        "invoice detection",
  unsubscribe:    "unsub classifier",
  calendar_invite:"calendar invites",
  reply_draft:    "reply drafts",
};

function AccuracyBadge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: "var(--text-faint)", fontSize: 11 }}>no data</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? "#4ade80" : pct >= 75 ? "#facc15" : "#f87171";
  return (
    <span style={{ color, fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", fontSize: 13, fontWeight: 600 }}>
      {pct}%
    </span>
  );
}

function StatCell({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function DomainCard({ ds }: { ds: DomainStats }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--text)", letterSpacing: "0.01em" }}>
          {DOMAIN_LABELS[ds.domain] ?? ds.domain}
        </h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {ds.active_prompt_version && (
            <span style={{ fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)", background: "var(--panel-elev)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 6px" }}>
              v{ds.active_prompt_version}
            </span>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <div>
              <span style={{ fontSize: 9, color: "var(--text-faint)", display: "block" }}>7d</span>
              <AccuracyBadge value={ds.accuracy_7d} />
            </div>
            <div>
              <span style={{ fontSize: 9, color: "var(--text-faint)", display: "block" }}>30d</span>
              <AccuracyBadge value={ds.accuracy_30d} />
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <StatCell label="total decisions" value={ds.total_decisions} />
        <StatCell label="total corrections" value={ds.total_corrections} />
        <StatCell label="decisions 7d" value={ds.decisions_7d} />
        <StatCell label="corrections 7d" value={ds.corrections_7d} />
      </div>

      {/* Hard cases */}
      {ds.hard_cases.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--text-dim)", fontSize: 11, padding: 0,
              fontFamily: "inherit", letterSpacing: "0.02em",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {expanded ? "▲" : "▼"} {ds.hard_cases.length} hardest cases this week
          </button>

          {expanded && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {ds.hard_cases.map(c => (
                <div
                  key={c.id}
                  style={{
                    background: "var(--panel-elev)",
                    border: "1px solid var(--border)",
                    borderRadius: 7,
                    padding: "10px 14px",
                    fontSize: 11,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "var(--text-dim)" }}>{c.from ?? "(unknown)"}</span>
                    <span style={{ color: "var(--text-faint)", fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)" }}>
                      predicted: <span style={{ color: "#f87171" }}>{c.predicted ?? "?"}</span>
                      {" → "} correct: <span style={{ color: "#4ade80" }}>{c.correct}</span>
                    </span>
                  </div>
                  {c.subject && (
                    <div style={{ color: "var(--text)", fontWeight: 500, marginBottom: 4 }}>{c.subject}</div>
                  )}
                  {c.input_excerpt && (
                    <div style={{ color: "var(--text-faint)", fontStyle: "italic" }}>
                      {c.input_excerpt}…
                    </div>
                  )}
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
      <main className="wrap" style={{ padding: "40px 0 80px", minHeight: "80vh" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", color: "var(--text)" }}>
            superlearner
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0, maxWidth: 600 }}>
            experience-based learning via daniel&apos;s feedback signal. every correction trains the next prompt. nightly regen at 1 am.
          </p>
        </div>

        {/* Summary bar */}
        <div
          style={{
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16,
            background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10,
            padding: "20px 24px", marginBottom: 28,
            overflowX: "auto",
          }}
        >
          <StatCell label="total decisions logged" value={totalDecisions} />
          <StatCell label="total corrections" value={totalCorrections} />
          <StatCell label="domains instrumented" value={data?.stats.length ?? 0} />
        </div>

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} className="sl-skeleton" style={{ height: 120, borderRadius: 10, opacity: 0.25 + i * 0.05 }} />
            ))}
            <style>{`
              @keyframes sl-shimmer {
                0%   { background-position: -600px 0; }
                100% { background-position: 600px 0; }
              }
              .sl-skeleton {
                background: linear-gradient(90deg, var(--panel) 25%, var(--panel-elev) 50%, var(--panel) 75%);
                background-size: 1200px 100%;
                animation: sl-shimmer 1.6s infinite;
              }
            `}</style>
          </div>
        )}

        {error && (
          <div style={{ color: "#f87171", fontSize: 13, padding: "20px 0" }}>
            error: {error}
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
          <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 24 }}>
            generated at {new Date(data.generated_at).toLocaleString("en-US", { timeZone: "America/Detroit" })} et
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
