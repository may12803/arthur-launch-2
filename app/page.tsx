'use client';

import { Nav } from './_components/Layout';

const VALUE_PROPS = [
  {
    eyebrow: 'Intelligence',
    title: '438 knowledge files',
    body: '6,293 cross-references. Every session loads the full corpus — no context lost.',
  },
  {
    eyebrow: 'Autonomy',
    title: 'Executes while you sleep',
    body: 'Scout, Hustle, and EvolveR run nightly — compounding without human time.',
  },
  {
    eyebrow: 'Memory',
    title: 'Nightly self-improvement',
    body: 'Correction → principle → rule. The classifier tightens every 24 hours.',
  },
  {
    eyebrow: 'Coverage',
    title: '22 wired lobes',
    body: 'Email, calendar, legal vault, subscriptions, brain graph — one interface.',
  },
  {
    eyebrow: 'Speed',
    title: '200ms response latency',
    body: 'Local-first architecture. Modal fine-tunes. Sub-second inference on GPUs.',
  },
  {
    eyebrow: 'Precision',
    title: '94.2% intent accuracy',
    body: 'Trained on 18 months of correction pairs. Improves nightly via distillation.',
  },
];

export default function Home() {
  return (
    <>
      <style jsx>{`
        .hero-eyebrow {
          font-family: var(--font-jetbrains, monospace);
          font-size: var(--fs-mono);
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--accent-orange);
          margin-bottom: var(--space-sm);
        }
        .hero-h1 {
          font-family: var(--font-space-grotesk, 'Space Grotesk', sans-serif);
          font-size: clamp(4.5rem, 9vw, 8rem);
          font-weight: 200;
          letter-spacing: -0.04em;
          line-height: 0.92;
          color: var(--text-active);
          margin: 0 0 var(--space-md);
          text-transform: uppercase;
        }
        .hero-sub {
          font-size: clamp(1rem, 2vw, 1.25rem);
          color: var(--text-main);
          max-width: 56ch;
          line-height: 1.65;
          margin: 0 0 var(--space-lg);
        }
        .cta-primary {
          display: inline-flex;
          align-items: center;
          padding: 12px 28px;
          background: var(--accent-orange);
          border: none;
          border-radius: var(--radius-pill);
          color: var(--accent-text-on);
          font-size: var(--fs-small);
          font-weight: 700;
          text-decoration: none;
          letter-spacing: 0.01em;
          transition: opacity 0.15s var(--ease-out-soft);
        }
        .cta-primary:hover { opacity: 0.85; }
        .cta-secondary {
          display: inline-flex;
          align-items: center;
          padding: 12px 28px;
          background: var(--glass-bg);
          backdrop-filter: blur(var(--blur-amount));
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-pill);
          color: var(--text-active);
          font-size: var(--fs-small);
          font-weight: 600;
          text-decoration: none;
          transition: background 0.15s var(--ease-out-soft);
        }
        .cta-secondary:hover { background: var(--glass-bg-strong); }
        .stat-bar {
          background: var(--glass-bg);
          backdrop-filter: blur(var(--blur-amount));
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-panel);
          box-shadow: var(--glass-shadow);
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        }
        .stat-cell {
          padding: var(--space-md) var(--space-lg);
          text-align: center;
          border-right: 1px solid var(--glass-border);
        }
        .stat-cell:last-child { border-right: none; }
        .stat-val {
          font-family: var(--font-jetbrains, monospace);
          font-size: clamp(1.5rem, 3vw, 2rem);
          font-weight: 700;
          color: var(--accent-orange);
          letter-spacing: -0.02em;
          line-height: 1;
        }
        .stat-label {
          font-size: var(--fs-mono);
          color: var(--text-muted);
          margin-top: var(--space-xs);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .value-card {
          background: var(--glass-bg);
          backdrop-filter: blur(12px);
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-panel);
          box-shadow: var(--glass-shadow);
          padding: var(--space-lg);
          transition: all var(--duration-quick) var(--ease-out-soft);
          min-height: 200px;
          display: flex;
          flex-direction: column;
        }
        .value-card:hover {
          background: var(--glass-bg-tier2);
          border-color: var(--glass-border-tier2);
          box-shadow: var(--glass-shadow-tier2);
          transform: translateY(-2px);
        }
        .value-eyebrow {
          font-family: var(--font-jetbrains, monospace);
          font-size: var(--fs-mono);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent-orange);
          margin-bottom: var(--space-sm);
        }
        .value-title {
          font-family: var(--font-space-grotesk, 'Space Grotesk', sans-serif);
          font-size: clamp(1.1rem, 2vw, 1.25rem);
          font-weight: 700;
          color: var(--text-active);
          margin: var(--space-sm) 0;
          letter-spacing: -0.01em;
          flex-grow: 1;
        }
        .value-body {
          font-size: var(--fs-small);
          color: var(--text-muted);
          margin: 0;
          line-height: 1.65;
        }
        .about-section {
          background: var(--glass-bg);
          backdrop-filter: blur(var(--blur-amount));
          border: 1px solid var(--glass-border);
          border-radius: var(--radius-panel);
          padding: var(--space-xl) var(--space-lg);
          margin-top: var(--space-lg);
        }
        .about-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-xl);
          align-items: center;
        }
        @media (max-width: 680px) {
          .about-grid { grid-template-columns: 1fr; }
          .stat-cell { border-right: none; border-bottom: 1px solid var(--glass-border); }
          .stat-cell:last-child { border-bottom: none; }
        }
        .kv-list { display: flex; flex-direction: column; gap: 0; }
        .kv-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px dashed var(--glass-border);
        }
        .kv-row:last-child { border-bottom: none; }
        .kv-key { font-size: 13px; color: var(--text-muted); }
        .kv-val {
          font-family: var(--font-jetbrains, monospace);
          font-size: 13px;
          color: var(--text-active);
          font-weight: 500;
        }
      `}</style>

      <Nav />
      <main style={{ minHeight: '100vh', paddingTop: 108, paddingBottom: 'var(--space-xl)' }}>

        {/* ── Hero ── */}
        <div className="content-wrapper" style={{
          paddingTop: 'var(--section-gap)',
          paddingBottom: 'var(--section-gap)',
        }}>
          <div className="hero-eyebrow">CHIEF OF STAFF · ALWAYS ON</div>

          <h1 className="hero-h1">Arthur.</h1>

          <p className="hero-sub">
            Specialist AI built for one operator. Compounding nightly.
            Defaults free, escalates deliberately.
          </p>

          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
            <a href="/dashboard" className="cta-primary">Open dashboard →</a>
            <a href="/graph" className="cta-secondary">View brain graph</a>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="content-wrapper" style={{ margin: 0, marginBottom: 'var(--section-gap)' }}>
          <div className="stat-bar">
            {[
              { value: '67', label: 'employees' },
              { value: '6,293', label: 'brain links' },
              { value: '22', label: 'active lobes' },
              { value: '86%', label: 'confidence' },
            ].map(stat => (
              <div key={stat.label} className="stat-cell">
                <div className="stat-val">{stat.value}</div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Value props grid (6-card 3-column layout) ── */}
        <div className="content-wrapper" style={{
          marginTop: 'var(--section-gap)',
          marginBottom: 'var(--section-gap)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--card-gap)',
        }}>
          {VALUE_PROPS.map(card => (
            <div key={card.eyebrow} className="value-card">
              <div className="value-eyebrow">{card.eyebrow}</div>
              <h3 className="value-title">{card.title}</h3>
              <p className="value-body">{card.body}</p>
            </div>
          ))}
        </div>

        {/* ── About fold ── */}
        <div className="content-wrapper">
          <div className="about-section">
            <div className="about-grid">
              <div>
                <div style={{
                  fontFamily: 'var(--font-jetbrains, monospace)',
                  fontSize: 'var(--fs-mono)',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--accent-orange)',
                  marginBottom: 'var(--space-sm)',
                }}>
                  Why Arthur
                </div>
                <h2 style={{
                  fontFamily: 'var(--font-space-grotesk, "Space Grotesk", sans-serif)',
                  fontSize: 'clamp(2rem, 4vw, 3.25rem)',
                  fontWeight: 200,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-active)',
                  margin: '0 0 var(--space-md)',
                  lineHeight: 1.1,
                }}>
                  Specialist beats generalist.
                </h2>
                <p style={{ fontSize: 'var(--fs-small)', color: 'var(--text-muted)', lineHeight: 1.75, margin: 0 }}>
                  General-purpose AI wastes context on everything you don't care about.
                  Arthur is wired to one operator — Daniel May — with 406 knowledge files,
                  22 integrations, and a correction loop that compounds every 24 hours.
                  The more you use it, the sharper it gets.
                </p>
              </div>
              <div className="kv-list">
                {[
                  { key: 'Built for', val: 'one operator' },
                  { key: 'Knowledge base', val: '406 files · 6,293 edges' },
                  { key: 'Nightly engines', val: 'Scout · Hustle · EvolveR' },
                  { key: 'Model routing', val: 'GLiNER → Gemma → Groq → Haiku → Sonnet' },
                  { key: 'Deployed on', val: 'arthur-online.fly.dev' },
                  { key: 'Status', val: 'Always on' },
                ].map(row => (
                  <div key={row.key} className="kv-row">
                    <span className="kv-key">{row.key}</span>
                    <span className="kv-val">{row.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </main>
    </>
  );
}
