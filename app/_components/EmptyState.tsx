"use client";
import React from "react";

// ── EmptyState — shared empty-content primitive ─────────────────────────────
// Replaces ad-hoc "no results"/"nothing here yet" blocks scattered across
// every page. Locks visual rhythm: icon (optional) → title → subtitle → cta.
//
// Usage:
//   <EmptyState title="inbox is clear." />
//   <EmptyState title="no documents found." subtitle="upload one to get started" cta={<button>...</button>} />
//   <EmptyState icon="📭" title="no messages match this filter." subtitle="try clearing the search" />

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  cta?: React.ReactNode;
  align?: "center" | "left";
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: React.CSSProperties;
}

const SIZE_PADDING: Record<string, string> = {
  sm: "var(--space-7) var(--space-5)",
  md: "var(--space-9) var(--space-6)",
  lg: "var(--space-11) var(--space-7)",
};
const SIZE_TITLE: Record<string, string> = {
  sm: "var(--fs-body)",
  md: "var(--fs-h3)",
  lg: "var(--fs-h2)",
};
const SIZE_ICON: Record<string, string> = {
  sm: "1.5rem",
  md: "2rem",
  lg: "2.75rem",
};

export function EmptyState({
  title,
  subtitle,
  icon,
  cta,
  align = "center",
  size = "md",
  className,
  style,
}: EmptyStateProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        justifyContent: "center",
        textAlign: align === "center" ? "center" : "left",
        padding: SIZE_PADDING[size],
        gap: "var(--space-3)",
        color: "var(--text-muted)",
        ...style,
      }}
    >
      {icon && (
        <div style={{ fontSize: SIZE_ICON[size], opacity: 0.5, marginBottom: "var(--space-1)" }}>
          {icon}
        </div>
      )}
      <div style={{
        fontSize: SIZE_TITLE[size],
        color: "var(--text-active)",
        fontFamily: "var(--font-display)",
        letterSpacing: "var(--ls-heading)",
        lineHeight: "var(--lh-tight)",
      }}>
        {title}
      </div>
      {subtitle && (
        <div style={{
          fontSize: "var(--fs-small)",
          color: "var(--text-muted)",
          lineHeight: "var(--lh-body)",
          maxWidth: "44ch",
        }}>
          {subtitle}
        </div>
      )}
      {cta && <div style={{ marginTop: "var(--space-2)" }}>{cta}</div>}
    </div>
  );
}
