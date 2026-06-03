'use client';

import { useState, Suspense } from 'react';
import dynamic from 'next/dynamic';

const FilesView = dynamic(() => import('./_components/FilesView'), { ssr: false });
const ComplianceChecklist = dynamic(() => import('./_components/ComplianceChecklist'), { ssr: false });

const S = {
  bg: '#FAF8F5',
  bgWhite: '#FFFFFF',
  border: '#E8E4DB',
  border2: '#F3F0EA',
  ink: '#1A1713',
  mute: '#8A837A',
  faint: '#BAB5AE',
  teal: '#0B504F',
  tealBg: '#E5F0EF',
  red: '#B91C1C',
  redBg: '#FEF2F2',
  amber: '#B45309',
  serif: 'var(--font-lora, Lora, Georgia, serif)',
  mono: "'JetBrains Mono', 'Fira Mono', monospace",
  sans: "'Inter', sans-serif",
};

type Tab = 'library' | 'compliance';

export default function LegalPage() {
  const [tab, setTab] = useState<Tab>('compliance');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: S.bg, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        background: S.bgWhite, borderBottom: `1px solid ${S.border}`,
        padding: '14px 24px 0',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontFamily: S.serif, fontSize: 22, fontWeight: 500, color: S.ink, margin: 0, letterSpacing: '-.02em' }}>
              Legal &amp; Compliance
            </h1>
            <p style={{ fontSize: 12.5, color: S.mute, margin: '3px 0 0' }}>
              Document vault · Per-entity compliance tracking · Expiry alerts
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
          {([
            { id: 'compliance', label: 'Compliance Checklist' },
            { id: 'library',    label: 'Document Library' },
          ] as { id: Tab; label: string }[]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                padding: '8px 18px 10px',
                fontSize: 13.5,
                fontWeight: tab === id ? 600 : 400,
                color: tab === id ? S.teal : S.mute,
                background: 'transparent',
                border: 'none',
                borderBottom: tab === id ? `2px solid ${S.teal}` : '2px solid transparent',
                cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
                marginBottom: -1,
              }}
              onMouseOver={e => { if (tab !== id) e.currentTarget.style.color = S.ink; }}
              onMouseOut={e => { if (tab !== id) e.currentTarget.style.color = S.mute; }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 24px', minHeight: 0 }}>
        {tab === 'compliance' && (
          <Suspense fallback={<div style={{ color: S.mute, fontSize: 13 }}>Loading checklist…</div>}>
            <ComplianceChecklist />
          </Suspense>
        )}
        {tab === 'library' && (
          <Suspense fallback={<div style={{ color: S.mute, fontSize: 13 }}>Loading library…</div>}>
            <FilesView />
          </Suspense>
        )}
      </div>
    </div>
  );
}
