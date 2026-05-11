'use client';

import { useState, useEffect } from 'react';
import { Nav } from '@/app/_components/Layout';

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

interface Stat {
  value: string | number;
  label: string;
}

const INITIAL_STATS: Stat[] = [
  { value: '...', label: 'employees' },
  { value: '...', label: 'brain links' },
  { value: '...', label: 'active lobes' },
  { value: '...', label: 'confidence' },
];

export default function Home() {
  const [stats, setStats] = useState<Stat[]>(INITIAL_STATS);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/state');
        if (!response.ok) throw new Error('API fetch failed');
        const data = await response.json();
        // Assuming API returns { employees: 67, brain_links: 6293, active_lobes: 22, confidence: 0.862 }
        const formattedStats: Stat[] = [
          { value: data.employees, label: 'employees' },
          { value: data.brain_links.toLocaleString(), label: 'brain links' },
          { value: data.active_lobes, label: 'active lobes' },
          { value: `${(data.confidence * 100).toFixed(1)}%`, label: 'confidence' },
        ];
        setStats(formattedStats);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
        // Fallback to static data on error
        setStats([
          { value: '67', label: 'employees' },
          { value: '6,293', label: 'brain links' },
          { value: '22', label: 'active lobes' },
          { value: '86.2%', label: 'confidence' },
        ]);
      }
    };

    fetchStats();
  }, []);

  return (
    <>
      <style jsx>{`
        /* ─── Layout ─── */
        .container {
          width: 100%;
          max-width: var(--max-w);
          margin: 0 auto;
          padding: 0 var(--page-gutter);
        }
        .section {
          padding: 5rem 0;
        }
        @media (max-width: 768px) {
          .section {
            padding: 3rem 0;
          }
        }

        /* ─── Hero Section ─── */
        .hero {
          text-align: center;
          padding: 4rem 0 5rem;
        }
        .hero-eyebrow {
          font-family: var(--font-jetbrains, monospace);
          font-size: 0.875rem;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: var(--accent-orange);
          margin-bottom: 1rem;
        }
        .hero-h1 {
          font-family: var(--font-space-grotesk, 'Space Grotesk', sans-serif);
          font-size: clamp(2.25rem, 4vw, 4rem);
          font-weight: 300;
          letter-spacing: -0.04em;
          line-height: 1.05;
          color: var(--text-active);
          margin: 0 0 1.5rem;
          text-transform: uppercase;
        }
        .hero-sub {
          font-size: clamp(1rem, 2vw, 1.25rem);
          color: var(--text-main);
          max-width: 56ch;
          line-height: 1.65;
          margin: 0 auto 2.5rem;
        }
        .cta-group {
          display: flex;
          justify-content: center;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .cta-primary, .cta-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 14px 32px;
          border-radius: var(--radius-pill);
          font-size: 0.9rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.2s ease-out;
        }
        .cta-primary {
          background: var(--accent-orange);
          color: var(--accent-text-on);
          border: 1px solid transparent;
          letter-spacing: 0.01em;
        }
        .cta-primary:hover {
          background: var(--accent-hover);
          transform: translateY(-2px);
          box-shadow: 0 4px 20px var(--accent-glow);
        }
        .cta-secondary {
          background: var(--glass-t1-bg);
          backdrop-filter: blur(var(--glass-t1-blur));
          border: 1px solid var(--glass-t1-border);
          color: var(--text-active);
        }
        .cta-secondary:hover {
          background: var(--glass-t2-bg);
          border-color: var(--glass-t2-border);
          transform: translateY(-2px);
        }

        /* ─── Stats Bar ─── */
        .stat-bar {
          background: var(--glass-t1-bg);
          backdrop-filter: blur(var(--glass-t1-blur));
          border: 1px solid var(--glass-t1-border);
          border-radius: var(--radius-panel);
          box-shadow: var(--glass-t1-shadow);
          display: grid;
          grid-template-columns: repeat(4, 1fr);
        }
        .stat-cell {
          padding: 1.5rem 2rem;
          text-align: center;
          border-right: 1px solid var(--line-separator);
          transition: background-color 0.2s ease-out;
        }
        .stat-cell:last-child { border-right: none; }
        .stat-val {
          font-family: var(--font-jetbrains, monospace);
          font-size: clamp(1.5rem, 3vw, 2.25rem);
          font-weight: 600;
          color: var(--text-active);
          letter-spacing: -0.02em;
          line-height: 1;
          margin-bottom: 0.5rem;
        }
        .stat-label {
          font-size: 0.75rem;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        @media (max-width: 768px) {
          .stat-bar { grid-template-columns: repeat(2, 1fr); }
          .stat-cell:nth-child(2) { border-right: none; }
          .stat-cell:nth-child(1), .stat-cell:nth-child(2) {
            border-bottom: 1px solid var(--line-separator);
          }
        }
        @media (max-width: 480px) {
          .stat-bar { grid-template-columns: 1fr; }
          .stat-cell { border-right: none !important; border-bottom: 1px solid var(--line-separator); }
          .stat-cell:last-child { border-bottom: none; }
        }

        /* ─── Value Props Grid ─── */
        .value-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 1.5rem;
        }
        .value-card {
          background: var(--glass-t1-bg);
          backdrop-filter: blur(var(--glass-t1-blur));
          border: 1px solid var(--glass-t1-border);
          border-radius: var(--radius-panel);
          box-shadow: var(--glass-t1-shadow);
          padding: 2rem;
          transition: all 0.2s ease-out;
          display: flex;
          flex-direction: column;
        }
        .value-card:hover {
          background: var(--glass-t2-bg);
          border-color: var(--glass-t2-border);
          box-shadow: var(--glass-t2-shadow);
          transform: translateY(-4px);
        }
        .value-eyebrow {
          font-family: var(--font-jetbrains, monospace);
          font-size: 0.8rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--accent-orange);
          margin-bottom: 0.75rem;
        }
        .value-title {
          font-family: var(--font-space-grotesk, 'Space Grotesk', sans-serif);
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text-active);
          margin: 0 0 0.75rem;
          letter-spacing: -0.01em;
        }
        .value-body {
          font-size: 0.95rem;
          color: var(--text-muted);
          margin: 0;
          line-height: 1.65;
          flex-grow: 1;
        }

        /* ─── About Section ─── */
        .about-section {
          background: var(--glass-t1-bg);
          backdrop-filter: blur(var(--glass-t1-blur));
          border: 1px solid var(--glass-t1-border);
          border-radius: var(--radius-panel);
          padding: 4rem;
        }
        .about-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 3rem;
          align-items: start;
        }
        @media (max-width: 900px) {
          .about-grid { grid-template-columns: 1fr; gap: 2.5rem; }
          .about-section { padding: 2.5rem; }
        }
        .about-eyebrow {
          font-family: var(--font-jetbrains, monospace);
          font-size: 0.875rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--accent-orange);
          margin-bottom: 1rem;
        }
        .about-h2 {
          font-family: var(--font-space-grotesk, "Space Grotesk", sans-serif);
          font-size: clamp(1.75rem, 3vw, 2.5rem);
          font-weight: 300;
          letter-spacing: -0.03em;
          color: var(--text-active);
          margin: 0 0 1.5rem;
          line-height: 1.1;
        }
        .about-p {
          font-size: 1rem;
          color: var(--text-muted);
          line-height: 1.75;
          margin: 0;
          max-width: 50ch;
        }
        .kv-list { display: flex; flex-direction: column; }
        .kv-row {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 1rem;
          align-items: baseline;
          padding: 0.75rem 0;
          border-bottom: 1px solid var(--line-separator);
        }
        .kv-row:last-child { border-bottom: none; }
        .kv-key { font-size: 0.8rem; color: var(--text-muted); }
        .kv-val {
          font-family: var(--font-jetbrains, monospace);
          font-size: 0.8rem;
          color: var(--text-main);
          font-weight: 500;
          word-break: break-word;
        }
      `}</style>

      <Nav />
      <main>
        <section className="hero container">
          <div className="hero-eyebrow">CHIEF OF STAFF · ALWAYS ON</div>
          <h1 className="hero-h1">Arthur.</h1>
          <p className="hero-sub">
            Specialist AI built for one operator. Compounding nightly.
            Defaults free, escalates deliberately.
          </p>
          <div className="cta-group">
            <a href="/dashboard" className="cta-primary">Open dashboard →</a>
            <a href="/graph" className="cta-secondary">View brain graph</a>
          </div>
        </section>

        <section className="container">
          <div className="stat-bar">
            {stats.map(stat => (
              <div key={stat.label} className="stat-cell">
                <div className="stat-val">{stat.value}</div>
                <div className="stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="section container">
          <div className="value-grid">
            {VALUE_PROPS.map(card => (
              <div key={card.eyebrow} className="value-card">
                <div className="value-eyebrow">{card.eyebrow}</div>
                <h3 className="value-title">{card.title}</h3>
                <p className="value-body">{card.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section container">
          <div className="about-section">
            <div className="about-grid">
              <div>
                <div className="about-eyebrow">Why Arthur</div>
                <h2 className="about-h2">
                  Specialist beats generalist.
                </h2>
                <p className="about-p">
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
                  { key: 'Nightly engines', val: 'Scout · Hustle · self-train LoRA' },
                  { key: 'Model routing', val: '18 tiers · Script → GLiNER → MSA → Gemma → Arthur-OS → Groq → Cerebras → Pioneer → DeepSeek → Sonar → Haiku → Gemini → Kimi → Sonnet → o4 → Claude Code → Opus' },
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
        </section>
      </main>
    </>
  );
}