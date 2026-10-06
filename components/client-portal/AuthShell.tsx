import type { ReactNode } from "react";
import { Wordmark } from "./LogoMark";

// Shell for sign-in and onboarding: /client/login, forgot, reset, invite/[token], the MFA pages, select-company,
// no-access and staff. One compact task, centered: the heading and form sit together in one card, a dark context panel
// beside it carries the promise (or, on an invitation, who invited you), and a single quiet legal row closes the page.
// On a phone the form comes first and the context follows it.
const DEFAULT_CONTEXT = {
  title: "Your answers, your work and what needs your decision, in one place.",
  points: [
    "Arthur reads the systems your organization connects and explains what changed in plain language.",
    "Every figure shows where it came from, so you can check it.",
    "Two-factor sign-in protects every account. Nothing is sent or changed without a person's approval.",
  ],
};

export function AuthShell({
  eyebrow = "Client portal",
  headline,
  muted,
  lead,
  step,
  context,
  children,
  footer,
}: {
  eyebrow?: string;
  headline: string;
  muted?: string;
  lead?: string;
  step?: string;
  context?: { title: string; points?: string[] } | null;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ctx = context === undefined ? DEFAULT_CONTEXT : context;
  return (
    <div className="min-h-screen flex flex-col bg-[#f5f5f7]">
      <header className="ll-nav">
        <div className="ll-wrap ll-nav-inner">
          <a href="https://loveleedaystudios.com/" aria-label="LOVELEEDAY home">
            <Wordmark />
          </a>
          <nav className="ll-nav-links" aria-label="Main navigation">
            <a href="https://loveleedaystudios.com/">loveleedaystudios.com ↗</a>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex items-start md:items-center justify-center px-4 py-8 md:py-16">
        <div className="w-full max-w-[1000px] grid md:grid-cols-[minmax(0,1fr)_minmax(0,460px)] gap-5 md:gap-6 items-stretch">
          <div className="order-1 md:order-2 bg-white rounded-[20px] border border-[var(--line)] p-6 md:p-8 min-w-0">
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="ll-eyebrow">{eyebrow}</span>
              {step && <span className="text-[12px] text-[var(--muted)] whitespace-nowrap">{step}</span>}
            </div>
            <h1 className="text-[26px] md:text-[30px] leading-[1.15] font-medium tracking-[-0.035em] text-[var(--ink)]">
              {headline}
              {muted && <span className="text-[var(--muted)]"> {muted}</span>}
            </h1>
            {lead && <p className="mt-3 text-[15px] leading-[1.6] text-[#4a4e57]">{lead}</p>}
            <div className="mt-6">{children}</div>
            {footer && <div className="mt-6 pt-5 border-t border-[var(--line)]">{footer}</div>}
          </div>

          {ctx && (
            <aside className="order-2 md:order-1 rounded-[20px] bg-[#14161b] text-white p-6 md:p-10 flex flex-col justify-between gap-8 min-w-0">
              <div>
                <span className="text-[11px] tracking-[.16em] uppercase text-[#9fb4cf]">LOVELEEDAY</span>
                <p className="mt-4 text-[22px] md:text-[28px] leading-[1.2] font-medium tracking-[-0.03em]">{ctx.title}</p>
              </div>
              {ctx.points && ctx.points.length > 0 && (
                <ul className="flex flex-col gap-4">
                  {ctx.points.map((p) => (
                    <li key={p} className="flex gap-3 text-[14px] leading-[1.55] text-[#c9ccd3]">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#5aa2ff]" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          )}
        </div>
      </main>

      <footer className="border-t border-[var(--line)] bg-white">
        <div className="ll-wrap flex flex-wrap items-center justify-between gap-3 py-4 text-[12.5px] text-[var(--muted)]">
          <span>&copy; 2026 LOVELEEDAY Studios LLC</span>
          <nav className="flex flex-wrap gap-5" aria-label="Legal">
            <a href="/client/privacy" className="hover:text-[var(--ink)]">Privacy</a>
            <a href="/client/terms" className="hover:text-[var(--ink)]">Terms</a>
            <a href="https://loveleedaystudios.com/trust" className="hover:text-[var(--ink)]">Trust and security</a>
            <a href="mailto:hello@loveleedaystudios.com" className="hover:text-[var(--ink)]">Help</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
