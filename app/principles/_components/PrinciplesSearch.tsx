"use client";

import { useState } from "react";

interface Principle {
  id?: string;
  principle: string;
  applicable_when?: string;
  trigger_conditions?: string;
  rationale?: string;
  evidence_turn_ids?: string[];
  source_trajectory_count?: number;
  confidence: number;
  created_at?: string;
}

function confColor(conf: number): string {
  if (conf >= 0.85) return "#0B504F";
  if (conf >= 0.70) return "#1E3A8A";
  return "#BAB5AE";
}

function confLabel(conf: number): string {
  if (conf >= 0.90) return "high confidence";
  if (conf >= 0.80) return "solid";
  if (conf >= 0.70) return "provisional";
  return "emerging";
}

export default function PrinciplesSearch({ principles }: { principles: Principle[] }) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const filtered = q
    ? principles.filter(p =>
        p.principle.toLowerCase().includes(q) ||
        (p.rationale ?? "").toLowerCase().includes(q) ||
        (p.applicable_when ?? "").toLowerCase().includes(q) ||
        (p.trigger_conditions ?? "").toLowerCase().includes(q)
      )
    : principles;

  return (
    <>
      {/* Search input — pill shape */}
      <div style={{ marginBottom: "var(--space-lg)", position: "relative" }}>
        <input
          type="text"
          aria-label="Search principles"
          placeholder="search principles…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 520,
            padding: "11px 16px 11px 42px",
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            borderRadius: "var(--radius-pill)",
            color: "var(--text-active)",
            fontSize: "var(--fs-small)",
            fontFamily: "inherit",
            outline: "none",
            transition: "border-color 150ms, box-shadow 150ms",
          }}
          onFocus={e => {
            e.currentTarget.style.borderColor = "var(--accent-orange)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(11,80,79,0.12)";
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = "var(--glass-border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <svg
          width="14" height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#BAB5AE"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        {q && (
          <span style={{
            position: "absolute",
            right: 16,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: 11,
            color: "#BAB5AE",
            fontFamily: "var(--font-jetbrains, monospace)",
          }}>
            {filtered.length} / {principles.length}
          </span>
        )}
      </div>

      {/* Principles list */}
      {filtered.length === 0 ? (
        <p style={{ fontSize: 13, color: "#BAB5AE", fontFamily: "var(--font-jetbrains, monospace)" }}>
          no principles match &ldquo;{query}&rdquo;
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", maxWidth: 820 }}>
          {filtered.map((p, i) => (
            <div key={p.id || i} style={{
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              backdropFilter: "blur(var(--blur-amount))",
              borderRadius: "var(--radius-panel)",
              overflow: "hidden",
              boxShadow: "var(--glass-shadow)",
            }}>
              <div style={{ padding: "18px 22px 14px" }}>
                {/* Confidence meter */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{
                    flex: 1,
                    height: 3,
                    background: "#E8E4DB",
                    borderRadius: 2,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.round(p.confidence * 100)}%`,
                      background: confColor(p.confidence),
                      borderRadius: 2,
                      transition: "width 0.4s var(--ease-out-soft)",
                    }} />
                  </div>
                  <span style={{
                    fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                    fontSize: 11,
                    color: confColor(p.confidence),
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}>
                    {Math.round(p.confidence * 100)}% · {confLabel(p.confidence)}
                  </span>
                </div>

                {/* Rule statement */}
                <h3 style={{
                  fontFamily: "var(--font-lora, 'Lora', Georgia, serif)",
                  fontSize: 17,
                  fontWeight: 500,
                  color: "#1A1713",
                  margin: "0 0 10px",
                  lineHeight: 1.45,
                  letterSpacing: "-0.01em",
                }}>
                  {p.principle}
                </h3>

                {/* Source modules */}
                {p.evidence_turn_ids && p.evidence_turn_ids.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                    {p.evidence_turn_ids.slice(0, 4).map(id => (
                      <span key={id} style={{
                        fontFamily: "var(--font-jetbrains, monospace)",
                        fontSize: 10,
                        color: "rgba(26,23,19,0.45)",
                        background: "#F6F3EE",
                        border: "1px solid #E8E4DB",
                        borderRadius: 4,
                        padding: "1px 7px",
                      }}>
                        {id.length > 24 ? `${id.slice(0, 22)}…` : id}
                      </span>
                    ))}
                    {p.evidence_turn_ids.length > 4 && (
                      <span style={{
                        fontFamily: "var(--font-jetbrains, monospace)",
                        fontSize: 10,
                        color: "#BAB5AE",
                        padding: "1px 7px",
                      }}>
                        +{p.evidence_turn_ids.length - 4} more
                      </span>
                    )}
                  </div>
                )}

                {/* Expandable why it matters */}
                {(p.applicable_when || p.trigger_conditions || p.rationale) && (
                  <details style={{ marginTop: 4 }}>
                    <summary style={{
                      fontSize: 11,
                      color: "#BAB5AE",
                      cursor: "pointer",
                      listStyle: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      userSelect: "none",
                    }}>
                      <span style={{ fontSize: 9 }}>▶</span>
                      why it matters
                    </summary>
                    <div style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: "1px solid #E8E4DB",
                    }}>
                      {(p.applicable_when || p.trigger_conditions) && (
                        <div style={{
                          background: "#F6F3EE",
                          borderRadius: 7,
                          padding: "8px 12px",
                          marginBottom: 8,
                        }}>
                          <span style={{
                            fontSize: 9,
                            color: "#BAB5AE",
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            display: "block",
                            marginBottom: 3,
                          }}>
                            when
                          </span>
                          <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.55 }}>
                            {p.applicable_when || p.trigger_conditions}
                          </p>
                        </div>
                      )}
                      {p.rationale && (
                        <p style={{ margin: 0, fontSize: 13, color: "#BAB5AE", lineHeight: 1.6 }}>
                          {p.rationale}
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </div>

              {/* Footer metadata */}
              <div style={{
                borderTop: "1px solid #E8E4DB",
                padding: "8px 22px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                {p.source_trajectory_count != null && (
                  <span style={{ fontSize: 10, color: "#BAB5AE", fontFamily: "var(--font-jetbrains, monospace)" }}>
                    {p.source_trajectory_count} trajectories
                  </span>
                )}
                {p.created_at && (
                  <span style={{ fontSize: 10, color: "#BAB5AE", fontFamily: "var(--font-jetbrains, monospace)" }}>
                    {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
