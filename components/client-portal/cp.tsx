import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./ui";
import type { Tone } from "@/lib/client-portal/connector-ui";
import LOGO_COLORS from "@/lib/client-portal/logo-colors.json";

// Each logo sits on a square tinted with its own brand colour (scripts/logo-colors.py), matching the public directory.
const logoTint = (src: string) => {
  const c = (LOGO_COLORS as Record<string, string>)[src.split("/").pop() || ""] || "#5B6472";
  return { background: `${c}2E`, borderColor: `${c}73` };
};

// Shared pieces for the connector-platform screens. Presentational only, so the dev preview can render them with
// fixtures and the real pages can render them with live rows.

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("cp-panel", className)}>{children}</div>;
}

export function PanelHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="cp-panel-h">
      <div className="min-w-0">
        <h2 className="text-[18px] font-medium tracking-[-0.025em] text-[var(--ink)]">{title}</h2>
        {sub ? <p className="mt-0.5 text-[12px] text-[var(--muted)]">{sub}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function Pill({ tone = "off", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("ll-pill", tone)}>
      {dot ? <span className="cp-dot" /> : null}
      {children}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "good" | "wait" | "bad" }) {
  return (
    <div className="cp-stat">
      <span className="cp-cap">{label}</span>
      <div className="n">{value}</div>
      {sub ? <div className={cn("d", tone)}>{sub}</div> : null}
    </div>
  );
}

// Every database or API error is shown, never folded into an empty state.
export function ErrorBanner({ errors, label = "Something did not load" }: { errors: (string | null | undefined)[]; label?: string }) {
  const list = errors.filter((e): e is string => !!e);
  if (!list.length) return null;
  return (
    <div className="cp-banner bad mb-6" role="alert">
      <div>
        <b className="font-semibold">{label}.</b>
        {list.map((e, i) => (
          <div key={i} className="mt-0.5 break-words">{e}</div>
        ))}
      </div>
    </div>
  );
}

export function Notice({ tone = "wait", children }: { tone?: "wait" | "bad" | "good" | "info"; children: ReactNode }) {
  return <div className={cn("cp-banner", tone === "wait" ? "" : tone)}>{children}</div>;
}

export function PageHead({ eyebrow, title, muted, lead, actions }: { eyebrow: ReactNode; title: ReactNode; muted?: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
      <div className="min-w-0 max-w-[680px]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="ll-title !text-[44px] max-md:!text-[34px]">
          {title} {muted ? <span>{muted}</span> : null}
        </h1>
        {lead ? <p className="mt-4 max-w-[62ch] text-[15px] leading-[1.75] text-[var(--muted)]">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}

const SWATCH = ["#2b4a6f", "#3d6b7a", "#6a5a8c", "#7a5a3f", "#4a6b52", "#8a4a4a", "#3a3f4a", "#2a6a8c"];
export function brandColor(src?: string | null): string {
  return (src && (LOGO_COLORS as Record<string, string>)[src.split("/").pop() || ""]) || "#5B6472";
}

// Readable text colour for a solid brand background, chosen by relative luminance (WCAG).
export function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.179 ? "#111111" : "#ffffff";
}

export function Logo({ src, name, size = 40, plain = false }: { src?: string | null; name: string; size?: number; plain?: boolean }) {
  if (src) {
    return (
      <span className="cp-logo" style={{ width: size, height: size, ...(plain ? { background: "#fff", borderColor: "#fff" } : logoTint(src)) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" decoding="async" />
      </span>
    );
  }
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const bg = SWATCH[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % SWATCH.length];
  return (
    <span className="cp-logo init" style={{ width: size, height: size, background: bg, fontSize: size * 0.34 }}>
      {initials}
    </span>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="cp-twrap">{children}</div>;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange?: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="cp-switch" onClick={() => onChange?.(!checked)} />;
}

const SETTINGS = [
  { href: "/client/organization", label: "Organization", group: "Organization" },
  { href: "/client/organization/entities", label: "Entities and locations", group: "Organization" },
  { href: "/client/team", label: "Team and access", group: "Organization" },
  { href: "/client/security", label: "Security center", group: "Security", admin: true },
  { href: "/client/audit", label: "Audit trail", group: "Security", admin: true },
  { href: "/client/access", label: "Access history", group: "Security", admin: true },
  { href: "/client/developer", label: "Developer settings", group: "Integrations", admin: true },
  { href: "/client/status", label: "Status and notifications", group: "Integrations" },
  { href: "/client/contracts", label: "Contracts", group: "Account" },
  { href: "/client/account", label: "Your account", group: "Account" },
];
export const SETTINGS_PATHS = SETTINGS.map((s) => s.href);

export function SettingsLayout({ active, isAdmin, children }: { active: string; isAdmin: boolean; children: ReactNode }) {
  const items = SETTINGS.filter((s) => !s.admin || isAdmin);
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <div className="cp-split">
      <nav className="cp-subnav" aria-label="Settings">
        {groups.map((g, gi) => (
          <div key={g} className="contents">
            <span className={`cp-cap max-md:hidden px-3 pb-1.5 ${gi === 0 ? "" : "pt-5"}`}>{g}</span>
            {items
              .filter((i) => i.group === g)
              .map((i) => (
                <Link key={i.href} href={i.href} aria-current={active === i.href ? "page" : undefined}>
                  {i.label}
                </Link>
              ))}
          </div>
        ))}
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
