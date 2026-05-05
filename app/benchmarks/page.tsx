"use client";

import fs from "fs";
import path from "path";
import Link from "next/link";
import { useState } from "react";
import { Nav, Footer } from "../_components/Layout";
import BenchChart from "./BenchChart";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BenchLatest {
  score?: number;
  total?: number;
  passed?: number;
  failed?: number;
  ranAt?: string;
  byLevel?: Record<string, { total: number; correct: number }>;
}

interface Benchmark {
  id: string;
  name: string;
  kind: "external" | "internal";
  description: string;
  latest?: BenchLatest | null;
  history?: { score: number; ranAt:string }[];
  status: "measured" | "stale" | "missing" | "smoke" | "blocked";
  gapNote?: string | null;
  publicSetTotal?: number;
  buckets?: Record<string, string> | null;
}

interface GapFillPlan {
  file: string;
  task: string;
  generatedAt: string;
  preview: string;
  status: "open" | "done";
}

interface BenchData {
  benchmarks: Benchmark[];
  gapFillPlans: GapFillPlan[];
  pendingUpgrades: { count: number; titles: string[]; totalHeadings: number };
  totalRuns: number;
  stats: { measured: number; missing: number; stale: number; smoke?: number; blocked?: number; gapFillCount: number };
  lastUpdated: string;
}

// ─── Data ───────────────────────────────────────────────────────────────────

function loadData(): BenchData | null {
  try {
    // Note: In a client component, server-side modules like 'fs' and 'path'
    // only run during the initial server render. This is valid in Next.js App Router.
    const file = path.join(process.cwd(), "public", "benchmarks.json");
    return JSON.parse(fs.readFileSync(file, "utf8")) as BenchData;
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "var(--tint-amber)",
  "var(--tint-violet)",
  "var(--tint-blue)",
  "var(--tint-emerald)",
  "var(--tint-red)",
];

function getChartColor(i: number) {
  return CHART_COLORS[i % CHART_COLORS.length];
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatScore(score?: number) {
  if (score == null) return "—";
  return (score * 100).toFixed(1) + "%";
}

function daysSince(iso?: string | null) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / 86400000);
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    measured: { bg: "var(--tint-emerald-soft)", color: "var(--tint-emerald)", label: "measured" },
    stale: { bg: "var(--tint-amber-soft)", color: "var(--tint-amber)", label: "stale" },
    missing: { bg: "var(--tint-red-soft)", color: "var(--tint-red)", label: "missing" },
    smoke: { bg: "var(--tint-blue-soft)", color: "var(--tint-blue)", label: "smoke" },
    blocked: { bg: "var(--tint-red-soft)", color: "var(--tint-red)", label: "blocked" },
    open: { bg: "var(--tint-amber-soft)", color: "var(--tint-amber)", label: "open" },
    done: { bg: "var(--tint-emerald-soft)", color: "var(--tint-emerald)", label: "done" },
  };
  const s = map[status] || map.missing;
  return (
    <span className="status-pill" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function PassFailBar({ passed, total }: { passed: number; total: number }) {
  const pct = total > 0 ? (passed / total) * 100 : 0;
  return (
    <div className="pass-fail-bar">
      <div className="pass-fail-bar-inner" style={{ width: `${pct}%` }} />
    </div>
  );
}

function BenchCard({ bench, idx }: { bench: Benchmark; idx: number }) {
  const color = getChartColor(idx);
  const days = bench.status === "stale" ? daysSince(bench.latest?.ranAt) : null;

  return (
    <div className="bench-card">
      <header className="bench-card-header">
        <div className="bench-card-title-group">
          <span className="bench-card-dot" style={{ background: color, boxShadow: `0 0 8px 0 ${color}80` }} />
          <div>
            <h3 className="bench-card-name">{bench.name}</h3>
            <p className="bench-card-kind">{bench.kind}</p>
          </div>
        </div>
        <StatusPill status={bench.status} />
      </header>

      <p className="bench-card-desc">{bench.description}</p>

      {bench.latest && (bench.status === "measured" || bench.status === "stale" || bench.status === "smoke") && (
        <div className="bench-card-metrics">
          <div className="bench-card-score-row">
            {bench.latest.score != null && (
              <div className="bench-card-score" style={{ color }}>
                {formatScore(bench.latest.score)}
              </div>
            )}
            {bench.status === "stale" && days != null && (
              <div className="bench-card-stale-note">{days} days since last run</div>
            )}
          </div>

          {bench.latest.total != null && (
            <div className="bench-card-score-meta">
              {bench.latest.passed != null && bench.latest.failed != null ? (
                <>
                  <span style={{ color: "var(--tint-emerald)" }}>{bench.latest.passed} pass</span>
                  <span className="separator">/</span>
                  <span style={{ color: "var(--tint-red)" }}>{bench.latest.failed} fail</span>
                  <span className="separator">·</span>
                </>
              ) : null}
              <span>{bench.latest.total} total</span>
              <span className="separator">·</span>
              <span>run {formatDate(bench.latest.ranAt)}</span>
            </div>
          )}

          {bench.latest.passed != null && bench.latest.total != null && (
            <PassFailBar passed={bench.latest.passed} total={bench.latest.total} />
          )}

          {bench.latest.byLevel && (
            <div className="bench-card-levels">
              {Object.entries(bench.latest.byLevel).map(([level, data]) => (
                <div key={level} className="bench-card-level-chip">
                  <span className="level-label">L{level}</span>
                  <span className="level-score">{data.correct}/{data.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(bench.status === "missing" || bench.status === "blocked" || bench.status === "smoke" || bench.status === "measured") && bench.gapNote && (
        <p className="bench-card-gap-note">{bench.gapNote}</p>
      )}

      {bench.history && bench.history.length > 0 && (
        <div className="bench-card-history">
          <span className="history-label">history</span>
          <span className="history-scores">
            {bench.history.slice(-3).map((h) => formatScore(h.score)).join(" → ")}
            {" → "}
            <span style={{ color }}>{formatScore(bench.latest?.score)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BenchmarksPage() {
  const data = loadData();
  const [timeRange, setTimeRange] = useState("all");
  const [benchType, setBenchType] = useState("all");

  if (!data) {
    return (
      <>
        <Nav />
        <main className="page-container">
          <header className="page-header">
            <span className="eyebrow">performance + gaps</span>
            <h1>benchmarks.</h1>
          </header>
          <div className="error-panel">
            <p>
              No benchmark runs yet. Generate a snapshot first:{" "}
              <code>node scripts/snapshot-benchmarks.js</code>
            </p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const { benchmarks, gapFillPlans, pendingUpgrades, totalRuns, stats } = data;

  const filteredBenchmarks = benchmarks
    .filter(b => {
      if (benchType === 'all') return true;
      return b.kind === benchType;
    })
    .filter(b => {
      if (timeRange === 'all') return true;
      const days = parseInt(timeRange, 10);
      const daysAgo = daysSince(b.latest?.ranAt);
      return daysAgo !== null && daysAgo <= days;
    });

  const topBenchmark = benchmarks
    .filter(b => b.latest?.score != null)
    .sort((a, b) => (b.latest?.score ?? 0) - (a.latest?.score ?? 0))[0];

  const longmemevalPoints = [
    { i: 1, score: 0 }, { i: 2, score: 0.40 }, { i: 3, score: 0.60 },
    { i: 4, score: 0.72 }, { i: 5, score: 0.92 }, { i: 6, score: 0.96 },
  ];

  return (
    <>
      <Nav />
      <main className="page-container">
        <header className="page-header">
          <span className="eyebrow">
            performance + gaps · {data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "live"}
          </span>
          <h1>benchmarks.</h1>
        </header>

        <section className="hero-panel">
          <div className="hero-stat">
            <div className="hero-stat-label">{topBenchmark ? topBenchmark.name : "longmemeval-rag"}</div>
            <div className="hero-stat-value">{topBenchmark ? formatScore(topBenchmark.latest?.score) : "96%"}</div>
            <div className="hero-stat-sublabel">{topBenchmark ? "top benchmark score" : "longmemeval-rag · iter 6"}</div>
          </div>
          <div className="hero-chart">
            <div className="hero-chart-header">
              <h2 className="hero-chart-title">LongMemEval-RAG Iteration Timeline</h2>
              <div className="hero-chart-legend">
                <span className="legend-item"><span className="legend-dot" style={{backgroundColor: 'var(--accent-orange)'}}></span>Score</span>
              </div>
            </div>
            <div className="hero-chart-container">
              <BenchChart points={longmemevalPoints} />
            </div>
          </div>
        </section>

        <div className="stat-strip">
          <div className="stat-tile">
            <div className="stat-value" style={{ color: "var(--tint-emerald)" }}>{stats.measured}</div>
            <div className="stat-label">MEASURED</div>
          </div>
          {stats.smoke && (
            <div className="stat-tile">
              <div className="stat-value" style={{ color: "var(--tint-blue)" }}>{stats.smoke}</div>
              <div className="stat-label">SMOKE</div>
            </div>
          )}
          {stats.blocked && (
            <div className="stat-tile">
              <div className="stat-value" style={{ color: "var(--tint-red)" }}>{stats.blocked}</div>
              <div className="stat-label">BLOCKED</div>
            </div>
          )}
          {stats.missing && (
            <div className="stat-tile">
              <div className="stat-value" style={{ color: "var(--tint-red)" }}>{stats.missing}</div>
              <div className="stat-label">MISSING</div>
            </div>
          )}
          <div className="stat-tile">
            <div className="stat-value" style={{ color: "var(--tint-violet)" }}>{stats.gapFillCount}</div>
            <div className="stat-label">GAP-FILL PLANS</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value" style={{ color: "var(--tint-blue)" }}>{totalRuns.toLocaleString()}</div>
            <div className="stat-label">TOTAL RUNS</div>
          </div>
        </div>

        <section className="benchmarks-section">
          <header className="filter-bar">
            <div className="filter-group">
              <span className="filter-label">Type</span>
              <button onClick={() => setBenchType('all')} className={`filter-btn ${benchType === 'all' ? 'active' : ''}`}>All</button>
              <button onClick={() => setBenchType('internal')} className={`filter-btn ${benchType === 'internal' ? 'active' : ''}`}>Internal</button>
              <button onClick={() => setBenchType('external')} className={`filter-btn ${benchType === 'external' ? 'active' : ''}`}>External</button>
            </div>
            <div className="filter-group">
              <span className="filter-label">Time Range</span>
              <button onClick={() => setTimeRange('7')} className={`filter-btn ${timeRange === '7' ? 'active' : ''}`}>7d</button>
              <button onClick={() => setTimeRange('30')} className={`filter-btn ${timeRange === '30' ? 'active' : ''}`}>30d</button>
              <button onClick={() => setTimeRange('90')} className={`filter-btn ${timeRange === '90' ? 'active' : ''}`}>90d</button>
              <button onClick={() => setTimeRange('all')} className={`filter-btn ${timeRange === 'all' ? 'active' : ''}`}>All</button>
            </div>
          </header>
          <div className="benchmark-grid">
            {filteredBenchmarks.map((b, i) => (
              <BenchCard key={b.id} bench={b} idx={i} />
            ))}
          </div>
        </section>

        <section className="gap-fill-section">
          <header className="section-header">
            <span className="eyebrow">self-teach queue</span>
            <h2>The Brain&apos;s Punch List.</h2>
            <p className="section-lede">
              Arthur generates these plans whenever a query exposes a knowledge gap. Each one
              specifies what to research, where to store it, and how to wire the new file into
              the graph. {gapFillPlans.length} plans queued.
            </p>
          </header>
          <div className="gap-fill-list">
            {gapFillPlans.map((plan, i) => (
              <div key={plan.file} className="gap-fill-card">
                <header className="gap-fill-card-header">
                  <div className="gap-fill-card-title-group">
                    <span className="bench-card-dot" style={{ background: getChartColor(i), boxShadow: `0 0 6px 0 ${getChartColor(i)}80` }} />
                    <div>
                      <h3 className="gap-fill-task">{plan.task}</h3>
                      <p className="gap-fill-date">{formatDate(plan.generatedAt)}</p>
                    </div>
                  </div>
                  <StatusPill status={plan.status} />
                </header>
                <div className="gap-fill-body">
                  <pre>{plan.preview}</pre>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="upgrades-band">
          <div className="upgrades-header">
            <span className="eyebrow">research distillate</span>
            <div className="upgrades-count">{pendingUpgrades.count}</div>
            <p className="upgrades-sub">
              executable upgrades distilled from AI research knowledge
            </p>
          </div>
          <p className="upgrades-desc">
            {pendingUpgrades.titles.slice(0, 10).join(", ")}
            {pendingUpgrades.titles.length > 10 ? ` — and ${pendingUpgrades.count - 10} more` : ""}.
          </p>
        </section>

        <footer className="page-footer-actions">
          <Link href="/dashboard" className="cta-btn">open dashboard →</Link>
          <Link href="/brain" className="btn-ghost">← the brain</Link>
        </footer>
      </main>
      <Footer />
      <style jsx global>{`
        /* ─── Page Layout & Typography ──────────────────────────────── */
        .page-container {
          width: 100%;
          max-width: var(--max-w);
          margin: 0 auto;
          padding: 108px var(--page-gutter) 96px;
        }
        .page-header {
          margin-bottom: 48px;
        }
        .page-header h1 {
          font-size: clamp(2.5rem, 5vw, 3.5rem);
          font-weight: 700;
          color: var(--text-active);
          letter-spacing: -0.04em;
          margin: 4px 0 0;
          line-height: 1;
        }
        .eyebrow {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-faint);
        }
        .section-header {
          max-width: var(--max-w-narrow);
          margin-bottom: 32px;
        }
        .section-header h2 {
          font-size: clamp(1.75rem, 4vw, 2.25rem);
          font-weight: 700;
          color: var(--text-main);
          letter-spacing: -0.03em;
          margin: 4px 0 12px;
        }
        .section-lede {
          font-size: 16px;
          color: var(--text-muted);
          line-height: 1.6;
        }
        .page-footer-actions {
          display: flex;
          gap: 12px;
          margin-top: 48px;
        }
        .error-panel {
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          border-radius: var(--radius-panel);
          padding: 24px;
          color: var(--text-muted);
        }
        .error-panel code {
          background: var(--bg-base);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 13px;
          color: var(--text-main);
        }

        /* ─── Hero Panel ────────────────────────────────────────────── */
        .hero-panel {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 40px;
          padding: 32px;
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          box-shadow: var(--glass-t1-shadow);
          border-radius: var(--radius-panel);
          backdrop-filter: blur(var(--glass-t1-blur));
          margin-bottom: 24px;
        }
        @media (max-width: 800px) {
          .hero-panel { grid-template-columns: 1fr; gap: 32px; }
        }
        .hero-stat {
          border-right: 1px solid var(--line-separator);
          padding-right: 40px;
        }
        @media (max-width: 800px) {
          .hero-stat { border-right: 0; border-bottom: 1px solid var(--line-separator); padding-right: 0; padding-bottom: 32px; }
        }
        .hero-stat-label {
          font-size: 11px;
          color: var(--text-faint);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 8px;
        }
        .hero-stat-value {
          font-size: clamp(3rem, 8vw, 4.5rem);
          font-weight: 700;
          color: var(--accent-orange);
          line-height: 1;
          letter-spacing: -0.05em;
        }
        .hero-stat-sublabel {
          font-size: 14px;
          color: var(--text-muted);
          margin-top: 12px;
        }
        .hero-chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .hero-chart-title {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-muted);
          margin: 0;
        }
        .hero-chart-legend { font-size: 12px; color: var(--text-muted); }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-dot { width: 8px; height: 8px; border-radius: 50%; }
        .hero-chart-container { height: 120px; }

        /* ─── Stat Strip ────────────────────────────────────────────── */
        .stat-strip {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 16px;
          margin-bottom: 64px;
        }
        .stat-tile {
          padding: 16px;
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          border-radius: var(--radius-card);
          text-align: center;
        }
        .stat-value {
          font-size: 2rem;
          font-weight: 700;
          line-height: 1;
          letter-spacing: -0.03em;
        }
        .stat-label {
          font-size: 10px;
          color: var(--text-faint);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-top: 8px;
        }

        /* ─── Filter Bar ────────────────────────────────────────────── */
        .benchmarks-section { margin-top: 48px; }
        .filter-bar {
          display: flex;
          gap: 24px;
          margin-bottom: 24px;
          padding-bottom: 24px;
          border-bottom: 1px solid var(--line-separator);
        }
        .filter-group { display: flex; align-items: center; gap: 8px; }
        .filter-label {
          font-size: 12px;
          color: var(--text-muted);
          margin-right: 8px;
        }
        .filter-btn {
          font-size: 13px;
          padding: 6px 12px;
          border-radius: var(--radius-pill);
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .filter-btn:hover {
          background: var(--glass-t2-bg);
          border-color: var(--glass-t2-border);
          color: var(--text-active);
        }
        .filter-btn.active {
          background: var(--accent-orange-soft);
          border-color: var(--accent-orange);
          color: var(--accent-orange);
          font-weight: 500;
        }

        /* ─── Benchmark Grid & Cards ────────────────────────────────── */
        .benchmark-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: 20px;
        }
        .bench-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 20px;
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          box-shadow: var(--glass-t1-shadow);
          border-radius: var(--radius-card);
          backdrop-filter: blur(var(--glass-t1-blur));
          transition: all 0.2s ease-in-out;
        }
        .bench-card:hover {
          transform: translateY(-4px);
          background: var(--glass-t2-bg);
          border-color: var(--glass-t2-border);
          box-shadow: var(--glass-t2-shadow);
        }
        .bench-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .bench-card-title-group { display: flex; align-items: flex-start; gap: 12px; }
        .bench-card-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
        .bench-card-name { font-size: 16px; font-weight: 500; color: var(--text-active); margin: 0; }
        .bench-card-kind { font-size: 12px; color: var(--text-muted); margin: 2px 0 0; }
        .bench-card-desc { font-size: 14px; color: var(--text-muted); line-height: 1.5; margin: 0; }
        .bench-card-metrics { display: flex; flex-direction: column; gap: 12px; }
        .bench-card-score-row { display: flex; justify-content: space-between; align-items: baseline; }
        .bench-card-score { font-size: 24px; font-weight: 700; letter-spacing: -0.03em; }
        .bench-card-stale-note { font-size: 12px; color: var(--tint-amber); background: var(--tint-amber-soft); padding: 4px 8px; border-radius: var(--radius-pill); }
        .bench-card-score-meta { font-size: 12px; color: var(--text-muted); }
        .bench-card-score-meta .separator { color: var(--text-faint); margin: 0 6px; }
        .bench-card-levels { display: flex; flex-wrap: wrap; gap: 8px; }
        .bench-card-level-chip { display: flex; align-items: center; gap: 6px; background: var(--bg-mid); padding: 4px 8px; border-radius: var(--radius-sm); font-size: 12px; }
        .bench-card-level-chip .level-label { font-weight: 700; color: var(--text-muted); }
        .bench-card-level-chip .level-score { color: var(--text-main); }
        .bench-card-gap-note { font-size: 13px; color: var(--text-muted); line-height: 1.5; margin: 0; padding: 12px; background: var(--bg-mid); border-radius: var(--radius-sm); }
        .bench-card-history { font-size: 12px; color: var(--text-muted); border-top: 1px solid var(--line-separator); padding-top: 12px; }
        .bench-card-history .history-label { text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); margin-right: 8px; }
        .bench-card-history .history-scores { color: var(--text-muted); }

        /* ─── Shared Components ─────────────────────────────────────── */
        .status-pill {
          font-size: 11px;
          font-weight: 500;
          padding: 4px 10px;
          border-radius: var(--radius-pill);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          flex-shrink: 0;
        }
        .pass-fail-bar {
          width: 100%;
          height: 6px;
          background: var(--tint-red-soft);
          border-radius: var(--radius-pill);
          overflow: hidden;
        }
        .pass-fail-bar-inner {
          height: 100%;
          background: var(--tint-emerald);
          border-radius: var(--radius-pill);
        }

        /* ─── Gap Fill Section ──────────────────────────────────────── */
        .gap-fill-section { margin-top: 72px; }
        .gap-fill-list { display: flex; flex-direction: column; gap: 12px; }
        .gap-fill-card {
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          border-radius: var(--radius-card);
        }
        .gap-fill-card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 16px; }
        .gap-fill-card-title-group { display: flex; align-items: flex-start; gap: 12px; }
        .gap-fill-task { font-size: 15px; font-weight: 500; color: var(--text-main); margin: 0; }
        .gap-fill-date { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
        .gap-fill-body { border-top: 1px solid var(--line-separator); padding: 16px; }
        .gap-fill-body pre {
          background: var(--bg-base);
          padding: 12px;
          border-radius: var(--radius-sm);
          font-size: 12px;
          color: var(--text-muted);
          white-space: pre-wrap;
          word-break: break-all;
          margin: 0;
        }

        /* ─── Upgrades Band ─────────────────────────────────────────── */
        .upgrades-band {
          margin-top: 72px;
          padding: 24px 32px;
          background: var(--glass-t1-bg);
          border: 1px solid var(--glass-t1-border);
          box-shadow: var(--glass-t1-shadow);
          border-radius: var(--radius-panel);
          display: flex;
          align-items: center;
          gap: 32px;
        }
        @media (max-width: 768px) { .upgrades-band { flex-direction: column; align-items: flex-start; gap: 16px; } }
        .upgrades-header { text-align: center; flex-shrink: 0; }
        .upgrades-count {
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--tint-emerald);
          line-height: 1;
          margin-top: 4px;
        }
        .upgrades-sub { font-size: 12px; color: var(--text-muted); max-width: 150px; margin: 8px auto 0; }
        .upgrades-desc {
          font-size: 14px;
          color: var(--text-muted);
          line-height: 1.6;
          margin: 0;
          border-left: 1px solid var(--line-separator);
          padding-left: 32px;
        }
        @media (max-width: 768px) { .upgrades-desc { border-left: 0; padding-left: 0; border-top: 1px solid var(--line-separator); padding-top: 16px; } }
      `}</style>
    </>
  );
}