"use client";
import { useEffect, useState } from "react";
import { Nav, Footer } from "../_components/Layout";
import { GlassPanel } from "../_components/GlassPanel";
import { PageHeader } from "../_components/PageHeader";
import { TokenChip } from "../_components/TokenChip";

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
  if (value === null) return <span style={{ color: "var(--text-faint)", fontSize: "var(--fs-xs)" }}>—</span>;
  const pct = Math.round(value * 100);
  const color: "success" | "warning" | "error" = pct >= 90 ? "success" : pct >= 75 ? "warning" : "error";
  return (
    <TokenChip
      label={`${pct}%`}
      variant="status"
      size="sm"
      color={color}
      style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}
    />
  );
}

function StatCell({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
      <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 600, color: "var(--text-active)", fontFamily: "var(--font-mono)" }}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function DomainCard({ ds }: { ds: DomainStats }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <GlassPanel
      hoverable
      className="domain-card"
      style={{ padding: "var(--space-6)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}>
        <h3 style={{ margin: 0, fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text-active)", letterSpacing: "0.01em" }}>
          {DOMAIN_LABELS[ds.domain] ?? ds.domain}
        </h3>
        <div style={{ display: "flex", gap: "var(--space-4)", alignItems: "center" }}>
          {ds.active_prompt_version && (
            <TokenChip
              label={`v${ds.active_prompt_version}`}
              variant="tag"
              size="xs"
              color="muted"
              style={{ fontFamily: "var(--font-mono)" }}
            />
          )}
          <div style={{ display: "flex", gap: "var(--space-4)", textAlign: "center" }}>
            <div>
              <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", display: "block", marginBottom: "var(--space-1)" }}>7d</span>
              <AccuracyBadge value={ds.accuracy_7d} />
            </div>
            <div>
              <span style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", display: "block", marginBottom: "var(--space-1)" }}>30d</span>
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
              color: "var(--text-muted)", fontSize: "var(--fs-xs)", padding: 0,
              fontFamily: "inherit", letterSpacing: "0.02em",
              display: "flex", alignItems: "center", gap: "var(--space-1)",
            }}
          >
            <span style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>▼</span>
            {ds.hard_cases.length} Hardest Cases
          </button>

          {expanded && (
            <div style={{ marginTop: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 100px",
                gap: "var(--space-4)",
                padding: "0 var(--space-4)",
                fontSize: "var(--fs-mono)",
                color: "var(--text-faint)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>
                <span>Intent</span>
                <span>Predicted</span>
                <span>Correct</span>
                <span style={{ textAlign: "right" }}>Action</span>
              </div>
              {ds.hard_cases.map(c => (
                <div
                  key={c.id}
                  style={{
                    background: "var(--bg-mid)",
                    border: "1px solid var(--line-separator)",
                    borderRadius: "var(--radius-sm)",
                    padding: "var(--space-3) var(--space-4)",
                    fontSize: "var(--fs-small)",
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 1fr 100px",
                    gap: "var(--space-4)",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", overflow: "hidden" }}>
                    <div style={{ color: "var(--text-main)", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.subject ?? c.input_excerpt ?? "(no subject)"}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "var(--fs-mono)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.from ?? "(unknown)"}</div>
                  </div>
                  <span style={{ color: "var(--tint-red)", fontFamily: "var(--font-mono)" }}>
                    {c.predicted ?? "?"}
                  </span>
                  <span style={{ color: "var(--tint-emerald)", fontFamily: "var(--font-mono)" }}>
                    {c.correct}
                  </span>
                  <div style={{ textAlign: "right" }}>
                    <button style={{
                      background: "var(--glass-t1-bg)",
                      border: "1px solid var(--glass-t1-border)",
                      color: "var(--text-muted)",
                      fontSize: "var(--fs-mono)",
                      borderRadius: "var(--radius-sm)",
                      padding: "var(--space-1) var(--space-2)",
                      cursor: "pointer",
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
    </GlassPanel>
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
        .domain-card:hover {
          transform: translateY(-4px);
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.5); opacity: 0; }
        }
      `}</style>
      <main style={{
        maxWidth: "var(--max-w)",
        margin: "0 auto",
        padding: "108px var(--page-gutter) var(--page-gutter)",
        minHeight: "80vh",
      }}>
        {/* Header */}
        <PageHeader
          title="superlearner."
          subtitle="Active model: arthur-tuned-2026-05-03. Last trained: 14h ago."
          style={{ marginBottom: "var(--space-9)", maxWidth: "var(--max-w-narrow)" }}
          actions={
            <GlassPanel style={{ padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-card)", textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: "var(--tint-emerald)" }}>94.8%</div>
              <div style={{ fontSize: "var(--fs-mono)", color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "var(--space-1)" }}>accuracy</div>
            </GlassPanel>
          }
        />

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} className="arthur-skeleton" style={{ height: 120, opacity: 0.25 + i * 0.05 }} />
            ))}
          </div>
        )}

        {error && (
          <GlassPanel style={{ padding: "var(--space-6)", borderColor: "var(--tint-red-soft)" }}>
            <div style={{ color: "var(--tint-red)", fontSize: "var(--fs-small)", fontWeight: 500 }}>
              Error: Could not load Superlearner stats.
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "var(--fs-xs)", marginTop: "var(--space-2)", fontFamily: "var(--font-mono)" }}>
              {error}
            </div>
          </GlassPanel>
        )}

        {/* Domain cards */}
        {data && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            {data.stats.map(ds => (
              <DomainCard key={ds.domain} ds={ds} />
            ))}
          </div>
        )}

        {data && (
          <p style={{ fontSize: "var(--fs-mono)", color: "var(--text-faint)", marginTop: "var(--space-7)", textAlign: "center" }}>
            Generated at {new Date(data.generated_at).toLocaleString("en-US", { timeZone: "America/Detroit" })} ET
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
