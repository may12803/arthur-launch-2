"use client";
import React from "react";

// ── PageHeader — consistent page-level heading system ───────────────────────
// Usage:
//   <PageHeader title="Inbox" />
//   <PageHeader title="Goals" subtitle="12 active" badge="live" />
//   <PageHeader title="Brain" eyebrow="system" actions={<SomeButton />} />

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  badge?: string;
  badgeVariant?: "default" | "live" | "warning" | "muted";
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const BADGE_STYLES: Record<string, React.CSSProperties> = {
  default: {
    background: "var(--glass-bg-tier2)",
    color: "var(--text-main)",
    border: "1px solid var(--glass-border)",
  },
  live: {
    background: "rgba(100, 220, 80, 0.12)",
    color: "rgb(100, 220, 80)",
    border: "1px solid rgba(100, 220, 80, 0.3)",
  },
  warning: {
    background: "var(--accent-orange-soft)",
    color: "var(--accent-orange)",
    border: "1px solid rgba(230, 140, 30, 0.4)",
  },
  muted: {
    background: "transparent",
    color: "var(--text-muted)",
    border: "1px solid var(--glass-border)",
  },
};

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  badge,
  badgeVariant = "default",
  actions,
  className,
  style,
}: PageHeaderProps) {
  return (
    <header
      className={className}
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: "var(--space-md)",
        ...style,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <p
            className="eyebrow"
            style={{
              marginBottom: 4,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-muted)",
              fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
            }}
          >
            {eyebrow}
          </p>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <h1
            style={{
              fontSize: "clamp(22px, 4vw, 28px)",
              fontWeight: 500,
              letterSpacing: "-0.025em",
              color: "var(--text-active)",
              margin: 0,
              lineHeight: 1.15,
              textTransform: "lowercase",
            }}
          >
            {title}
          </h1>

          {badge && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 22,
                padding: "0 8px",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.03em",
                fontFamily: "ui-monospace, monospace",
                ...BADGE_STYLES[badgeVariant],
              }}
            >
              {badgeVariant === "live" && (
                <span
                  aria-hidden
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "currentColor",
                    marginRight: 5,
                    animation: "pulse-dot 2s ease-in-out infinite",
                  }}
                />
              )}
              {badge}
            </span>
          )}
        </div>

        {subtitle && (
          <p
            style={{
              marginTop: 4,
              fontSize: 13,
              color: "var(--text-muted)",
              letterSpacing: "-0.01em",
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          {actions}
        </div>
      )}
    </header>
  );
}

// @keyframes pulse-dot: add to globals.css if not present
// It's already there via the live badge animation

export default PageHeader;
