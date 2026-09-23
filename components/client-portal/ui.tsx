import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Shared visual primitives for the LOVELEEDAY client portal (/client/*).
// Built on the app's real design tokens (tailwind.config.ts colors/fontSize
// + the CSS custom properties in app/globals.css under "ARTHUR OS — Design
// Tokens"), referenced directly for the panel radius/shadow/spacing values
// tailwind.config.ts declares but never wires to a utility (--radius-panel,
// --space-*) so the portal still reads as one system with the rest of the
// app instead of drifting onto ad-hoc pixel values.

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "bg-glass-bg border border-glass-border rounded-[var(--radius-panel)] shadow-[var(--glass-shadow)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-text-muted">
      {children}
    </div>
  );
}

export function PageTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-serif text-h2 font-medium tracking-[-0.02em] text-text-active mt-1.5 mb-1.5">
      {children}
    </h1>
  );
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-small text-text-muted leading-relaxed", className)}>{children}</p>;
}

type ButtonVariant = "primary" | "secondary" | "danger";

export function PortalButton({
  children,
  variant = "primary",
  disabled,
  type = "button",
  onClick,
  className,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
  className?: string;
}) {
  const base = "inline-flex items-center justify-center px-5 py-2.5 text-[13.5px] font-semibold font-sans transition-opacity";
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-accent-orange text-accent-text-on",
    secondary: "bg-glass-bg-strong text-text-active border border-glass-border",
    danger: "bg-transparent text-red-600 border border-red-300",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        base,
        "rounded-[var(--radius-pill)]",
        variants[variant],
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:opacity-90",
        className
      )}
    >
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    published: "bg-emerald-100 text-emerald-800",
    draft: "bg-amber-100 text-amber-800",
    pending: "bg-amber-100 text-amber-800",
    archived: "bg-gray-200 text-gray-600",
    inactive: "bg-gray-200 text-gray-600",
    suspended: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 text-[11px] font-semibold font-mono uppercase tracking-wide rounded-[var(--radius-pill)]",
        tone[status] || "bg-gray-100 text-gray-700"
      )}
    >
      {status}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-10 text-center">
      <p className="font-serif text-h3 text-text-active mb-2">{title}</p>
      <Muted className="mx-auto max-w-[42ch]">{body}</Muted>
    </Card>
  );
}

export function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-text-main font-sans">
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full box-border bg-[var(--glass-bg-faint)] border border-glass-border rounded-[var(--radius-panel)] px-3.5 py-2.5 text-[14px] text-text-active font-sans outline-none focus:border-accent-orange";
