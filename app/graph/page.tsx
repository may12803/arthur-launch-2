import type { Metadata } from "next";
import BrainCanvas from "../_components/BrainCanvas";

export const metadata: Metadata = {
  title: "graph · arthur",
  description: "the full neural map of arthur's brain — 438 files, 6,293 cross-references.",
};

// Dark-theme S tokens (matching app/_components/AppShell.tsx + app/finance/page.tsx).
// BrainCanvas (shared with /brain) themes itself off CSS custom properties; globals.css
// defines them as LIGHT editorial values, which clashes with AppShell's dark S.bg main area.
// Override the vars here so the canvas inherits the dark palette without touching BrainCanvas.
const S = {
  bg: "#0a0a0a",
  bg2: "#111111",
  bg3: "#181818",
  border: "#1f1f1f",
  border2: "#2a2a2a",
  textPrimary: "#e8e8e8",
  textSecondary: "#8a8a8a",
  textMuted: "#4a4a4a",
  accent: "#f0a500",
  mono: "var(--font-jetbrains, 'JetBrains Mono', 'GeistMono', monospace)",
} as const;

const graphTheme: React.CSSProperties = {
  ["--bg" as string]: S.bg,
  ["--bg-canvas" as string]: S.bg,
  ["--panel" as string]: S.bg2,
  ["--panel-bg" as string]: S.bg2,
  ["--text" as string]: S.textPrimary,
  ["--text-active" as string]: S.textPrimary,
  ["--text-main" as string]: S.textSecondary,
  ["--text-dim" as string]: S.textSecondary,
  ["--text-faint" as string]: S.textMuted,
  ["--text-muted" as string]: S.textMuted,
  ["--border" as string]: S.border,
  ["--border-strong" as string]: S.border2,
  ["--accent" as string]: S.accent,
  ["--accent-orange" as string]: S.accent,
};

export default function GraphPage() {
  return (
    <>
      <h1 style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
        Knowledge Graph
      </h1>
      {/* Explicit height fills the flex main-content area that AppShell provides.
          graphTheme pins the dark S tokens onto the CSS vars BrainCanvas reads. */}
      <div style={{ ...graphTheme, position: "relative", width: "100%", height: "100%", overflow: "hidden", background: S.bg, color: S.textPrimary }}>
        <BrainCanvas source="/brain/api/graph-full" fullscreen />
        {/* Floating info panel */}
        <div style={{
          position: "absolute",
          top: 16,
          right: 20,
          background: S.bg2,
          border: `1px solid ${S.border2}`,
          borderRadius: 12,
          padding: "14px 18px",
          zIndex: 20,
          minWidth: 190,
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          pointerEvents: "none",
        }}>
          <div style={{
            fontFamily: S.mono,
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: S.accent,
            marginBottom: 10,
          }}>knowledge graph</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { key: "nodes", val: "2,163" },
              { key: "edges", val: "6,293" },
              { key: "modules", val: "22" },
              { key: "confidence", val: "86%" },
            ].map(row => (
              <div key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: S.textSecondary, letterSpacing: "0.04em" }}>{row.key}</span>
                <span style={{
                  fontSize: 12,
                  color: S.textPrimary,
                  fontFamily: S.mono,
                  fontWeight: 500,
                }}>
                  {row.val}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, borderTop: `1px solid ${S.border}`, paddingTop: 10 }}>
            <div style={{
              fontSize: 10,
              color: S.textMuted,
              fontFamily: S.mono,
              lineHeight: 1.7,
              letterSpacing: "0.03em",
            }}>
              G to reset view<br />
              Esc to close panel
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
