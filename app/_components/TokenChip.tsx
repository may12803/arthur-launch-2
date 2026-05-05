"use client";
import React from "react";

// ── TokenChip — design-token-safe interactive chip/badge ─────────────────────
// Variants: tag, status, filter, action
// Sizes: xs, sm, md
// Supports: removable, selectable, icon slot, count badge
// All values resolve to CSS variables — never hardcoded colors

type ChipVariant = "tag" | "status" | "filter" | "action";
type ChipSize = "xs" | "sm" | "md";

type StatusColor =
  | "default"
  | "active"
  | "warning"
  | "error"
  | "success"
  | "muted"
  | "orange"
  | "blue"
  | "purple";

interface TokenChipProps {
  label: string;
  variant?: ChipVariant;
  size?: ChipSize;
  color?: StatusColor;
  count?: number;
  icon?: React.ReactNode;
  selected?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
}

const COLOR_MAP: Record<
  StatusColor,
  { bg: string; border: string; text: string }
> = {
  default: {
    bg: "var(--glass-bg)",
    border: "var(--glass-border)",
    text: "var(--text-main)",
  },
  active: {
    bg: "rgba(100, 220, 80, 0.12)",
    border: "rgba(100, 220, 80, 0.3)",
    text: "rgb(100, 220, 80)",
  },
  warning: {
    bg: "var(--accent-orange-soft)",
    border: "rgba(230, 140, 30, 0.4)",
    text: "var(--accent-orange)",
  },
  error: {
    bg: "rgba(220, 60, 60, 0.12)",
    border: "rgba(220, 60, 60, 0.3)",
    text: "rgb(230, 70, 70)",
  },
  success: {
    bg: "rgba(60, 200, 120, 0.12)",
    border: "rgba(60, 200, 120, 0.3)",
    text: "rgb(60, 200, 120)",
  },
  muted: {
    bg: "transparent",
    border: "var(--glass-border)",
    text: "var(--text-muted)",
  },
  orange: {
    bg: "var(--accent-orange-soft)",
    border: "rgba(230, 140, 30, 0.4)",
    text: "var(--accent-orange)",
  },
  blue: {
    bg: "rgba(60, 130, 240, 0.12)",
    border: "rgba(60, 130, 240, 0.3)",
    text: "rgb(80, 150, 255)",
  },
  purple: {
    bg: "rgba(160, 80, 240, 0.12)",
    border: "rgba(160, 80, 240, 0.3)",
    text: "rgb(180, 100, 255)",
  },
};

const SIZE_MAP: Record<ChipSize, { height: number; fontSize: number; px: number; gap: number }> = {
  xs: { height: 20, fontSize: 10, px: 6, gap: 3 },
  sm: { height: 24, fontSize: 11, px: 8, gap: 4 },
  md: { height: 28, fontSize: 12, px: 10, gap: 5 },
};

export function TokenChip({
  label,
  variant = "tag",
  size = "sm",
  color = "default",
  count,
  icon,
  selected,
  removable,
  onRemove,
  onClick,
  className,
  style,
  title,
}: TokenChipProps) {
  const { bg, border, text } = COLOR_MAP[color];
  const { height, fontSize, px, gap } = SIZE_MAP[size];
  const isClickable = !!onClick || variant === "filter" || variant === "action";

  // selected state overrides bg/border with orange accent
  const finalBg = selected ? "var(--accent-orange-soft)" : bg;
  const finalBorder = selected ? "rgba(230, 140, 30, 0.5)" : border;
  const finalText = selected ? "var(--accent-orange)" : text;

  return (
    <span
      title={title}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick?.();
            }
          : undefined
      }
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height,
        padding: `0 ${px}px`,
        gap,
        borderRadius: Math.round(height / 2) + "px",
        background: finalBg,
        border: `1px solid ${finalBorder}`,
        color: finalText,
        fontSize,
        fontWeight: 500,
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        cursor: isClickable ? "pointer" : "default",
        userSelect: "none",
        transition: "all 0.12s var(--ease-out-soft)",
        ...style,
      }}
    >
      {icon && (
        <span
          aria-hidden
          style={{ display: "flex", alignItems: "center", fontSize: fontSize + 1 }}
        >
          {icon}
        </span>
      )}

      {label}

      {typeof count === "number" && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: height - 6,
            height: height - 6,
            borderRadius: 99,
            background: "rgba(255,255,255,0.08)",
            fontSize: fontSize - 1,
            marginLeft: 2,
            padding: "0 3px",
          }}
        >
          {count}
        </span>
      )}

      {removable && (
        <button
          aria-label={`remove ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: height - 6,
            height: height - 6,
            borderRadius: "50%",
            border: "none",
            background: "transparent",
            color: "currentColor",
            cursor: "pointer",
            padding: 0,
            marginLeft: 2,
            opacity: 0.6,
            transition: "opacity 0.1s",
          }}
          onMouseOver={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.opacity = "1")
          }
          onMouseOut={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.opacity = "0.6")
          }
        >
          ✕
        </button>
      )}
    </span>
  );
}

export default TokenChip;
