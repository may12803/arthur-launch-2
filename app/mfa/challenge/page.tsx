'use client';

import { useState, useEffect, useCallback, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

const SERIF = 'var(--font-lora, Lora, Georgia, serif)';
const SANS = 'var(--font-inter, Inter, system-ui, sans-serif)';
const MONO = "'JetBrains Mono','GeistMono',monospace";
const BG = '#0c0e12';
const GLASS = 'rgba(255,255,255,0.04)';
const GLASS_BORDER = 'rgba(255,255,255,0.08)';
const ACCENT = '#d4ff3d';
const ACCENT_ON = '#1a2400';
const TEXT = '#f5f6f8';
const TEXT_MUTED = 'rgba(245,246,248,0.50)';
const TEXT_FAINT = 'rgba(245,246,248,0.30)';

function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

function ChallengeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));

  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError('');

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
      return;
    }

    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) {
      setError('Could not read your sign-in level. Try again.');
      setLoading(false);
      return;
    }
    if (aal.nextLevel !== 'aal2' || aal.currentLevel === 'aal2') {
      // Nothing to challenge (no verified factor, or already at aal2).
      router.replace(next);
      return;
    }

    const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) {
      setError(factorsError.message);
      setLoading(false);
      return;
    }
    const verifiedTotp = factorsData.totp.find((f) => f.status === 'verified');
    if (!verifiedTotp) {
      router.replace(next);
      return;
    }

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: verifiedTotp.id,
    });
    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    setFactorId(verifiedTotp.id);
    setChallengeId(challenge.id);
    setLoading(false);
  }, [next, router]);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!factorId || !challengeId || verifying) return;
    setError('');
    setVerifying(true);
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: code.trim(),
    });
    if (verifyError) {
      setError(verifyError.message || 'That code did not match. Try again.');
      setVerifying(false);
      setCode('');
      return;
    }
    window.location.href = next;
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
            Two-Factor Verification
          </div>
          <h1 style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 500, letterSpacing: '-.025em', margin: '0 0 6px', lineHeight: 1.15, color: TEXT }}>
            Enter your authenticator code.
          </h1>
          <p style={{ fontSize: 13.5, color: TEXT_MUTED, lineHeight: 1.55, margin: '0 0 24px' }}>
            Open your authenticator app and enter the 6-digit code for Arthur.
          </p>

          {loading ? (
            <p style={{ fontSize: 13, color: TEXT_MUTED, margin: 0 }}>Loading…</p>
          ) : (
            <>
              <label htmlFor="code" style={{ display: 'block', fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: TEXT_MUTED, marginBottom: 7 }}>
                Verification code
              </label>
              <input
                id="code" inputMode="numeric" pattern="[0-9]*" autoFocus
                maxLength={6} value={code}
                onChange={(e) => { setCode(e.target.value.replace(/[^0-9]/g, '')); if (error) setError(''); }}
                style={{
                  width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${GLASS_BORDER}`, borderRadius: 12, color: TEXT,
                  fontSize: 24, letterSpacing: '0.5em', textAlign: 'center', padding: '14px 10px',
                  fontFamily: MONO, outline: 'none', marginBottom: 14,
                }}
              />
              {error && (
                <p style={{ fontSize: 12.5, color: '#ff6b6b', margin: '0 0 14px', lineHeight: 1.5 }}>{error}</p>
              )}
              <button
                type="submit" disabled={verifying || code.length < 6}
                style={{
                  width: '100%', background: ACCENT, color: ACCENT_ON, border: 'none',
                  borderRadius: 12, padding: '13px 0', fontSize: 14, fontWeight: 700,
                  cursor: verifying || code.length < 6 ? 'not-allowed' : 'pointer',
                  opacity: verifying || code.length < 6 ? 0.6 : 1, fontFamily: SANS,
                }}
              >
                {verifying ? 'Verifying…' : 'Verify'}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

export default function MfaChallengePage() {
  return (
    <Suspense fallback={null}>
      <ChallengeForm />
    </Suspense>
  );
}
