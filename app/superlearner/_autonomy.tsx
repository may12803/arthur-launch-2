"use client";

import { useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────
interface SignalCount {
  signal_type: string;
  count: number;
  avg_reward: number;
}

interface RewardModelRow {
  domain: string;
  version: string;
  validation_accuracy: number;
  trained_on_n_examples: number;
  created_at: string;
}

interface CurriculumStats {
  domain: string;
  total: number;
  correct: number;
  accuracy: number;
  by_kind: Record<string, { total: number; correct: number }>;
}

interface HardCase {
  domain: string;
  mutation_kind: string;
  generated_input: { from?: string; subject?: string };
  predicted_decision: string;
  expected_decision: string;
  created_at: string;
}

interface AgreementPoint {
  date: string;
  agree_rate: number;
}

// ── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchSignalCounts(): Promise<SignalCount[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const r = await fetch(
    `/api/superlearner/autonomy-stats?type=signals&since=${encodeURIComponent(since)}`
  );
  if (!r.ok) return [];
  return r.json();
}

async function fetchRewardModels(): Promise<RewardModelRow[]> {
  const r = await fetch(`/api/superlearner/autonomy-stats?type=models`);
  if (!r.ok) return [];
  return r.json();
}

async function fetchCurriculumStats(): Promise<CurriculumStats[]> {
  const r = await fetch(`/api/superlearner/autonomy-stats?type=curriculum`);
  if (!r.ok) return [];
  return r.json();
}

async function fetchHardCases(): Promise<HardCase[]> {
  const r = await fetch(`/api/superlearner/autonomy-stats?type=hard_cases`);
  if (!r.ok) return [];
  return r.json();
}

async function fetchAgreementHistory(): Promise<AgreementPoint[]> {
  const r = await fetch(`/api/superlearner/autonomy-stats?type=agreement_history`);
  if (!r.ok) return [];
  return r.json();
}

// ── Mini sparkline ────────────────────────────────────────────────────────────
function Sparkline({ points }: { points: AgreementPoint[] }) {
  if (!points.length) return <div className="text-xs text-neutral-500">no agreement history yet</div>;

  const W = 280, H = 60;
  const vals = points.map(p => p.agree_rate);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = Math.max(max - min, 0.05);

  const coords = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * W;
    const y = H - ((p.agree_rate - min) / range) * (H - 8) - 4;
    return `${x},${y}`;
  });

  const path = `M ${coords.join(" L ")}`;
  const trend = vals.length >= 2 ? vals[vals.length - 1] - vals[0] : 0;

  return (
    <div>
      <svg width={W} height={H} className="overflow-visible">
        <polyline
          fill="none"
          stroke={trend >= 0 ? "#22c55e" : "#ef4444"}
          strokeWidth="2"
          points={coords.join(" ")}
        />
        {points.map((p, i) => {
          const [x, y] = coords[i].split(",").map(Number);
          return (
            <circle key={i} cx={x} cy={y} r="3"
              fill={trend >= 0 ? "#22c55e" : "#ef4444"}
              aria-label={`${p.date}: ${(p.agree_rate * 100).toFixed(0)}%`}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-xs text-neutral-500 mt-1">
        <span>{points[0]?.date?.slice(5)}</span>
        <span className={trend >= 0 ? "text-green-400" : "text-red-400"}>
          {trend >= 0 ? "+" : ""}{(trend * 100).toFixed(1)}pp
        </span>
        <span>{points[points.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  );
}

// ── Signal type badge ─────────────────────────────────────────────────────────
const SIGNAL_COLORS: Record<string, string> = {
  silent_confirm:          "bg-green-900 text-green-300",
  silent_disapprove:       "bg-red-900 text-red-300",
  cross_model_agree:       "bg-blue-900 text-blue-300",
  cross_model_disagree:    "bg-yellow-900 text-yellow-300",
  temporal_consistency:    "bg-purple-900 text-purple-300",
  holdout_backtest:        "bg-indigo-900 text-indigo-300",
  downstream_outcome:      "bg-orange-900 text-orange-300",
  adversarial_consistency: "bg-pink-900 text-pink-300",
};

function SignalBadge({ type }: { type: string }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-mono ${SIGNAL_COLORS[type] || "bg-neutral-800 text-neutral-300"}`}>
      {type.replace(/_/g, " ")}
    </span>
  );
}

// ── Card shell ────────────────────────────────────────────────────────────────
function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-neutral-900 border border-neutral-800 rounded-lg p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest mb-4">{title}</h3>
      {children}
    </div>
  );
}

// ── Main autonomy section ─────────────────────────────────────────────────────
export function AutonomySection() {
  const [signals,     setSignals]     = useState<SignalCount[]>([]);
  const [models,      setModels]      = useState<RewardModelRow[]>([]);
  const [curriculum,  setCurriculum]  = useState<CurriculumStats[]>([]);
  const [hardCases,   setHardCases]   = useState<HardCase[]>([]);
  const [agreement,   setAgreement]   = useState<AgreementPoint[]>([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const [s, m, c, h, a] = await Promise.all([
        fetchSignalCounts(),
        fetchRewardModels(),
        fetchCurriculumStats(),
        fetchHardCases(),
        fetchAgreementHistory(),
      ]);
      if (!active) return;
      setSignals(s);
      setModels(m);
      setCurriculum(c);
      setHardCases(h);
      setAgreement(a);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 h-40 animate-pulse" />
        ))}
      </div>
    );
  }

  // Aggregate curriculum totals
  const currTotal   = curriculum.reduce((s, d) => s + d.total, 0);
  const currCorrect = curriculum.reduce((s, d) => s + d.correct, 0);
  const currPct     = currTotal > 0 ? Math.round(100 * currCorrect / currTotal) : 0;

  // Mutation accuracy across all domains
  const kindAgg: Record<string, { total: number; correct: number }> = {};
  for (const dom of curriculum) {
    for (const [kind, { total, correct }] of Object.entries(dom.by_kind || {})) {
      if (!kindAgg[kind]) kindAgg[kind] = { total: 0, correct: 0 };
      kindAgg[kind].total   += total;
      kindAgg[kind].correct += correct;
    }
  }

  const latestAgree = agreement.length ? agreement[agreement.length - 1].agree_rate : null;

  return (
    <div className="mt-10">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <h2 className="text-base font-semibold text-neutral-300 tracking-wide">Autonomous Learning Loops</h2>
        <span className="text-xs text-neutral-600 ml-auto">Phase 3 + 4</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Autonomous Signals Card */}
        <Card title="Reward Signals · Last 24h">
          {signals.length === 0 ? (
            <p className="text-neutral-500 text-sm">No signals yet. Hourly cron running.</p>
          ) : (
            <div className="space-y-2">
              {signals.map(s => (
                <div key={s.signal_type} className="flex items-center justify-between">
                  <SignalBadge type={s.signal_type} />
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <span className="text-neutral-400">{s.count}x</span>
                    <span className={s.avg_reward >= 0 ? "text-green-400" : "text-red-400"}>
                      avg {s.avg_reward >= 0 ? "+" : ""}{s.avg_reward.toFixed(3)}
                    </span>
                  </div>
                </div>
              ))}
              <p className="text-xs text-neutral-600 pt-2">
                Total: {signals.reduce((s, r) => s + r.count, 0)} events
              </p>
            </div>
          )}
        </Card>

        {/* Reward Model Card */}
        <Card title="Reward Models · Active">
          {models.length === 0 ? (
            <p className="text-neutral-500 text-sm">No models trained yet. Weekly cron runs Sundays 3am.</p>
          ) : (
            <div className="space-y-3">
              {models.map(m => (
                <div key={m.domain} className="flex justify-between items-start">
                  <div>
                    <span className="text-sm text-neutral-300 font-mono">{m.domain}</span>
                    <div className="text-xs text-neutral-600 mt-0.5">
                      {m.version} · {m.trained_on_n_examples} examples
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-mono font-bold ${
                      m.validation_accuracy >= 0.8 ? "text-green-400" :
                      m.validation_accuracy >= 0.6 ? "text-yellow-400" : "text-red-400"
                    }`}>
                      {(m.validation_accuracy * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-neutral-600">
                      {new Date(m.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Curriculum Card */}
        <Card title="Self-Curriculum · Last 30d">
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-3xl font-bold text-neutral-200">{currPct}%</span>
            <span className="text-sm text-neutral-500">mutation accuracy ({currCorrect}/{currTotal})</span>
          </div>

          {Object.keys(kindAgg).length > 0 && (
            <div className="space-y-1.5 mb-4">
              {Object.entries(kindAgg)
                .sort((a, b) => (a[1].correct / Math.max(a[1].total, 1)) - (b[1].correct / Math.max(b[1].total, 1)))
                .map(([kind, { total, correct }]) => {
                  const pct = total > 0 ? Math.round(100 * correct / total) : 0;
                  return (
                    <div key={kind} className="flex items-center gap-2">
                      <span className="text-xs text-neutral-400 font-mono w-36 truncate">{kind.replace(/_/g, " ")}</span>
                      <div className="flex-1 bg-neutral-800 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-neutral-500 w-8 text-right">{pct}%</span>
                    </div>
                  );
                })}
            </div>
          )}

          {hardCases.length > 0 && (
            <div>
              <div className="text-xs text-neutral-600 uppercase tracking-wider mb-2">Top 5 Hardest Synthetic Cases</div>
              <div className="space-y-1">
                {hardCases.slice(0, 5).map((c, i) => (
                  <div key={i} className="text-xs font-mono bg-neutral-800 rounded px-2 py-1.5">
                    <div className="flex gap-2">
                      <span className="text-neutral-600">{c.mutation_kind?.slice(0, 8)}</span>
                      <span className="text-neutral-400 truncate flex-1">{c.generated_input?.subject || c.generated_input?.from || "—"}</span>
                    </div>
                    <div className="flex gap-2 mt-0.5 text-neutral-600">
                      <span className="text-red-400">got:{c.predicted_decision}</span>
                      <span className="text-green-400">want:{c.expected_decision}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Self-game agreement graph */}
        <Card title="Self-Game · Cross-Model Agreement Over Time">
          {latestAgree !== null && (
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-3xl font-bold text-neutral-200">{(latestAgree * 100).toFixed(0)}%</span>
              <span className="text-sm text-neutral-500">current agreement rate</span>
            </div>
          )}
          <Sparkline points={agreement} />
          {agreement.length === 0 && (
            <p className="text-neutral-500 text-sm">No agreement history yet. Signal cron will populate this.</p>
          )}
          <p className="text-xs text-neutral-600 mt-3">
            Trending up = agent becoming more self-consistent. Target: &gt;85%.
          </p>
        </Card>

      </div>
    </div>
  );
}
