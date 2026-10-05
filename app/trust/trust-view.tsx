import Link from "next/link";
import { Wordmark } from "@/components/client-portal/LogoMark";
import { SiteFooter } from "@/components/client-portal/SiteFooter";

const SITE = "https://loveleedaystudios.com";
const ASK = `${SITE}/studio.html#project-brief`;

const COMMITMENTS = [
  { t: "Read first, write by approval", b: "Connections read your systems. Anything that sends, pays or binds you stops for a person you name to approve it, and is logged." },
  { t: "A separate space for every client", b: "Each client's records are isolated in the database itself, not only in application code. One client cannot read another's rows." },
  { t: "Sealed with your own key", b: "Documents are encrypted with a key that belongs to your company alone, and credentials you give us are stored the same way and are never shown again." },
  { t: "Sign-in you control", b: "Multi-factor sign-in is required for every member and enforced by the database. Single sign-on through your identity provider is available." },
  { t: "A complete record", b: "Opens, downloads, approvals and changes to access are written by the system as they happen. Owners and admins can browse and export the trail." },
  { t: "Retention you set", b: "You choose how long data is kept. When an engagement ends, data is deleted from production within 30 days, with a signed deletion certificate." },
];

const ROADMAP = [
  { t: "SOC 2 Type I", s: "Planned", d: "Not started. We will not describe ourselves as compliant, or name a date, until the work is under contract with an auditor." },
  { t: "SOC 2 Type II", s: "Planned", d: "Follows Type I. Not started." },
  { t: "Independent penetration test", s: "Planned", d: "Not yet performed. We do not offer our own internal testing as a substitute for a third party's." },
];

const SUBPROCESSORS = [
  { n: "Supabase", p: "Database, sign-in and encrypted storage", d: "Account records, tenant data, uploaded files" },
  { n: "Fly.io", p: "Application hosting", d: "Requests to the portal and its APIs" },
  { n: "Stripe", p: "Billing and invoicing", d: "Billing contacts and payment status" },
  { n: "Resend", p: "Transactional email", d: "Names and work email addresses" },
];

export function TrustView() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="ll-nav">
        <div className="ll-wrap ll-nav-inner">
          <a href={SITE} aria-label="LOVELEEDAY home"><Wordmark /></a>
          <nav className="ll-nav-links" aria-label="Trust center">
            <a href="#controls" className="max-md:hidden">Controls</a>
            <a href="#soc2" className="max-md:hidden">SOC 2</a>
            <a href="#subprocessors" className="max-md:hidden">Subprocessors</a>
            <Link href="/client/login" className="ll-nav-cta">Client sign-in</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <div className="ll-wrap pb-16 pt-16 md:pt-20">
          <div className="grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div>
              <span className="ll-eyebrow">Trust center</span>
              <h1 className="ll-title">What we do with <span>your business data.</span></h1>
              <p className="mt-5 max-w-[56ch] text-[16px] leading-[1.75] text-[var(--muted)]">The documents your security and legal teams ask for, in one place, written plainly. Where something is still in progress, it says so.</p>
            </div>
            <div className="cp-panel p-6">
              <span className="cp-cap">Service status</span>
              <p className="mt-2 text-[15px] leading-[1.6] text-[var(--ink)]">Status for your own account, measured live, is on the Status page inside the portal.</p>
              <Link href="/client/status" className="ll-text-link mt-3 inline-block">Open your status page</Link>
            </div>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { t: "Data Processing Agreement", s: "Available before signature, on request.", a: "Request the DPA" },
              { t: "Security overview", s: "Controls in place today, in plain language.", a: "Read it", href: `${SITE}/security.html` },
              { t: "Security questionnaire", s: "Send yours, or ask for ours.", a: "Request a questionnaire" },
            ].map((d) => (
              <div key={d.t} className="cp-panel flex items-center gap-4 p-5">
                <div className="min-w-0 flex-1"><p className="text-[15px] font-medium text-[var(--ink)]">{d.t}</p><p className="mt-0.5 text-[12.5px] leading-[1.55] text-[var(--muted)]">{d.s}</p></div>
                <a href={d.href ?? ASK} className="ll-secondary flex-none">{d.a}</a>
              </div>
            ))}
          </div>
        </div>

        <div id="controls" className="ll-wrap pb-20">
          <span className="ll-eyebrow">Controls overview</span>
          <h2 className="mt-3 text-[34px] font-medium leading-[1.12] tracking-[-0.045em] text-[var(--ink)] max-md:text-[28px]">Six commitments we can describe in a sentence.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {COMMITMENTS.map((c) => (
              <div key={c.t} className="cp-panel p-6">
                <h3 className="text-[16.5px] font-medium tracking-[-0.02em] text-[var(--ink)]">{c.t}</h3>
                <p className="mt-2 text-[13.5px] leading-[1.7] text-[var(--muted)]">{c.b}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 text-[12.5px] text-[var(--muted)]">The full list of 17 controls, with what is still on the roadmap, is on <a className="text-[var(--blue)]" href={`${SITE}/security.html`}>the security page</a>.</p>
        </div>

        <div id="soc2" style={{ background: "#0b0b10", color: "#fff" }} className="py-20">
          <div className="ll-wrap">
            <span className="ll-eyebrow" style={{ color: "#b4a697" }}>SOC 2</span>
            <h2 className="mt-3 text-[40px] font-medium leading-[1.08] tracking-[-0.05em] max-md:text-[30px]">Where we are, <span style={{ color: "#8e8d99" }}>stated honestly.</span></h2>
            <p className="mt-4 max-w-[60ch] text-[16px] leading-[1.75]" style={{ color: "#9c9aa8" }}>We have not started a SOC 2 audit and hold no SOC 2 report. This is the plan. We will update it as each step is actually begun and finished, and not before.</p>
            <ol className="mt-10 grid gap-8 md:grid-cols-3">
              {ROADMAP.map((r) => (
                <li key={r.t} className="border-t pt-5" style={{ borderColor: "#2a2a33" }}>
                  <span className="inline-flex items-center gap-2 text-[11px]" style={{ color: "#9c9aa8" }}><span className="h-2.5 w-2.5 rounded-full border" style={{ borderColor: "#6b6a78" }} />{r.s}</span>
                  <p className="mt-2 text-[17px] font-medium tracking-[-0.02em]">{r.t}</p>
                  <p className="mt-1.5 text-[13px] leading-[1.7]" style={{ color: "#9c9aa8" }}>{r.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div id="subprocessors" className="ll-wrap py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><span className="ll-eyebrow">Subprocessors</span><h2 className="mt-3 text-[34px] font-medium leading-[1.12] tracking-[-0.045em] text-[var(--ink)] max-md:text-[28px]">Who else touches your data.</h2></div>
            <a href={ASK} className="ll-text-link">Ask to be told of changes</a>
          </div>
          <div className="cp-panel mt-8 overflow-hidden">
            <div className="cp-twrap">
              <table className="cp-table">
                <thead><tr><th>Subprocessor</th><th>Purpose</th><th>Data</th></tr></thead>
                <tbody>{SUBPROCESSORS.map((s) => <tr key={s.n}><td><b>{s.n}</b></td><td>{s.p}</td><td className="text-[var(--muted)]">{s.d}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
          <p className="mt-4 text-[12.5px] text-[var(--muted)]">List derived from the platform&apos;s code on 2026-10-05.</p>
        </div>

        <div className="ll-wrap pb-24">
          <div className="rounded-2xl bg-[#fafbfd] p-8 ring-1 ring-[var(--line)] md:flex md:items-center md:justify-between md:gap-10 md:p-10">
            <div className="max-w-[56ch]"><h2 className="text-[26px] font-medium tracking-[-0.035em] text-[var(--ink)]">Need a security review for procurement?</h2><p className="mt-2 text-[14.5px] leading-[1.7] text-[var(--muted)]">Send your questionnaire and a named contact. We answer in writing.</p></div>
            <div className="mt-6 flex flex-wrap gap-3 md:mt-0"><a href={ASK} className="ll-secondary">Request a questionnaire</a><a href={ASK} className="ll-nav-cta !px-5 !py-3.5">Contact security</a></div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
