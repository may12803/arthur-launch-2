import type { ReactNode } from "react";
import { Wordmark } from "./LogoMark";
import { SiteFooter } from "./SiteFooter";

// Shell for /client/login, /client/invite/[token], the MFA pages and
// no-access. Built from loveleedaystudios.com's own parts so a client moving
// from the marketing site into the portal never feels a seam: the site's
// sticky white header (brand + ink CTA pill), a #f5f5f7 `.page-hero` band
// carrying the eyebrow + 48px headline, the form in a `.brief-form` panel,
// and the site's dark footer.
export function AuthShell({
  eyebrow = "Client portal",
  headline,
  muted,
  lead,
  children,
  footer,
}: {
  eyebrow?: string;
  headline: string;
  muted?: string;
  lead?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="ll-nav">
        <div className="ll-wrap ll-nav-inner">
          <a href="https://loveleedaystudios.com/" aria-label="LOVELEEDAY home">
            <Wordmark />
          </a>
          <nav className="ll-nav-links" aria-label="Main navigation">
            <a href="https://loveleedaystudios.com/studio.html#project-brief" className="ll-nav-cta">
              Start a project ↗
            </a>
          </nav>
        </div>
      </header>

      <main className="ll-hero flex-1 py-16 md:py-24">
        <div className="ll-wrap grid gap-12 md:gap-16 md:grid-cols-2 items-start">
          <div className="min-w-0 md:pt-4">
            <span className="ll-eyebrow">{eyebrow}</span>
            <h1 className="ll-title">
              {headline}
              {muted && (
                <>
                  <br />
                  <span>{muted}</span>
                </>
              )}
            </h1>
            {lead && <p className="ll-lead">{lead}</p>}
          </div>
          <div className="min-w-0 w-full max-w-[460px] md:justify-self-end">
            <div className="ll-panel">{children}</div>
            {footer && <div className="mt-5">{footer}</div>}
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
