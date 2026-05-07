import fs from "fs";
import path from "path";
import Link from "next/link";
import { Nav, Footer } from "../_components/Layout";
import { GlassPanel } from "../_components/GlassPanel";
import { PageHeader } from "../_components/PageHeader";
import { TokenChip } from "../_components/TokenChip";
import { EmptyState } from "../_components/EmptyState";
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
  history?: { score: number; ranAt: string }[];
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
    const file = path.join(process.cwd(), "public", "benchmarks.json");
    return JSON.parse(fs.readFileSync(file, "utf8")) as BenchData;
  } catch {
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const LOBE_CYCLE = [
  "var(--accent-orange)",
  "var(--tint-amber)",
  "var(--tint-violet)",
  "var(--tint-blue)",
  "var(--tint-emerald)",
  "var(--lobe-data)",
];

function lobeColor(i: number) {
  return LOBE_CYCLE[i % LOBE_CYCLE.length];
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
  const colorMap: Record<string, "success" | "warning" | "error" | "blue" | "muted"> = {
    measured: "success",
    stale: "warning",
    missing: "error",
    smoke: "blue",
    blocked: "error",
    open: "warning",
    done: "success",
  };
  const color = colorMap[status] ?? "error";
  return <TokenChip label={status} variant="status" size="xs" color={color} />;
}

function PassFailBar({ passed, total }: { passed: number; total: number }) {
  const pct = total > 0 ? (passed / total) * 100 : 0;
  return (
    <div className="bench-bar-wrap">
      <div className="bench-bar-pass" style={{ width: `${pct}%` }} />
      <div className="bench-bar-fail" style={{ width: `${100 - pct}%` }} />
    </div>
  );
}

function BenchCard({ bench, idx }: { bench: Benchmark; idx: number }) {
  const color = lobeColor(idx);
  const days = bench.status === "stale" ? daysSince(bench.latest?.ranAt) : null;

  return (
    <div className="bench-card glass">
      <div className="bench-card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span
            className="principle-dot"
            style={{ background: color, boxShadow: `0 0 8px ${color}80`, marginTop: 1 }}
          />
          <div>
            <div className="bench-name">{bench.name}</div>
            <div className="bench-kind">{bench.kind}</div>
          </div>
        </div>
        <StatusPill status={bench.status} />
      </div>

      <p className="bench-desc">{bench.description}</p>

      {bench.status === "measured" && bench.latest && (
        <div className="bench-measured">
          {bench.latest.score != null && (
            <div className="bench-score" style={{ color }}>
              {formatScore(bench.latest.score)}
            </div>
          )}
          {bench.latest.total != null && (
            <div className="bench-score-meta">
              {bench.latest.passed != null && bench.latest.failed != null ? (
                <>
                  <span style={{ color: "var(--tint-emerald)" }}>{bench.latest.passed} pass</span>
                  <span style={{ color: "var(--text-faint)", margin: "0 var(--space-1)" }}>/</span>
                  <span style={{ color: "var(--tint-red)" }}>{bench.latest.failed} fail</span>
                  <span style={{ color: "var(--text-faint)", margin: "0 var(--space-1)" }}>·</span>
                </>
              ) : null}
              <span>{bench.latest.total} total</span>
              <span style={{ color: "var(--text-faint)", margin: "0 var(--space-1)" }}>·</span>
              <span>run {formatDate(bench.latest.ranAt)}</span>
            </div>
          )}
          {bench.latest.passed != null && bench.latest.total != null && (
            <PassFailBar passed={bench.latest.passed} total={bench.latest.total} />
          )}
          {bench.latest.byLevel && (
            <div className="bench-levels">
              {Object.entries(bench.latest.byLevel).map(([level, data]) => (
                <div key={level} className="bench-level-chip">
                  <span className="bench-level-label">L{level}</span>
                  <span className="bench-level-score">
                    {data.correct}/{data.total}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {bench.status === "stale" && bench.latest && (
        <div className="bench-measured">
          {bench.latest.score != null && (
            <div className="bench-score" style={{ color }}>
              {formatScore(bench.latest.score)}
            </div>
          )}
          {days != null && (
            <div className="bench-stale-note">{days} days since last run</div>
          )}
          {bench.latest.passed != null && bench.latest.total != null && (
            <PassFailBar passed={bench.latest.passed} total={bench.latest.total} />
          )}
        </div>
      )}

      {bench.status === "smoke" && bench.latest && (
        <div className="bench-measured">
          {bench.latest.score != null && (
            <div className="bench-score" style={{ color }}>
              {formatScore(bench.latest.score)}
            </div>
          )}
          {bench.latest.total != null && (
            <div className="bench-score-meta">
              {bench.latest.passed != null && bench.latest.failed != null ? (
                <>
                  <span style={{ color: "var(--tint-emerald)" }}>{bench.latest.passed} pass</span>
                  <span style={{ color: "var(--text-faint)", margin: "0 var(--space-1)" }}>/</span>
                  <span style={{ color: "var(--tint-red)" }}>{bench.latest.failed} fail</span>
                  <span style={{ color: "var(--text-faint)", margin: "0 var(--space-1)" }}>·</span>
                </>
              ) : null}
              <span>{bench.latest.total} total</span>
              <span style={{ color: "var(--text-faint)", margin: "0 var(--space-1)" }}>·</span>
              <span>run {formatDate(bench.latest.ranAt)}</span>
            </div>
          )}
          {bench.latest.passed != null && bench.latest.total != null && (
            <PassFailBar passed={bench.latest.passed} total={bench.latest.total} />
          )}
        </div>
      )}

      {(bench.status === "missing" || bench.status === "blocked" || bench.status === "smoke" || bench.status === "measured") && bench.gapNote && (
        <p className="bench-gap-note">{bench.gapNote}</p>
      )}

      {bench.history && bench.history.length > 0 && (
        <div className="bench-history">
          <span className="bench-history-label">history</span>
          <span className="bench-history-scores">
            {bench.history
              .slice(-3)
              .map((h) => formatScore(h.score))
              .join(" → ")}
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

  if (!data) {
    return (
      <>
        <Nav />
        <div className="wrap" style={{ paddingTop: 108, paddingBottom: "var(--space-11)" }}>
          <PageHeader
            eyebrow="performance + gaps"
            title="benchmarks."
          />
          <EmptyState
            icon="📊"
            title="no benchmark runs yet."
            subtitle="generate a snapshot first: node scripts/snapshot-benchmarks.js"
            size="md"
          />
        </div>
        <Footer />
      </>
    );
  }

  const { benchmarks, gapFillPlans, pendingUpgrades, totalRuns, stats } = data;

  return (
    <>
      <Nav />
      <div className="wrap" style={{ paddingTop: 108, paddingBottom: "var(--space-12)" }}>

        {/* ── Header ── */}
        <PageHeader
          eyebrow={`performance + gaps · ${data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "live"}`}
          title="benchmarks."
          style={{ marginBottom: "var(--space-lg)" }}
        />

        {/* ── Hero stat + longmemeval iteration chart ── */}
        {(() => {
          const top = benchmarks
            .filter(b => b.latest?.score != null)
            .sort((a, b) => (b.latest?.score ?? 0) - (a.latest?.score ?? 0))[0];

          const longmemevalPoints = [
            { i: 1, score: 0 },
            { i: 2, score: 0.40 },
            { i: 3, score: 0.60 },
            { i: 4, score: 0.72 },
            { i: 5, score: 0.92 },
            { i: 6, score: 0.96 },
          ];

          const chartPoints = longmemevalPoints;

          return (
            <GlassPanel style={{
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: "var(--space-7)",
              padding: "var(--space-lg) var(--space-xl)",
              marginBottom: "var(--space-lg)",
              alignItems: "center",
            }}>
              <div>
                <div style={{
                  fontSize: "var(--fs-mono)",
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontFamily: "var(--font-mono)",
                  marginBottom: "var(--space-1)",
                }}>
                  {top ? top.name : "longmemeval-rag"}
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-display)",
                  fontWeight: 700,
                  color: "var(--accent-orange)",
                  lineHeight: 1,
                  letterSpacing: "var(--ls-display)",
                }}>
                  {top ? formatScore(top.latest?.score) : "96%"}
                </div>
                <div style={{ fontSize: "var(--fs-small)", color: "var(--text-muted)", marginTop: "var(--space-2)" }}>
                  {top ? "top benchmark score" : "longmemeval-rag · iter 6"}
                </div>
              </div>
              <div>
                <div style={{
                  fontSize: 9,
                  color: "var(--text-faint)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontFamily: "var(--font-mono)",
                  marginBottom: "var(--space-2)",
                }}>
                  longmemeval-rag iteration timeline
                </div>
                <BenchChart points={chartPoints} />
              </div>
            </GlassPanel>
          );
        })()}

        {/* ── Stat strip ── */}
        <div className="bench-stat-strip">
          <div className="bench-stat-tile glass">
            <div className="bench-stat-num" style={{ color: "var(--tint-emerald)" }}>{stats.measured}</div>
            <div className="bench-stat-label">MEASURED</div>
          </div>
          {stats.smoke ? (
            <div className="bench-stat-tile glass">
              <div className="bench-stat-num" style={{ color: "var(--tint-blue)" }}>{stats.smoke}</div>
              <div className="bench-stat-label">SMOKE</div>
            </div>
          ) : null}
          {stats.blocked ? (
            <div className="bench-stat-tile glass">
              <div className="bench-stat-num" style={{ color: "var(--tint-red)" }}>{stats.blocked}</div>
              <div className="bench-stat-label">BLOCKED</div>
            </div>
          ) : null}
          {stats.missing ? (
            <div className="bench-stat-tile glass">
              <div className="bench-stat-num" style={{ color: "var(--tint-red)" }}>{stats.missing}</div>
              <div className="bench-stat-label">MISSING</div>
            </div>
          ) : null}
          <div className="bench-stat-tile glass">
            <div className="bench-stat-num" style={{ color: "var(--tint-violet)" }}>{stats.gapFillCount}</div>
            <div className="bench-stat-label">GAP-FILL PLANS</div>
          </div>
          <div className="bench-stat-tile glass">
            <div className="bench-stat-num" style={{ color: "var(--tint-blue)" }}>{totalRuns.toLocaleString()}</div>
            <div className="bench-stat-label">TOTAL RUNS</div>
          </div>
        </div>

        {/* ── Benchmarks grid ── */}
        <div style={{ marginTop: "var(--space-8)" }}>
          <div className="bench-grid">
            {benchmarks.map((b, i) => (
              <BenchCard key={b.id} bench={b} idx={i} />
            ))}
          </div>
        </div>

        {/* ── Gap-fill queue ── */}
        <div style={{ marginTop: "var(--space-10)" }}>
          <span className="eyebrow">self-teach queue</span>
          <h2 className="bench-section-h2">the brain&apos;s punch list.</h2>
          <p className="section-lede" style={{ marginTop: "var(--space-3)" }}>
            Arthur generates these plans whenever a query exposes a knowledge gap. Each one
            specifies what to research, where to store it, and how to wire the new file into
            the graph. {gapFillPlans.length} plans queued.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginTop: "var(--space-6)" }}>
            {gapFillPlans.map((plan, i) => (
              <div key={plan.file} className="panel bench-plan-card">
                <div className="head">
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-2)" }}>
                    <span
                      className="principle-dot"
                      style={{
                        background: lobeColor(i),
                        boxShadow: `0 0 6px ${lobeColor(i)}80`,
                        marginTop: 5,
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div className="bench-plan-task">{plan.task}</div>
                      <div className="bench-plan-date">{formatDate(plan.generatedAt)}</div>
                    </div>
                  </div>
                  <StatusPill status={plan.status} />
                </div>
                <div className="body">
                  <pre className="bench-plan-preview">{plan.preview}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Pending upgrades band ── */}
        <GlassPanel className="bench-upgrades-band" style={{ marginTop: "var(--space-10)" }}>
          <div className="bench-upgrades-header">
            <span className="eyebrow">research distillate</span>
            <div className="bench-upgrades-count" style={{ color: "var(--tint-emerald)" }}>
              {pendingUpgrades.count}
            </div>
            <div className="bench-upgrades-sub">
              executable upgrades distilled from AI research knowledge
            </div>
          </div>
          <p className="bench-upgrades-desc">
            {pendingUpgrades.titles.slice(0, 10).join(", ")}
            {pendingUpgrades.titles.length > 10
              ? ` — and ${pendingUpgrades.count - 10} more`
              : ""}
            .
          </p>
        </GlassPanel>

        <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-8)" }}>
          <Link href="/dashboard" className="cta-btn">open dashboard →</Link>
          <Link href="/brain" className="btn-ghost">← the brain</Link>
        </div>
      </div>
      <Footer />
    </>
  );
}
