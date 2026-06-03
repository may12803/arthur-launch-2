'use client';

import { useEffect } from 'react';

const S = {
  bg: '#0a0a0a',
  bg2: '#111111',
  bg3: '#181818',
  border: '#1f1f1f',
  border2: '#2a2a2a',
  textPrimary: '#e8e8e8',
  textMuted: '#4a4a4a',
  accent: '#f0a500',
  red: '#ef4444',
  mono: "'JetBrains Mono', monospace",
};

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[arthur dashboard error]', error);
  }, [error]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%', background: S.bg, padding: '40px 24px', gap: 16 }}>
      <div style={{ fontFamily: S.mono, fontSize: '10px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: S.red, marginBottom: 4 }}>page error</div>
      <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 20, fontWeight: 500, color: S.textPrimary, textAlign: 'center', maxWidth: 440 }}>
        Something crashed rendering this page.
      </div>
      <div style={{ fontFamily: S.mono, fontSize: 11, color: S.textMuted, background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: 6, padding: '10px 16px', maxWidth: 520, wordBreak: 'break-all', lineHeight: 1.6 }}>
        {error.message || 'Unknown error'}
        {error.digest && <span style={{ color: S.textMuted, marginLeft: 8 }}>[{error.digest}]</span>}
      </div>
      <button
        onClick={reset}
        style={{ marginTop: 8, padding: '6px 18px', fontSize: '10px', fontFamily: S.mono, fontWeight: 700, borderRadius: '3px', background: S.accent, color: S.bg, border: 'none', cursor: 'pointer', letterSpacing: '0.05em' }}
      >
        RETRY
      </button>
    </div>
  );
}
