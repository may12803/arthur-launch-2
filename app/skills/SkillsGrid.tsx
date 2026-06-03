"use client";
import { useEffect, useState } from "react";

type Skill = { name: string; description: string };

const LOBE_COLORS: Record<string, string> = {
  design: "#a78bfa", engineering: "#0B504F", business: "#f59e0b",
  marketing: "#f59e0b", ops: "#60a5fa", seo: "#0B504F",
  data: "#c084fc", legal: "#c084fc", finance: "#0B504F",
  ai: "#60a5fa", content: "#f59e0b", security: "#0B504F",
};

function skillLobe(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, color] of Object.entries(LOBE_COLORS)) if (lower.includes(key)) return color;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return `hsl(${h % 360}, 55%, 65%)`;
}

export default function SkillsGrid({ skills }: { skills: Skill[] }) {
  const [open, setOpen] = useState<Skill | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? skills.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    : skills;

  return (
    <>
      {/* Search input — pill shape */}
      <div style={{ position: "relative", marginBottom: "var(--space-md)" }}>
        <svg
          width="14" height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-muted)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", zIndex: 1 }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          aria-label="Filter skills"
          placeholder="filter skills…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: "100%",
            maxWidth: 440,
            padding: "10px 14px 10px 38px",
            background: "var(--glass-bg)",
            border: "1px solid var(--glass-border)",
            color: "var(--text-active)",
            borderRadius: "var(--radius-pill)",
            fontFamily: "inherit",
            fontSize: "var(--fs-small)",
            outline: "none",
            transition: "border-color 0.15s, box-shadow 0.15s",
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
        {q && (
          <span style={{
            position: "absolute",
            right: 14,
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "var(--fs-mono)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-jetbrains, monospace)",
            pointerEvents: "none",
          }}>
            {filtered.length} / {skills.length}
          </span>
        )}
      </div>

      {/* Skills grid — 3 col desktop */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: "var(--space-sm)",
      }}>
        {filtered.map(s => {
          const c = skillLobe(s.name);
          return (
            <button
              key={s.name}
              type="button"
              onClick={() => setOpen(s)}
              style={{
                textAlign: "left",
                cursor: "pointer",
                background: "var(--glass-bg)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-panel)",
                color: "inherit",
                font: "inherit",
                width: "100%",
                padding: "var(--space-md)",
                transition: "transform 0.15s, border-color 0.15s, box-shadow 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = c;
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = `0 8px 24px -8px ${c}40`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "var(--glass-border)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", marginBottom: "var(--space-xs)" }}>
                <span style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: c,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${c}80`,
                }} />
                <div style={{
                  fontFamily: "var(--font-inter, Inter, sans-serif)",
                  fontWeight: 600,
                  fontSize: "var(--fs-small)",
                  color: "var(--text-active)",
                  letterSpacing: "-0.01em",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>{s.name}</div>
              </div>
              <div style={{
                fontSize: "var(--fs-mono)",
                color: "var(--text-muted)",
                lineHeight: 1.55,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}>
                {s.description}
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p style={{
          color: "var(--text-muted)",
          fontFamily: "var(--font-jetbrains, monospace)",
          fontSize: "var(--fs-mono)",
          marginTop: "var(--space-lg)",
        }}>
          no skills match &ldquo;{query}&rdquo;
        </p>
      )}

      {/* Detail modal */}
      {open && (
        <div
          onClick={() => setOpen(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(26,23,19,0.40)",
            backdropFilter: "blur(8px)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-md)",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "var(--glass-bg-strong)",
              border: "1px solid var(--glass-border)",
              borderRadius: "var(--radius-panel)",
              padding: "var(--space-lg)",
              width: "100%",
              maxWidth: 640,
              maxHeight: "85vh",
              overflowY: "auto",
              boxShadow: "0 8px 32px rgba(26,23,19,0.12), 0 2px 8px rgba(26,23,19,0.06)",
              backdropFilter: "blur(var(--blur-amount))",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)" }}>
              <span style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: skillLobe(open.name),
                boxShadow: `0 0 10px ${skillLobe(open.name)}80`,
                flexShrink: 0,
              }} />
              <h2 style={{
                fontFamily: "var(--font-lora, 'Lora', Georgia, serif)",
                fontWeight: 500,
                fontSize: "var(--fs-h3)",
                letterSpacing: "-0.02em",
                margin: 0,
                color: "var(--text-active)",
                flex: 1,
                wordBreak: "break-all",
              }}>
                {open.name}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="close"
                style={{
                  background: "var(--glass-bg)",
                  border: "1px solid var(--glass-border)",
                  borderRadius: "50%",
                  color: "var(--text-active)",
                  cursor: "pointer",
                  fontSize: 14,
                  width: 28,
                  height: 28,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >✕</button>
            </div>

            <div style={{
              fontFamily: "var(--font-jetbrains, monospace)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              marginBottom: "var(--space-xs)",
            }}>
              description
            </div>
            <p style={{
              color: "var(--text-active)",
              fontSize: "var(--fs-small)",
              lineHeight: 1.75,
              margin: 0,
              whiteSpace: "pre-wrap",
            }}>
              {open.description}
            </p>

            <div style={{
              fontFamily: "var(--font-jetbrains, monospace)",
              fontSize: 9,
              color: "var(--text-muted)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              margin: "var(--space-md) 0 var(--space-xs)",
            }}>
              location
            </div>
            <div style={{
              background: "var(--glass-bg)",
              border: "1px solid var(--glass-border)",
              borderRadius: 8,
              padding: "var(--space-sm) var(--space-md)",
            }}>
              <code style={{
                fontFamily: "var(--font-jetbrains, monospace)",
                fontSize: "var(--fs-mono)",
                color: "var(--text-active)",
                wordBreak: "break-all",
              }}>
                ~/.claude/skills/{open.name}/
              </code>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
