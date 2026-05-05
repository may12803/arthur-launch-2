import type { Metadata } from "next";
import { Nav } from "../_components/Layout";
import BrainCanvas from "../_components/BrainCanvas";

export const metadata: Metadata = {
  title: "graph · arthur",
  description: "the full neural map of arthur's brain — 438 files, 6,293 cross-references.",
};

export default function GraphPage() {
  return (
    <>
      <Nav />
      <h1 style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}>
        Knowledge Graph
      </h1>
      <div style={{ position: "relative" }}>
        <BrainCanvas source="/brain/api/graph-full" fullscreen />
        {/* Floating info panel — Deep Midnight glass */}
        <div style={{
          position: "fixed",
          top: 72,
          right: 20,
          background: "var(--glass-bg)",
          backdropFilter: "blur(var(--blur-amount))",
          WebkitBackdropFilter: "blur(var(--blur-amount))",
          border: "1px solid var(--glass-border)",
          borderRadius: 12,
          padding: "14px 18px",
          zIndex: 20,
          minWidth: 190,
          boxShadow: "var(--glass-shadow)",
        }}>
          {/* Eyebrow */}
          <div style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: 9,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "var(--accent-orange)",
            marginBottom: 10,
          }}>knowledge graph</div>

          {/* Stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { key: "nodes", val: "2,163" },
              { key: "edges", val: "6,293" },
              { key: "modules", val: "22" },
              { key: "confidence", val: "86%" },
            ].map(row => (
              <div key={row.key} style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.04em" }}>{row.key}</span>
                <span style={{
                  fontSize: 12,
                  color: "var(--text-active)",
                  fontFamily: "var(--font-jetbrains, monospace)",
                  fontWeight: 500,
                }}>
                  {row.val}
                </span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ marginTop: 12, borderTop: "1px solid var(--glass-border)", paddingTop: 10 }}>
            <div style={{
              fontSize: 10,
              color: "var(--text-muted)",
              fontFamily: "var(--font-jetbrains, monospace)",
              lineHeight: 1.7,
              letterSpacing: "0.03em",
            }}>
              Press G to reset view<br />
              Press Esc to exit
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
