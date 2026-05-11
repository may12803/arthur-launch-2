"use client";
import React from "react";

// ── GlassPanel — 3-tier depth system ─────────────────────────────────────────
// Tier 1: inactive/ambient  (default)
// Tier 2: interactive/hover
// Tier 3: elevated/selected/modal
// Usage:
//   <GlassPanel>             → tier 1
//   <GlassPanel tier={2}>    → tier 2
//   <GlassPanel tier={3}>    → tier 3
//   <GlassPanel hoverable>   → tier 1 with hover → tier 2 transition

type Tier = 1 | 2 | 3;

interface GlassPanelProps {
  tier?: Tier;
  hoverable?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  as?: React.ElementType;
  onClick?: React.MouseEventHandler;
  role?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

const TIER_STYLES: Record<Tier, React.CSSProperties> = {
  1: {
    background: "var(--glass-bg)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    border: "1px solid var(--glass-border)",
    borderRadius: "var(--radius-panel)",
    boxShadow: "var(--glass-shadow)",
  },
  2: {
    background: "var(--glass-bg-tier2)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid var(--glass-border-tier2)",
    borderRadius: "var(--radius-panel)",
    boxShadow: "var(--glass-shadow-tier2)",
  },
  3: {
    background: "var(--glass-bg-tier3)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid var(--glass-border-tier3)",
    borderRadius: "var(--radius-panel)",
    boxShadow: "var(--glass-shadow-tier3)",
  },
};

export function GlassPanel({
  tier = 1,
  hoverable = false,
  className,
  style,
  children,
  as: Tag = "div",
  onClick,
  role,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
}: GlassPanelProps) {
  const base = TIER_STYLES[tier];

  const combined: React.CSSProperties = {
    ...base,
    transition: "all var(--duration-quick) var(--ease-out-soft)",
    ...style,
  };

  // hoverable → CSS class for hover state (tier1 → tier2 on hover)
  const classes = [
    hoverable ? "glass-panel-hoverable" : "",
    `glass-tier-${tier}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag
      className={classes}
      style={combined}
      onClick={onClick}
      role={role}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
    >
      {children}
    </Tag>
  );
}

export default GlassPanel;
