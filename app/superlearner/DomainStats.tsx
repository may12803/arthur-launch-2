'use client';

import { useEffect, useState } from 'react';

interface HardCase {
  id: string;
  from?: string | null;
  subject?: string | null;
  predicted?: string | null;
  correct: string;
}

interface DomainStatsData {
  domain: string;
  total_decisions: number;
  total_corrections: number;
  accuracy_7d: number | null;
  accuracy_30d: number | null;
  hard_cases: HardCase[];
}

// v2 dark tokens
const D = {
  bg: '#0c0e12',
  glass: 'rgba(255,255,255,0.04)',
  glassBorder: 'rgba(255,255,255,0.08)',
  text: '#f5f6f8',
  textMuted: 'rgba(245,246,248,0.50)',
  textFaint: 'rgba(245,246,248,0.30)',
  accent: '#d4ff3d',
  accentSoft: 'rgba(212,255,61,0.14)',
  sep: 'rgba(255,255,255,0.08)',
  mono: "'JetBrains Mono','GeistMono',monospace",
  serif: "var(--font-lora, 'Lora', Georgia, serif)",
};

const DOMAIN_LABELS: Record<string, string> = {
  inbox:           "Inbox Triage",
  invoice:         "Invoice Detection",
  unsubscribe:     "Unsubscribe Classifier",
  calendar_invite: "Calendar Invites",
  reply_draft:     "Reply Drafts",
};

function accuracyColor(pct: number): string {
  if (pct >= 95) return "rgba(52,211,153,0.85)";
  if (pct >= 85) return "rgba(251,191,36,0.85)";
  return "rgba(239,68,68,0.85)";
}

function accuracyBg(pct: number): string {
  if (pct >= 95) return "rgba(52,211,153,0.12)";
  if (pct >= 85) return "rgba(251,191,36,0.12)";
  return "rgba(239,68,68,0.12)";
}

function AccuracyStat({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: D.mono, fontSize: 9, fontWeight: 700, color: D.textFaint, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>{label}</div>
      <div style={{
        fontFamily: D.mono, fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums",
        color: accuracyColor(pct), background: accuracyBg(pct),
        padding: "2px 10px", borderRadius: 8,
      }}>{pct}%</div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontFamily: D.mono, fontSize: 9, fontWeight: 700, color: D.textFaint, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: D.mono, fontSize: 22, fontWeight: 700, color: D.accent, fontVariantNumeric: "tabular-nums" }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function HardCaseItem({ hardCase }: { hardCase: HardCase }) {
  return (
    <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: 8, padding: "10px 13px", fontSize: 12.5 }}>
      <div style={{ fontWeight: 600, color: D.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {hardCase.subject || "No Subject"}
      </div>
      <div style={{ fontSize: 11.5, color: D.textMuted, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {hardCase.from || "Unknown Sender"}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: D.mono, background: "rgba(239,68,68,0.12)", color: "rgba(239,68,68,0.85)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
          {hardCase.predicted || "N/A"}
        </span>
        <span style={{ color: D.textFaint, fontSize: 12 }}>→</span>
        <span style={{ fontFamily: D.mono, background: "rgba(52,211,153,0.12)", color: "rgba(52,211,153,0.85)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em" }}>
          {hardCase.correct}
        </span>
      </div>
    </div>
  );
}

function DomainCard({ domain }: { domain: DomainStatsData }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: 16, padding: "20px 24px", backdropFilter: "blur(16px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontFamily: D.serif, fontSize: 17, fontWeight: 500, color: D.text, margin: 0, letterSpacing: "-.015em" }}>
          {DOMAIN_LABELS[domain.domain] || domain.domain}
        </h2>
        <div style={{ display: "flex", gap: 16 }}>
          <AccuracyStat label="7d" value={domain.accuracy_7d} />
          <AccuracyStat label="30d" value={domain.accuracy_30d} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: domain.hard_cases?.length ? 14 : 0 }}>
        <StatBox label="Total Decisions" value={domain.total_decisions} />
        <StatBox label="Total Corrections" value={domain.total_corrections} />
      </div>

      {domain.hard_cases && domain.hard_cases.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "6px 0", fontFamily: D.mono, fontSize: 11, color: D.textMuted, display: "flex", alignItems: "center", gap: 6, letterSpacing: "0.06em" }}
          >
            <span style={{ fontSize: 9 }}>{expanded ? "▾" : "▸"}</span>
            {domain.hard_cases.length} hard cases
          </button>
          {expanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {domain.hard_cases.map(hc => <HardCaseItem key={hc.id} hardCase={hc} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DomainStats() {
  const [stats, setStats] = useState<DomainStatsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/superlearner/stats', { credentials: 'include' });
        if (!res.ok) throw new Error(`stats API ${res.status}`);
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json.stats ?? json.domains ?? []);
        setStats(list as DomainStatsData[]);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 80 }}>
        <div style={{ fontFamily: D.mono, fontSize: 11, color: D.textMuted, letterSpacing: "0.06em" }}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, padding: 80, color: "rgba(239,68,68,0.85)", fontSize: 13.5 }}>
        Error loading stats: {error}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: D.bg, padding: "32px 40px", fontFamily: "var(--font-inter, Inter, system-ui, sans-serif)" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: D.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: D.textMuted, marginBottom: 8 }}>
            correction loop
          </div>
          <h1 style={{ fontFamily: D.serif, fontSize: 28, fontWeight: 500, color: D.text, letterSpacing: "-.025em", lineHeight: 1.2, margin: "0 0 6px" }}>
            Superlearner
          </h1>
          <p style={{ fontSize: 13.5, color: D.textMuted, margin: 0 }}>Domain-level learning stats from Arthur&apos;s correction loop.</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {stats.map(domain => <DomainCard key={domain.domain} domain={domain} />)}
          {stats.length === 0 && (
            <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: 16, padding: "40px 24px", textAlign: "center", color: D.textMuted, fontSize: 13.5 }}>
              No stats yet. Corrections accumulate as Arthur makes and learns from mistakes.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
