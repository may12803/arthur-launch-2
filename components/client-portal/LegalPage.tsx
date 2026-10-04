import type { ReactNode } from "react";
import { Wordmark } from "./LogoMark";
import { SiteFooter } from "./SiteFooter";

// Shell for the portal's public legal pages (/client/privacy, /client/terms): the same sticky header and dark
// footer as the sign-in screens, with a single readable column for long text.
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="ll-nav">
        <div className="ll-wrap ll-nav-inner">
          <a href="https://loveleedaystudios.com/" aria-label="LOVELEEDAY home">
            <Wordmark />
          </a>
          <nav className="ll-nav-links" aria-label="Main navigation">
            <a href="/client/login">Sign in</a>
          </nav>
        </div>
      </header>
      <main className="flex-1 py-14 md:py-20">
        <article className="ll-wrap max-w-[720px] text-[15.5px] leading-[1.75] text-[var(--ink)] [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-[22px] [&_h2]:font-medium [&_h2]:tracking-[-0.02em] [&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-2 [&_a]:underline">
          <span className="ll-eyebrow">Client portal</span>
          <h1 className="ll-title !text-[44px] max-md:!text-[34px] mb-3">{title}</h1>
          <p className="text-[var(--muted)] mb-8">Last updated {updated}</p>
          {children}
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
