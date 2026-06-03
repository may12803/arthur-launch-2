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

const D = {
  bg: '#0c0e12',
  glass: 'rgba(255,255,255,0.04)',
  glassBorder: 'rgba(255,255,255,0.08)',
  text: '#f5f6f8',
  textMuted: 'rgba(245,246,248,0.50)',
  textFaint: 'rgba(245,246,248,0.30)',
  accent: '#d4ff3d',
  mono: "'JetBrains Mono','GeistMono',monospace",
  serif: "var(--font-lora, 'Lora', Georgia, serif)",
};

const DOMAIN_LABELS: Record<string, string> = {
  inbox:           'Inbox Triage',
  invoice:         'Invoice Detection',
  unsubscribe:     'Unsubscribe Classifier',
  calendar_invite: 'Calendar Invites',
  reply_draft:     'Reply Drafts',
};

function accuracyColor(pct: number): string {
  if (pct >= 95) return 'rgba(52,211,153,0.85)';
  if (pct >= 85) return 'rgba(251,191,36,0.85)';
  return 'rgba(239,68,68,0.85)';
}

function accuracyBg(pct: number): string {
  if (pct >= 95) return 'rgba(52,211,153,0.12)';
  if (pct >= 85) return 'rgba(251,191,36,0.12)';
  return 'rgba(239,68,68,0.12)';
}

function AccuracyStat({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontFamily: D.mono, fontSize: 9, fontWeight: 700, color: D.textFaint, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: D.mono, fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: accuracyColor(pct), background: accuracyBg(pct), padding: '2px 10px', borderRadius: 8 }}>{pct}%</div>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontFamily: D.mono, fontSize: 9, fontWeight: 700, color: D.textFaint, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: D.mono, fontSize: 22, fontWeight: 700, color: D.accent, fontVariantNumeric: 'tabular-nums' }}>{value.toLocaleString()}</div>
    </div>
  );
}

function HardCaseItem({ hardCase }: { hardCase: HardCase }) {
  return (
    <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: 8, padding: '10px 13px', fontSize: 12.5 }}>
      <div style={{ fontWeight: 600, color: D.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hardCase.subject || 'No Subject'}</div>
      <div style={{ fontSize: 11.5, color: D.textMuted, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hardCase.from || 'Unknown Sender'}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: D.mono, background: 'rgba(239,68,68,0.12)', color: 'rgba(239,68,68,0.85)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>{hardCase.predicted || 'N/A'}</span>
        <span style={{ color: D.textFaint, fontSize: 12 }}>→</span>
        <span style={{ fontFamily: D.mono, background: 'rgba(52,211,153,0.12)', color: 'rgba(52,211,153,0.85)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>{hardCase.correct}</span>
      </div>
    </div>
  );
}

function DomainCard({ domain }: { domain: DomainStatsData }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: 16, padding: '20px 24px', backdropFilter: 'blur(16px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontFamily: D.serif, fontSize: 17, fontWeight: 500, color: D.text, margin: 0, letterSpacing: '-.015em' }}>{DOMAIN_LABELS[domain.domain] || domain.domain}</h2>
        <div style={{ display: 'flex', gap: 16 }}>
          <AccuracyStat label="7d" value={domain.accuracy_7d} />
          <AccuracyStat label="30d" value={domain.accuracy_30d} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: domain.hard_cases?.length ? 14 : 0 }}>
        <StatBox label="Total Decisions" value={domain.total_decisions} />
        <StatBox label="Total Corrections" value={domain.total_corrections} />
      </div>
      {domain.hard_cases && domain.hard_cases.length > 0 && (
        <div>
          <button onClick={() => setExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0', fontFamily: D.mono, fontSize: 11, color: D.textMuted, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: '0.06em' }}>
            <span style={{ fontSize: 9 }}>{expanded ? '▾' : '▸'}</span>
            {domain.hard_cases.length} hard cases
          </button>
          {expanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {domain.hard_cases.map(hc => <HardCaseItem key={hc.id} hardCase={hc} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: 16, padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ width: 160, height: 18, background: 'rgba(255,255,255,0.06)', borderRadius: 6 }} />
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ width: 44, height: 36, background: 'rgba(255,255,255,0.06)', borderRadius: 8 }} />
          <div style={{ width: 44, height: 36, background: 'rgba(255,255,255,0.06)', borderRadius: 8 }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ height: 68, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }} />
        <div style={{ height: 68, background: 'rgba(255,255,255,0.04)', borderRadius: 10 }} />
      </div>
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
        if (!res.ok) throw new Error(`stats ${res.status}: ${res.statusText}`);
        const json = await res.json() as { stats?: DomainStatsData[]; domains?: DomainStatsData[] } | DomainStatsData[];
        const list = Array.isArray(json) ? json : (json.stats ?? json.domains ?? []);
        setStats(list);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: D.bg, padding: '32px 40px', fontFamily: 'var(--font-inter, Inter, system-ui, sans-serif)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* Page header — always visible */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: D.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: D.textMuted, marginBottom: 8 }}>correction loop</div>
          <h1 style={{ fontFamily: D.serif, fontSize: 28, fontWeight: 500, color: D.text, letterSpacing: '-.025em', lineHeight: 1.2, margin: '0 0 6px' }}>Superlearner</h1>
          <p style={{ fontSize: 13.5, color: D.textMuted, margin: 0 }}>Domain-level learning stats from Arthur&apos;s correction loop.</p>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {['a', 'b', 'c'].map(k => <SkeletonCard key={k} />)}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 16, padding: '28px 24px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 20, flexShrink: 0, opacity: 0.8 }}>⚠</span>
            <div>
              <div style={{ fontFamily: D.mono, fontSize: 11, fontWeight: 700, color: 'rgba(239,68,68,0.85)', letterSpacing: '0.06em', marginBottom: 6, textTransform: 'uppercase' }}>Stats unavailable</div>
              <div style={{ fontSize: 13, color: D.textMuted }}>{error}</div>
              <div style={{ fontSize: 11.5, color: D.textFaint, marginTop: 8 }}>The correction loop is still running — stats appear once the DB responds.</div>
            </div>
          </div>
        )}

        {/* Domain cards */}
        {!loading && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {stats.map(domain => <DomainCard key={domain.domain} domain={domain} />)}
            {stats.length === 0 && (
              <div style={{ background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 32, marginBottom: 14, opacity: 0.25 }}>◎</div>
                <div style={{ fontFamily: D.serif, fontSize: 18, color: D.text, marginBottom: 8 }}>No corrections yet.</div>
                <div style={{ fontSize: 13, color: D.textMuted, maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>Stats accumulate as Arthur makes decisions and Daniel corrects them. Check back after the inbox runs.</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
