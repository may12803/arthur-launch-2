'use client';

import { useState, useEffect, FormEvent } from 'react';

const SERIF = 'var(--font-lora, Lora, Georgia, serif)';
const SANS = 'var(--font-inter, Inter, system-ui, sans-serif)';
const MONO = "'JetBrains Mono','GeistMono',monospace";
const BG = '#0c0e12';
const GLASS = 'rgba(255,255,255,0.04)';
const GLASS_BORDER = 'rgba(255,255,255,0.08)';
const GLASS_MID = 'rgba(255,255,255,0.08)';
const ACCENT = '#d4ff3d';
const ACCENT_ON = '#1a2400';
const TEXT = '#f5f6f8';
const TEXT_MUTED = 'rgba(245,246,248,0.50)';
const TEXT_FAINT = 'rgba(245,246,248,0.30)';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const params = new URLSearchParams(window.location.search);
        const next = params.get('next');
        const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
        window.location.href = safe;
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Sign-in failed.');
      setLoading(false);
    } catch {
      setError('Network error — try again.');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: BG,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: SANS,
      backgroundImage: `linear-gradient(${GLASS_BORDER} 1px, transparent 1px), linear-gradient(90deg, ${GLASS_BORDER} 1px, transparent 1px)`,
      backgroundSize: '60px 60px',
    }}>
      <div style={{
        width: 420, maxWidth: '100%',
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity .5s ease, transform .5s cubic-bezier(.22,1,.36,1)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: ACCENT, marginBottom: 8 }}>
            ARTHUR OS
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 32, fontWeight: 500, color: TEXT, letterSpacing: '-.02em', lineHeight: 1 }}>
            arthur
          </div>
          <div style={{ margin: '12px auto 0', width: 26, height: 1, background: 'rgba(212,255,61,0.3)' }} />
        </div>

        <form onSubmit={onSubmit} style={{
          background: GLASS, border: `1px solid ${GLASS_BORDER}`, borderRadius: 20,
          padding: '32px 30px', backdropFilter: 'blur(24px)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)',
        }}>
          <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: TEXT_FAINT, marginBottom: 10 }}>
            Private Dashboard
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 500, letterSpacing: '-.025em', margin: '0 0 6px', lineHeight: 1.15, color: TEXT }}>
            Welcome back, Daniel.
          </h1>
          <p style={{ fontSize: 13.5, color: TEXT_MUTED, lineHeight: 1.55, margin: '0 0 24px' }}>
            Enter your password to open Arthur.
          </p>

          <label htmlFor="pw" style={{ display: 'block', fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TEXT_MUTED, marginBottom: 7 }}>
            Password
          </label>
          <input
            id="pw" type="password" autoFocus value={password}
            onChange={(e) => { setPassword(e.target.value); if (error) setError(''); }}
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            placeholder="••••••••••"
            style={{
              width: '100%', boxSizing: 'border-box', fontSize: 16, fontFamily: SANS,
              padding: '12px 14px', borderRadius: 10, color: TEXT, background: GLASS_MID,
              border: '1px solid ' + (error ? 'rgba(239,68,68,0.6)' : focused ? ACCENT : GLASS_BORDER),
              boxShadow: focused && !error ? `0 0 0 3px rgba(212,255,61,0.15)` : 'none',
              outline: 'none', transition: 'border-color .15s ease, box-shadow .15s ease',
            }}
          />

          {error && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'rgba(239,68,68,0.85)', marginTop: 10, lineHeight: 1.4 }}>
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading || !password}
            style={{
              width: '100%', marginTop: 22, padding: '12px 16px', borderRadius: 10, border: 'none',
              background: loading || !password ? 'rgba(212,255,61,0.3)' : ACCENT,
              color: ACCENT_ON, fontFamily: SANS, fontSize: 14, fontWeight: 700, letterSpacing: '.01em',
              cursor: loading || !password ? 'default' : 'pointer',
              transition: 'background .18s ease',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontFamily: MONO, fontSize: 10, color: TEXT_FAINT, marginTop: 20, letterSpacing: '0.08em' }}>
          Aspen &amp; May — for Daniel only
        </p>
      </div>
    </div>
  );
}
