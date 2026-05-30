"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ── types ─────────────────────────────────────────────────────────────────────
interface KPI {
  queries_today: number;
  avg_confidence: number | null;
  total_cost_usd: number;
  p99_latency_ms: number;
  p50_latency_ms: number;
  hallucination_count: number;
  daniel_corrections: { minor: number; major: number; complete_reroute: number };
  golden_pass_rate: number | null;
}

interface TelemetryData {
  generated_at: string;
  range_hours: number;
  error?: string;
  kpi: KPI;
  queries_per_hour: { hour: string; count: number }[];
  specialist_hit_rates: { name: string; hit_rate: number; total: number }[];
  composite_score_trend: { date: string; avg_score: number | null }[];
  cost_breakdown: { label: string; value: number }[];
  low_confidence_turns: {
    turn_id: string;
    ts: string;
    confidence: number;
    composite: number;
    specialists: string[];
    hallucinations: number;
  }[];
  golden_last_run: { ts: string; pass: number; fail: number; total: number; pass_rate: number } | null;
}

// ── palette ───────────────────────────────────────────────────────────────────
const TEAL = "#0B9E9C";
const TEAL_DIM = "#0B504F";
const BURGUNDY = "#8B1A2B";
const GOLD = "#C4963A";
const MUTED = "#3A3530";
const CHART_GRID = "#1E1C18";
const COST_COLORS = ["#0B9E9C", "#C4963A", "#4A7C59"];

function Tile({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "#171512", border: "1px solid #272320", borderRadius: 8,
      padding: "16px 20px", display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#6B6560" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-.03em", color: accent || "#F0EDE8", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6B6560" }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "#6B6560", marginBottom: 10 }}>
      {title}
    </div>
  );
}

const TOOLTIP_STYLE = {
  contentStyle: { background: "#171512", border: "1px solid #272320", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "#9B9590" },
  itemStyle: { color: "#F0EDE8" },
};

// ── main component ─────────────────────────────────────────────────────────────
export default function TelemetryDashboard() {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/telemetry/summary?hours=24", { cache: "no-store" });
      const json = await res.json() as TelemetryData;
      setData(json);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 60s
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <div style={{ color: "#6B6560", fontSize: 13, padding: "40px 0" }}>Loading telemetry...</div>;
  if (!data) return <div style={{ color: BURGUNDY, fontSize: 13 }}>Failed to load telemetry.</div>;

  const { kpi, queries_per_hour, specialist_hit_rates, composite_score_trend, cost_breakdown, low_confidence_turns, golden_last_run } = data;

  // Format hour labels to HH:mm
  const qphData = queries_per_hour.map(d => ({
    ...d,
    label: d.hour.slice(11, 16),
  }));

  // Filter trend to non-null
  const trendData = composite_score_trend.filter(d => d.avg_score !== null).map(d => ({
    date: d.date.slice(5),  // MM-DD
    score: d.avg_score,
  }));

  const totalCost = cost_breakdown.reduce((s, v) => s + v.value, 0);
  const costPct = cost_breakdown.map(c => ({
    ...c,
    pct: totalCost > 0 ? Math.round(c.value / totalCost * 100) : 0,
  }));

  const totalCorrections = kpi.daniel_corrections.minor + kpi.daniel_corrections.major + kpi.daniel_corrections.complete_reroute;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Refresh row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, color: "#6B6560" }}>
          {lastRefresh ? `Refreshed ${lastRefresh.toLocaleTimeString()}` : ""}
          {data.error ? <span style={{ color: BURGUNDY, marginLeft: 8 }}>({data.error.slice(0, 60)})</span> : null}
        </div>
        <button
          onClick={fetchData}
          style={{ fontSize: 11, color: TEAL, background: "none", border: "1px solid #272320", borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>

      {/* KPI tiles */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Tile label="Queries today" value={kpi.queries_today} />
        <Tile
          label="Avg confidence"
          value={kpi.avg_confidence != null ? `${Math.round(kpi.avg_confidence * 100)}%` : "—"}
          accent={kpi.avg_confidence != null && kpi.avg_confidence >= 0.8 ? TEAL : kpi.avg_confidence != null && kpi.avg_confidence < 0.6 ? BURGUNDY : GOLD}
        />
        <Tile
          label="Cost today"
          value={kpi.total_cost_usd > 0 ? `$${kpi.total_cost_usd.toFixed(4)}` : "$0.00"}
          sub={`p50: ${kpi.p50_latency_ms}ms · p99: ${kpi.p99_latency_ms}ms`}
        />
        <Tile
          label="p99 latency"
          value={`${kpi.p99_latency_ms}ms`}
          accent={kpi.p99_latency_ms > 5000 ? BURGUNDY : kpi.p99_latency_ms > 2000 ? GOLD : TEAL}
        />
        <Tile
          label="Hallucinations"
          value={kpi.hallucination_count}
          accent={kpi.hallucination_count > 0 ? BURGUNDY : TEAL}
          sub={totalCorrections > 0 ? `${totalCorrections} corrections` : undefined}
        />
        {kpi.golden_pass_rate != null && (
          <Tile
            label="Golden pass rate"
            value={`${kpi.golden_pass_rate}%`}
            accent={kpi.golden_pass_rate >= 80 ? TEAL : kpi.golden_pass_rate >= 60 ? GOLD : BURGUNDY}
            sub={golden_last_run ? `last run: ${new Date(golden_last_run.ts).toLocaleDateString()}` : undefined}
          />
        )}
      </div>

      {/* Row 2: queries/hr + specialist hit rate */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Queries per hour */}
        <div style={{ background: "#171512", border: "1px solid #272320", borderRadius: 8, padding: "16px 20px" }}>
          <SectionHeader title="Queries / hour (last 24h)" />
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={qphData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6B6560" }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: "#6B6560" }} allowDecimals={false} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="count" stroke={TEAL} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Per-specialist hit rate */}
        <div style={{ background: "#171512", border: "1px solid #272320", borderRadius: 8, padding: "16px 20px" }}>
          <SectionHeader title="Specialist hit rate %" />
          {specialist_hit_rates.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6B6560", paddingTop: 16 }}>No data yet — orchestrator_log.jsonl not populated</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={specialist_hit_rates} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#6B6560" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#9B9590" }} width={80} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v}%`, "hit rate"]} />
                <Bar dataKey="hit_rate" fill={TEAL_DIM} radius={[0, 3, 3, 0]}
                  label={{ position: "right", fontSize: 10, fill: "#9B9590", formatter: (v: unknown) => `${v}%` }} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Row 3: composite trend + cost donut */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>

        {/* Composite score trend */}
        <div style={{ background: "#171512", border: "1px solid #272320", borderRadius: 8, padding: "16px 20px" }}>
          <SectionHeader title="Composite score — 7-day trend" />
          {trendData.length === 0 ? (
            <div style={{ fontSize: 12, color: "#6B6560", paddingTop: 16 }}>No composite score history yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={trendData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6B6560" }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: "#6B6560" }} tickFormatter={v => v.toFixed(1)} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [Number(v).toFixed(3), "composite"]} />
                <Line type="monotone" dataKey="score" stroke={GOLD} strokeWidth={2} dot={{ r: 3, fill: GOLD }} activeDot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cost donut */}
        <div style={{ background: "#171512", border: "1px solid #272320", borderRadius: 8, padding: "16px 20px" }}>
          <SectionHeader title="Cost breakdown" />
          {totalCost === 0 ? (
            <div style={{ fontSize: 12, color: "#6B6560", paddingTop: 16 }}>No cost data yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={costPct} dataKey="value" cx="50%" cy="50%" innerRadius={35} outerRadius={52} paddingAngle={3}>
                    {costPct.map((entry, idx) => (
                      <Cell key={entry.label} fill={COST_COLORS[idx % COST_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`$${Number(v).toFixed(5)}`, ""]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                {costPct.map((c, idx) => (
                  <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#9B9590" }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: COST_COLORS[idx % COST_COLORS.length], flexShrink: 0 }} />
                    {c.label} {c.pct}%
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: low-confidence turns table */}
      <div style={{ background: "#171512", border: "1px solid #272320", borderRadius: 8, padding: "16px 20px" }}>
        <SectionHeader title="Recent low-confidence turns" />
        {low_confidence_turns.length === 0 ? (
          <div style={{ fontSize: 12, color: "#6B6560" }}>No low-confidence turns in range</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #272320" }}>
                {["turn_id", "time", "confidence", "composite", "specialists", "flags"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px", color: "#6B6560", fontWeight: 500, fontSize: 11 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {low_confidence_turns.map(t => (
                <tr key={t.turn_id} style={{ borderBottom: "1px solid #1A1815" }}>
                  <td style={{ padding: "5px 8px", fontFamily: "monospace", fontSize: 11, color: "#6B6560" }}>{t.turn_id}</td>
                  <td style={{ padding: "5px 8px", color: "#9B9590" }}>{new Date(t.ts).toLocaleTimeString()}</td>
                  <td style={{ padding: "5px 8px", color: t.confidence < 0.4 ? BURGUNDY : GOLD }}>{Math.round(t.confidence * 100)}%</td>
                  <td style={{ padding: "5px 8px", color: "#9B9590" }}>{t.composite?.toFixed(3) ?? "—"}</td>
                  <td style={{ padding: "5px 8px", color: "#9B9590" }}>{(t.specialists || []).join(", ") || "—"}</td>
                  <td style={{ padding: "5px 8px", color: t.hallucinations > 0 ? BURGUNDY : "#9B9590" }}>{t.hallucinations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div style={{ fontSize: 11, color: "#3A3530", textAlign: "right" }}>
        Generated {new Date(data.generated_at).toLocaleString()} · Auto-refresh 60s
      </div>
    </div>
  );
}
