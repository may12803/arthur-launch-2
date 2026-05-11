'use client';

import { useState, useEffect } from 'react';
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
        const formattedStats: Stat[] = [
          { value: data.employees, label: 'employees' },
          { value: data.brain_links.toLocaleString(), label: 'brain links' },
          { value: data.active_lobes, label: 'active lobes' },
          { value: `${(data.confidence * 100).toFixed(1)}%`, label: 'confidence' },
        ];
        setStats(formattedStats);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
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
      <div className="aurora-bg">
        <div className="aurora-blur">
          <div className="aurora-shape1"></div>
          <div className="aurora-shape2"></div>
          <div className="aurora-shape3"></div>
          <div className="aurora-shape4"></div>
        </div>
      </div>
      
      <Nav />

      <main className="container mx-auto px-4">
        <div className="text-center py-16">
          <div className="font-mono text-sm uppercase tracking-widest text-accent-orange mb-4">ARTHUR v0.8.2</div>
          <h1 className="font-display text-4xl md:text-6xl font-light tracking-tighter uppercase text-text-active mb-6">YOUR EXECUTIVE AI</h1>
          <p className="text-lg md:text-xl text-text-main max-w-2xl mx-auto leading-relaxed mb-10">
            Arthur is a personal OS that learns your principles, manages your context, and executes complex work. 
            He operates locally on your machine, with a persistent brain and full tool access.
          </p>
          <div className="flex justify-center gap-4">
            <a href="/dashboard" className="bg-accent-orange text-white font-bold py-3 px-8 rounded-full transition-transform hover:scale-105">Launch Console</a>
            <a href="https://github.com/may-co/arthur" target="_blank" rel="noopener noreferrer" className="bg-glass-t1 border border-glass-t1-border text-text-active font-bold py-3 px-8 rounded-full transition-transform hover:scale-105">View on GitHub</a>
          </div>
        </div>

        <div className="my-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 bg-glass-t1 border border-glass-t1-border rounded-lg shadow-lg">
            {stats.map(stat => (
              <div className="text-center p-6 border-b sm:border-b-0 sm:border-r border-glass-t1-border last:border-b-0 last:sm:border-r-0" key={stat.label}>
                <div className="font-mono text-3xl md:text-4xl font-semibold text-text-active mb-2">{stat.value}</div>
                <div className="text-xs uppercase tracking-widest text-text-muted">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {VALUE_PROPS.map(prop => (
              <div className="bg-glass-t1 border border-glass-t1-border rounded-lg p-8 transition-transform hover:-translate-y-1" key={prop.title}>
                <div className="font-mono text-xs uppercase tracking-widest text-accent-orange mb-3">{prop.eyebrow}</div>
                <h3 className="font-display text-2xl font-medium text-text-active mb-3">{prop.title}</h3>
                <p className="text-text-main leading-relaxed">{prop.body}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
