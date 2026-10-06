import type { CSSProperties, ReactNode } from "react";
import "./auth-shell.css";

// Shell for sign-in and onboarding: /client/login, forgot, reset, invite/[token], the MFA pages, select-company,
// no-access, staff and shared-document links. The task sits on white at the left with the brand above and one quiet
// legal row below; the right side is either a photo with an illustrative answer card (sign in, invitation) or a dark
// rail: the particle brain with the three setup steps (account setup only) or a plain rail with a faint heart mark.
// Under 900px the right side is hidden and the task comes first. Approved mockup:
// briefs/loveleeday-platform-review-2026-10-06/auth-mockup.

export type AuthExample = { ask: string; answer: string; next: string };

const SETUP_STEPS = [
  ["Create account", "Your name and password"],
  ["Add authenticator", "A code from your phone each time you sign in"],
  ["Save backup codes", "Ten one-time codes, shown once"],
] as const;

export function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="stepper" aria-label={`Step ${current} of 3`}>
      {SETUP_STEPS.map(([name], i) => {
        const n = i + 1;
        const cls = n < current ? "done" : n === current ? "now" : "";
        return (
          <li key={name} className={cls} aria-current={n === current ? "step" : undefined}>
            <span aria-hidden>{n < current ? "✓" : n}</span>
            {name}
          </li>
        );
      })}
    </ol>
  );
}

type Photo = { src: string; tag: string; example?: AuthExample; position?: string };
type Rail = { kicker: string; line: string; steps?: 1 | 2 | 3; tips?: string[]; brainPosition?: string };

export function AuthShell({
  eyebrow = "Client portal",
  pill,
  headline,
  muted,
  lead,
  stepper,
  photo,
  rail,
  children,
  footer,
}: {
  eyebrow?: string | null;
  pill?: { text: string; warn?: boolean };
  headline: string;
  muted?: string;
  lead?: ReactNode;
  stepper?: 1 | 2 | 3;
  photo?: Photo;
  rail?: Rail;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  const side = photo ? (
    <aside className="la-visual" aria-hidden={!photo.example}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.src} alt="" style={photo.position ? { objectPosition: photo.position } : undefined} />
      <div className="la-overlay">
        <p className="tag">{photo.tag}</p>
        {photo.example && (
          <div className="la-card" aria-label="Illustrative example of an answer">
            <div className="h">
              <b>Arthur</b>
              <span>Illustrative example, fictional data</span>
            </div>
            <dl>
              <dt>What you would ask</dt>
              <dd>{photo.example.ask}</dd>
              <dt>What Arthur tells you</dt>
              <dd>{photo.example.answer}</dd>
              <dt>What to do next</dt>
              <dd className="next">{photo.example.next}</dd>
            </dl>
          </div>
        )}
      </div>
    </aside>
  ) : (
    <aside
      className={rail?.steps ? "la-rail" : "la-rail plain"}
      style={rail?.brainPosition ? ({ "--bp": rail.brainPosition } as CSSProperties) : undefined}
    >
      <div>
        <p className="kick">{rail?.kicker ?? "Client portal"}</p>
        <p className="rline">{rail?.line ?? "Your answers, your work and what needs your decision, in one place."}</p>
      </div>
      {rail?.steps && (
        <ol className="rsteps">
          {SETUP_STEPS.map(([name, desc], i) => {
            const n = i + 1;
            const cls = n < rail.steps! ? "done" : n === rail.steps ? "now" : "";
            return (
              <li key={name} className={cls}>
                <span aria-hidden>{n < rail.steps! ? "✓" : n}</span>
                <div>
                  <b>{name}</b>
                  <small>{desc}</small>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {rail?.tips && (
        <ul className="rtips">
          {rail.tips.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
      <p className="rfoot">
        <i aria-hidden />
        Your work stays private to your organization.
      </p>
    </aside>
  );

  return (
    <div className={photo ? "la" : "la quiet"}>
      <div className="la-side">
        <a className="la-brand" href="https://loveleedaystudios.com/" aria-label="LOVELEEDAY home">
          <i aria-hidden />
          LOVELEEDAY
        </a>
        <main className="la-main">
          <div className="la-form">
            {stepper && <Stepper current={stepper} />}
            {pill ? <span className={pill.warn ? "pill warn" : "pill"}>{pill.text}</span> : eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
            <h1>
              {headline}
              {muted && <span className="mute"> {muted}</span>}
            </h1>
            {lead && <p className="lead">{lead}</p>}
            {children && <div className="la-body">{children}</div>}
            {footer}
          </div>
        </main>
        <div className="la-legal">
          <span>&copy; 2026 LOVELEEDAY Studios LLC</span>
          <nav aria-label="Legal">
            <a href="/client/privacy">Privacy</a>
            <a href="/client/terms">Terms</a>
            <a href="https://loveleedaystudios.com/trust">Trust and security</a>
            <a href="mailto:hello@loveleedaystudios.com">Get help</a>
          </nav>
        </div>
      </div>
      {side}
    </div>
  );
}
