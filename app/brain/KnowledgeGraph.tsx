"use client";

import { useState } from "react";
import BrainCanvas from "@/app/_components/BrainCanvas";

type ViewMode = "cluster" | "force" | "radial";

interface KnowledgeGraphProps {
  lastUpdated?: string;
}

const VIEW_MODES: { id: ViewMode; label: string }[] = [
  { id: "cluster", label: "Cluster" },
  { id: "force", label: "Force" },
  { id: "radial", label: "Radial" },
];

const LOBE_LEGEND: { lobe: string; color: string }[] = [
  { lobe: "engineering", color: "#4ecdc4" },
  { lobe: "business", color: "#f7b731" },
  { lobe: "ai-research", color: "#a29bfe" },
  { lobe: "design", color: "#fd79a8" },
  { lobe: "finance", color: "#55efc4" },
  { lobe: "sales", color: "#e17055" },
  { lobe: "restaurant", color: "#fab1a0" },
  { lobe: "security", color: "#6c5ce7" },
  { lobe: "languages", color: "#00b894" },
  { lobe: "algorithms", color: "#0984e3" },
];

export default function KnowledgeGraph({ lastUpdated }: KnowledgeGraphProps) {
  const [activeMode, setActiveMode] = useState<ViewMode>("cluster");

  const formattedDate = lastUpdated
    ? new Date(lastUpdated).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Detroit",
      })
    : null;

  return (
    <div
      style={{
        background: "var(--glass-bg)",
        border: "1px solid var(--glass-border)",
        borderRadius: "var(--radius-panel)",
        boxShadow: "var(--glass-shadow)",
        overflow: "hidden",
      }}
    >
      {/* Title strip */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 24px",
          borderBottom: "1px solid var(--glass-border)",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--accent-orange)",
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "var(--font-inter, Inter, sans-serif)",
              fontWeight: 600,
              fontSize: 14,
              color: "var(--text-active)",
              letterSpacing: "-0.01em",
            }}
          >
            Knowledge Graph
          </span>
          {formattedDate && (
            <span
              style={{
                fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                fontSize: 10,
                color: "var(--text-dim)",
                marginLeft: 6,
                letterSpacing: "0.04em",
              }}
            >
              updated {formattedDate}
            </span>
          )}
        </div>

        {/* View mode chips — TODO: wire activeMode to BrainCanvas when layout prop is added */}
        <div style={{ display: "flex", gap: 4 }}>
          {VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              aria-pressed={activeMode === mode.id}
              style={{
                padding: "5px 12px",
                borderRadius: "var(--radius-pill, 999px)",
                border: `1px solid ${
                  activeMode === mode.id
                    ? "var(--accent-orange)"
                    : "var(--glass-border)"
                }`,
                background:
                  activeMode === mode.id
                    ? "var(--accent-orange-soft)"
                    : "transparent",
                color:
                  activeMode === mode.id
                    ? "var(--accent-orange)"
                    : "var(--text-dim)",
                fontFamily:
                  "var(--font-jetbrains, 'JetBrains Mono', monospace)",
                fontSize: 11,
                cursor: "pointer",
                transition: "all 0.15s",
                letterSpacing: "0.02em",
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div style={{ minHeight: 480, maxHeight: 640, position: "relative" }}>
        <BrainCanvas source="/brain-graph-full.json" />
      </div>

      {/* Legend strip */}
      <div
        style={{
          padding: "12px 24px",
          borderTop: "1px solid var(--glass-border)",
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 16px",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-jetbrains, 'JetBrains Mono', monospace)",
            fontSize: 9,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
            marginRight: 4,
          }}
        >
          lobes
        </span>
        {LOBE_LEGEND.map(({ lobe, color }) => (
          <div
            key={lobe}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontFamily:
                "var(--font-jetbrains, 'JetBrains Mono', monospace)",
              fontSize: 10,
              color: "var(--text-dim)",
              letterSpacing: "0.03em",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: color,
                flexShrink: 0,
              }}
            />
            {lobe}
          </div>
        ))}
      </div>
    </div>
  );
}
