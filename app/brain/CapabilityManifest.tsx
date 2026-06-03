"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

// ── types ──────────────────────────────────────────────────────────────────

interface ModuleEntry {
  path: string;
  kind: "lib" | "script" | "engine" | "grader" | "eval";
  name: string;
  description: string | null;
  last_modified: number;
  size_kb: number;
}

interface Manifest {
  generated_at: string | null;
  pushed_at?: string;
  modules: ModuleEntry[];
  knowledge_files: { count: number; by_domain: Record<string, number> };
  graders: { count: number; domains: string[] };
  trajectories_today: number;
  eval_score_last: number | null;
  active_engines: string[];
}

// ── constants ──────────────────────────────────────────────────────────────

const KIND_COLORS: Record<string, string> = {
  lib:    "#60a5fa",
  script: "#a78bfa",
  grader: "#16A34A",
  eval:   "#fb923c",
  engine: "#ff4713",
};

const KIND_ORDER: ModuleEntry["kind"][] = ["grader", "eval", "engine", "lib", "script"];

function kindColor(k: string): string {
  return KIND_COLORS[k] ?? "#7a8090";
}

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "never";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Detroit",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function fmtAge(ts: string | null | undefined): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── EvalSparkline ──────────────────────────────────────────────────────────

function EvalScore({ score }: { score: number | null }) {
  if (score === null) return null;
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "#16A34A" : pct >= 60 ? "#CA8A04" : "#DC2626";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{
        fontFamily: "var(--font-jetbrains, monospace)",
        fontWeight: 700,
        fontSize: 28,
        color,
        letterSpacing: "-0.03em",
      }}>
        {pct}%
      </span>
      <span style={{
        fontFamily: "var(--font-jetbrains, monospace)",
        fontSize: 10,
        color: "var(--text-faint)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
      }}>
        frozen eval
      </span>
    </div>
  );
}

// ── LiveDot ────────────────────────────────────────────────────────────────

function LiveDot({ live }: { live: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: live ? "#16A34A" : "#6b7280",
          boxShadow: live ? "0 0 8px rgba(74,222,128,0.6)" : "none",
          animation: live ? "manifest-pulse 2s ease-in-out infinite" : "none",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <style>{`
        @keyframes manifest-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(74,222,128,0.6); }
          50%       { opacity: 0.5; box-shadow: 0 0 3px rgba(74,222,128,0.2); }
        }
      `}</style>
      <span style={{
        fontFamily: "var(--font-jetbrains, monospace)",
        fontSize: 10,
        color: live ? "#16A34A" : "var(--text-faint)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
      }}>
        {live ? "live" : "connecting"}
      </span>
    </span>
  );
}

// ── KindBreakdown ──────────────────────────────────────────────────────────

function KindBreakdown({ modules }: { modules: ModuleEntry[] }) {
  const counts = modules.reduce<Record<string, number>>((acc, m) => {
    acc[m.kind] = (acc[m.kind] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
      {KIND_ORDER.filter(k => counts[k]).map(k => (
        <span key={k} style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontFamily: "var(--font-jetbrains, monospace)",
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          padding: "3px 10px",
          border: `1px solid ${kindColor(k)}40`,
          borderRadius: 30,
          color: kindColor(k),
          background: `${kindColor(k)}10`,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            background: kindColor(k), flexShrink: 0,
          }} />
          {k} · {counts[k]}
        </span>
      ))}
    </div>
  );
}

// ── RecentModules ──────────────────────────────────────────────────────────

function RecentModules({ modules }: { modules: ModuleEntry[] }) {
  const recent = [...modules]
    .sort((a, b) => b.last_modified - a.last_modified)
    .slice(0, 10);

  if (recent.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontFamily: "var(--font-jetbrains, monospace)",
        fontSize: 10,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--text-faint)",
        marginBottom: 10,
      }}>
        recently updated
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {recent.map(m => (
          <div key={m.path} style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            padding: "7px 0",
            borderBottom: "1px solid var(--border)",
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: "50%",
              background: kindColor(m.kind),
              flexShrink: 0,
              marginTop: 2,
              alignSelf: "center",
            }} />
            <span style={{
              fontFamily: "var(--font-jetbrains, monospace)",
              fontSize: 12,
              color: "var(--text)",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {m.name}
            </span>
            {m.description && (
              <span style={{
                fontSize: 11,
                color: "var(--text-faint)",
                flex: 2,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {m.description}
              </span>
            )}
            <span style={{
              fontFamily: "var(--font-jetbrains, monospace)",
              fontSize: 9.5,
              color: "var(--text-faint)",
              flexShrink: 0,
              letterSpacing: "0.06em",
            }}>
              {m.size_kb}kb
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── main component ─────────────────────────────────────────────────────────

export default function CapabilityManifest() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [live, setLive]         = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const channelRef              = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // initial fetch
  useEffect(() => {
    fetch("/api/system/manifest")
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((d: Manifest) => setManifest(d))
      .catch(e => setErr(String(e)));
  }, []);

  // realtime subscription
  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;
    try { ch = supabase.channel("arthur-manifest-live"); } catch { return; }
    ch
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "arthur_system_manifest",
          filter: "id=eq.1",
        },
        (payload) => {
          const row = payload.new as { payload: Manifest; pushed_at: string };
          if (row?.payload) {
            setManifest({ ...row.payload, pushed_at: row.pushed_at });
          }
        }
      )
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
      });

    channelRef.current = ch;
    return () => {
      ch?.unsubscribe();
    };
  }, []);

  if (err) {
    return (
      <div style={{
        padding: "16px 20px",
        background: "rgba(239,68,68,0.06)",
        border: "1px solid rgba(239,68,68,0.2)",
        borderRadius: 8,
        fontFamily: "var(--font-jetbrains, monospace)",
        fontSize: 12,
        color: "#DC2626",
        marginTop: 24,
      }}>
        capability manifest unavailable — {err}
      </div>
    );
  }

  if (!manifest) {
    return (
      <div style={{ marginTop: 32 }}>
        <div style={{
          height: 2,
          width: 120,
          background: "linear-gradient(90deg, var(--accent), transparent)",
          borderRadius: 1,
          animation: "manifest-load 1.4s ease-in-out infinite",
          marginBottom: 16,
        }} />
        <style>{`
          @keyframes manifest-load {
            0%   { opacity: 1; width: 40px; }
            50%  { opacity: 0.5; width: 200px; }
            100% { opacity: 1; width: 40px; }
          }
        `}</style>
        <div style={{
          fontFamily: "var(--font-jetbrains, monospace)",
          fontSize: 11,
          color: "var(--text-faint)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}>
          syncing capability manifest…
        </div>
      </div>
    );
  }

  const totalMods = manifest.modules.length;

  return (
    <div style={{ marginTop: 40 }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <span className="eyebrow">capability manifest</span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {manifest.pushed_at && (
            <span style={{
              fontFamily: "var(--font-jetbrains, monospace)",
              fontSize: 10,
              color: "var(--text-faint)",
              letterSpacing: "0.06em",
            }}>
              {fmtAge(manifest.pushed_at)}
            </span>
          )}
          <LiveDot live={live} />
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 28 }}>
        <div className="stat">
          <span className="sv">{totalMods}</span>
          <span className="sl">modules</span>
        </div>
        <div className="stat">
          <span className="sv">{manifest.knowledge_files.count}</span>
          <span className="sl">knowledge files</span>
        </div>
        <div className="stat">
          <span className="sv">{manifest.graders.count}</span>
          <span className="sl">graders</span>
        </div>
        <div className="stat">
          <span className="sv">{manifest.trajectories_today}</span>
          <span className="sl">trajectories today</span>
        </div>
        {manifest.active_engines.length > 0 && (
          <div className="stat">
            <span className="sv">{manifest.active_engines.length}</span>
            <span className="sl">active engines</span>
          </div>
        )}
        {manifest.eval_score_last !== null && (
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <EvalScore score={manifest.eval_score_last} />
          </div>
        )}
      </div>

      {/* Kind breakdown pills */}
      <KindBreakdown modules={manifest.modules} />

      {/* Active engines */}
      {manifest.active_engines.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {manifest.active_engines.map(e => (
            <span key={e} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "var(--font-jetbrains, monospace)",
              fontSize: 10.5,
              padding: "3px 10px",
              border: "1px solid rgba(255,71,19,0.3)",
              borderRadius: 30,
              color: "var(--accent)",
              background: "rgba(255,71,19,0.06)",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: "var(--accent)",
                animation: "manifest-pulse 2.5s ease-in-out infinite",
              }} />
              {e}
            </span>
          ))}
        </div>
      )}

      {/* Recently updated modules */}
      <RecentModules modules={manifest.modules} />

      {/* Knowledge by domain */}
      {Object.keys(manifest.knowledge_files.by_domain).length > 0 && (
        <div>
          <div style={{
            fontFamily: "var(--font-jetbrains, monospace)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-faint)",
            marginBottom: 10,
          }}>
            knowledge by domain
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 6,
          }}>
            {Object.entries(manifest.knowledge_files.by_domain)
              .sort((a, b) => b[1] - a[1])
              .map(([domain, count]) => (
                <div key={domain} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 12px",
                  background: "rgba(19,22,27,0.7)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                }}>
                  <span style={{
                    fontFamily: "var(--font-jetbrains, monospace)",
                    fontSize: 11,
                    color: "var(--text-dim)",
                  }}>
                    {domain}
                  </span>
                  <span style={{
                    fontFamily: "var(--font-jetbrains, monospace)",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--text)",
                  }}>
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Timestamp footer */}
      {manifest.generated_at && (
        <p style={{
          fontSize: 10,
          fontFamily: "var(--font-jetbrains, monospace)",
          color: "var(--text-faint)",
          marginTop: 20,
          letterSpacing: "0.06em",
        }}>
          snapshot from {fmtTs(manifest.generated_at)} · pushed {fmtAge(manifest.pushed_at)}
        </p>
      )}
    </div>
  );
}
