import type { Metadata } from "next";
import BrainCanvas from "../_components/BrainCanvas";

export const metadata: Metadata = {
  title: "graph · arthur",
  description: "the full neural map of arthur's brain — 438 files, 6,293 cross-references.",
};

export default function GraphPage() {
  return (
    <>
      <h1 style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
        Knowledge Graph
      </h1>
      {/* Explicit height fills the flex main-content area that AppShell provides */}
      <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
        <BrainCanvas source="/brain/api/graph-full" fullscreen />
        {/* Floating info panel */}
        <div style={{
          position: "absolute",
          top: 16,
          right: 20,
          background: "var(--glass-bg, rgba(19,22,27,0.92))",
          backdropFilter: "blur(var(--blur-amount, 12px))",
          WebkitBackdropFilter: "blur(var(--blur-amount, 12px))",
          border: "1px solid var(--glass-border, rgba(255,255,255,0.08))",
          borderRadius: 12,
          padding: "14px 18px",
          zIndex: 20,
          minWidth: 190,
          boxShadow: "var(--glass-shadow, 0 8px 24px rgba(0,0,0,0.4))",
          pointerEvents: "none",
        }}>
          <div style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--accent-orange, #d4ff3d)",
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
                <span style={{ fontSize: 11, color: "var(--text-muted, rgba(245,246,248,0.5))", letterSpacing: "0.04em" }}>{row.key}</span>
                <span style={{
                  fontSize: 12,
                  color: "var(--text-active, #f5f6f8)",
                  fontFamily: "var(--font-jetbrains, monospace)",
                  fontWeight: 500,
                }}>
                  {row.val}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, borderTop: "1px solid var(--glass-border, rgba(255,255,255,0.08))", paddingTop: 10 }}>
            <div style={{
              fontSize: 10,
              color: "var(--text-muted, rgba(245,246,248,0.5))",
              fontFamily: "var(--font-jetbrains, monospace)",
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
