import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Shared primitives for the LOVELEEDAY client portal (/client/*), each one a
// port of a loveleedaystudios.com class from its assets/site.css — see
// app/client/portal-theme.css for the class definitions.

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("bg-white border border-[var(--line)] rounded-2xl", className)}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="ll-eyebrow">{children}</span>;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="ll-title mb-3 !text-[44px] max-md:!text-[34px]">{children}</h1>;
}

export function Muted({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[15px] leading-[1.75] text-[var(--muted)]", className)}>{children}</p>;
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
  const variants: Record<ButtonVariant, string> = {
    primary: "ll-primary",
    secondary: "ll-secondary",
    danger: "ll-danger",
  };
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={cn(variants[variant], className)}>
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    active: "good",
    published: "good",
    signed: "good",
    completed: "good",
    draft: "wait",
    pending: "wait",
    sent: "wait",
    suspended: "bad",
    declined: "bad",
  };
  // Written for the client reading it, not for our pipeline.
  const label: Record<string, string> = {
    sent: "Awaiting your signature",
    void: "Withdrawn",
  };
  return <span className={cn("ll-pill", tone[status])}>{label[status] ?? status}</span>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="p-10 text-center">
      <p className="text-[20px] font-medium tracking-[-0.03em] text-[var(--ink)] mb-2">{title}</p>
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
    <div className="ll-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

export const inputClass = "ll-input";
