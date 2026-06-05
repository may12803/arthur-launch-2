"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
interface ChannelStats {
  channel: string;
  total_evals: number;
  correct: number;
  accuracy: number | null;
  last_run: string | null;
  trend_30d: TrendPoint[];
}

interface TrendPoint {
  date: string;
  accuracy: number;
}

interface HardCase {
  case_id: string;
  domain: string;
  arthur_decision: string;
  ground_truth: string;
  confidence: number | null;
  created_at: string;
}

interface ExternalStats {
  channels: ChannelStats[];
  total_free_cases: number;
  hard_cases: HardCase[];
  corpus_count: number;
  generated_at: string;
}

// ── Channel metadata ──────────────────────────────────────────────────────────
const CHANNEL_META: Record<string, { label: string; cadence: string; cost: string; color: string }> = {
  enron:          { label: "Enron Spam Bench",      cadence: "daily 3:30 AM",  cost: "$0",       color: "#3b82f6" },
  cross_llm:      { label: "Cross-LLM Consensus",   cadence: "hourly",         cost: "$0",       color: "#8b5cf6" },
  external_oracle:{ label: "External Oracle Verify", cadence: "daily 4:00 AM", cost: "$0",       color: "#06b6d4" },
  self_play:      { label: "Self-Play Tournament",   cadence: "daily 4:30 AM", cost: "$0",       color: "#10b981" },
  adversarial:    { label: "Adversarial Trainer",    cadence: "daily 5:00 AM", cost: "$0",       color: "#ef4444" },
  reasoning_eval: { label: "Reasoning Benchmark",   cadence: "weekly Sat",    cost: "$0",       color: "#f59e0b" },
  arxiv:          { label: "arXiv Ingest",           cadence: "daily 6:00 AM", cost: "$0",       color: "#84cc16" },
  frontier_gap:   { label: "Frontier Gap (Sonnet)",  cadence: "monthly",       cost: "~$5/mo",   color: "#f97316" },
};

const CHANNEL_ORDER = ["enron","cross_llm","external_oracle","self_play","adversarial","reasoning_eval","arxiv","frontier_gap"];

// ── Fetcher ───────────────────────────────────────────────────────────────────
async function fetchExternalStats(): Promise<ExternalStats | null> {
  try {
    const r = await fetch("/api/superlearner/external-stats");
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

// ── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ points, color }: { points: TrendPoint[]; color: string }) {
  if (!points || points.length < 2) {
    return <span style={{ fontSize: 11, color: "var(--text-muted)" }}>no trend data</span>;
  }

  const W = 200, H = 44;
  const vals = points.map(p => p.accuracy);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = Math.max(max - min, 0.02);

  const coords = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * W;
    const y = H - ((p.accuracy - min) / range) * (H - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const trend = vals[vals.length - 1] - vals[0];

  return (
    <div>
      <svg width={W} height={H} style={{ overflow: "visible" }}>
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          points={coords.join(" ")}
          opacity={0.8}
        />
        {points.map((_, i) => {
          const [x, y] = coords[i].split(",").map(Number);
          return (
            <circle key={i} cx={x} cy={y} r="2.5"
              fill={color}
              opacity={0.9}
            />
          );
        })}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
        <span>{points[0]?.date?.slice(5)}</span>
        <span style={{ color: trend >= 0 ? "#16A34A" : "#DC2626" }}>
          {trend >= 0 ? "+" : ""}{(trend * 100).toFixed(1)}pp
        </span>
        <span>{points[points.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

// ── Accuracy badge ────────────────────────────────────────────────────────────
function AccBadge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? "#16A34A" : pct >= 70 ? "#CA8A04" : "#DC2626";
  return (
    <span style={{ color, fontFamily: "var(--font-jetbrains, monospace)", fontSize: 15, fontWeight: 700 }}>
      {pct}%
    </span>
  );
}

// ── Channel card ──────────────────────────────────────────────────────────────
function ChannelCard({ ch, stats }: { ch: string; stats: ChannelStats | undefined }) {
  const meta = CHANNEL_META[ch] ?? { label: ch, cadence: "—", cost: "—", color: "#6b7280" };
  const hasData = !!stats && stats.total_evals > 0;

  return (
    <div style={{
      background: "var(--panel)",
      border: `1px solid var(--border)`,
      borderLeft: `3px solid ${meta.color}`,
      borderRadius: 8,
      padding: "16px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 12,
      minWidth: 0,
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{meta.label}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {meta.cadence} &middot; <span style={{ color: "#16A34A" }}>{meta.cost}</span>
          </div>
        </div>
        <AccBadge value={stats?.accuracy ?? null} />
      </div>

      {/* Metrics row */}
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>total evals</span>
          <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--text)" }}>
            {stats ? stats.total_evals.toLocaleString() : "—"}
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>last run</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-jetbrains, monospace)" }}>
            {stats?.last_run ? new Date(stats.last_run).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Detroit" }) : "never"}
          </span>
        </div>
      </div>

      {/* Sparkline */}
      {hasData && stats.trend_30d.length >= 2 ? (
        <Sparkline points={stats.trend_30d} color={meta.color} />
      ) : (
        <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
          {hasData ? "building trend..." : "awaiting first run"}
        </div>
      )}
    </div>
  );
}

// ── Hard cases table ──────────────────────────────────────────────────────────
function HardCasesTable({ cases }: { cases: HardCase[] }) {
  if (!cases.length) return (
    <div style={{ color: "var(--text-muted)", fontSize: 13, fontStyle: "italic" }}>
      No cross-LLM disagreements this week.
    </div>
  );

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          {["domain", "arthur said", "consensus said", "confidence", "date"].map(h => (
            <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {cases.map((c) => (
          <tr key={c.case_id + c.created_at} style={{ borderBottom: "1px solid var(--border)", opacity: 0.85 }}>
            <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{c.domain}</td>
            <td style={{ padding: "6px 8px", color: "#DC2626", fontFamily: "var(--font-jetbrains, monospace)" }}>{c.arthur_decision}</td>
            <td style={{ padding: "6px 8px", color: "#16A34A", fontFamily: "var(--font-jetbrains, monospace)" }}>{c.ground_truth}</td>
            <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>
              {c.confidence != null ? `${(c.confidence * 100).toFixed(0)}%` : "—"}
            </td>
            <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>
              {new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Detroit" })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function ExternalChannels() {
  const [stats, setStats] = useState<ExternalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchExternalStats();
      if (data) setStats(data);
      else setError("no channel data returned — check external pipeline");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5 * 60 * 1000); // refresh every 5min
    return () => clearInterval(interval);
  }, [load]);

  const channelMap = new Map<string, ChannelStats>(
    (stats?.channels ?? []).map(c => [c.channel, c])
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header strip */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid var(--border)",
        paddingBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
            Phase 5 — External Training Channels
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            Autonomous signal sources that compound without Daniel&apos;s input
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#16A34A", fontFamily: "var(--font-jetbrains, monospace)" }}>
            {stats ? stats.total_free_cases.toLocaleString() : "—"}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            free training cases captured
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-jetbrains, monospace)", marginTop: 4 }}>
            {stats?.generated_at
              ? `as of ${new Date(stats.generated_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Detroit" })} ET`
              : "—"}
          </div>
        </div>
      </div>

      {/* Error / loading state */}
      {loading && !stats && (
        <div style={{ color: "var(--text-muted)", fontSize: 13 }}>pulling external channel data…</div>
      )}
      {error && (
        <div style={{ color: "#DC2626", fontSize: 12 }}>Error: {error}</div>
      )}

      {/* Corpus count */}
      {stats && (
        <div style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "12px 16px",
          display: "flex",
          gap: 32,
          alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>external corpus size</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--text)" }}>
              {stats.corpus_count.toLocaleString()} docs
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>active channels</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-jetbrains, monospace)", color: "var(--text)" }}>
              {stats.channels.filter(c => c.total_evals > 0).length}/{CHANNEL_ORDER.length}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>est. daily cost</div>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-jetbrains, monospace)", color: "#16A34A" }}>
              $0 / day
            </div>
          </div>
          <div style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>
            updated {stats?.generated_at ? new Date(stats.generated_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/Detroit" }) : "—"}
          </div>
        </div>
      )}

      {/* Channel grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 12,
      }}>
        {CHANNEL_ORDER.map(ch => (
          <ChannelCard key={ch} ch={ch} stats={channelMap.get(ch)} />
        ))}
      </div>

      {/* Hard cases */}
      <div style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "20px 24px",
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>
          Top Disagreements This Week
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 400, marginLeft: 8 }}>
            cross-LLM consensus vs Arthur — anonymized
          </span>
        </div>
        <HardCasesTable cases={stats?.hard_cases ?? []} />
      </div>
    </div>
  );
}
