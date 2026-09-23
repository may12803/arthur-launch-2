'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Factor } from '@supabase/supabase-js';

// Matches the v2 design system used in app/settings/page.tsx.
const D = {
  glass: 'rgba(255,255,255,0.04)',
  glassBorder: 'rgba(255,255,255,0.08)',
  accent: '#d4ff3d',
  accentSoft: 'rgba(212,255,61,0.14)',
  accentOn: '#1a2400',
  textActive: '#f5f6f8',
  textMain: 'rgba(245,246,248,0.85)',
  textMuted: 'rgba(245,246,248,0.50)',
  sep: 'rgba(255,255,255,0.10)',
  tintEmerald: 'rgba(52,211,153,0.12)',
  tintEmeraldFg: 'rgba(52,211,153,0.85)',
  tintRed: 'rgba(239,68,68,0.12)',
  tintRedFg: 'rgba(239,68,68,0.85)',
  radius: '16px',
  radiusSm: '10px',
  radiusPill: '100px',
  mono: "'JetBrains Mono','GeistMono',monospace",
  sans: 'var(--font-inter,Inter,system-ui,sans-serif)',
  serif: 'var(--font-lora,Lora,Georgia,serif)',
};

type EnrollState = { factorId: string; qrSvg: string; secret: string } | null;

export function MfaSettings({ autoEnroll = false }: { autoEnroll?: boolean }) {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [starting, setStarting] = useState(false);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const loadFactors = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data: userData } = await supabase.auth.getUser();
    setSignedIn(!!userData.user);
    if (!userData.user) {
      setLoading(false);
      return;
    }
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError(listError.message);
      setLoading(false);
      return;
    }
    setFactors(data.totp);
    setLoading(false);
  }, []);

  useEffect(() => { loadFactors(); }, [loadFactors]);

  const startEnroll = useCallback(async () => {
    setError('');
    setStarting(true);
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Authenticator ${new Date().toLocaleDateString()}`,
    });
    setStarting(false);
    if (enrollError) {
      setError(enrollError.message);
      return;
    }
    setEnroll({ factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret });
  }, []);

  useEffect(() => {
    if (autoEnroll && signedIn && !loading && factors.length === 0 && !enroll) {
      startEnroll();
    }
  }, [autoEnroll, signedIn, loading, factors.length, enroll, startEnroll]);

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!enroll || verifying) return;
    setError('');
    setVerifying(true);
    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enroll.factorId,
    });
    if (challengeError) {
      setError(challengeError.message);
      setVerifying(false);
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    setVerifying(false);
    if (verifyError) {
      setError(verifyError.message || 'That code did not match. Try again.');
      setCode('');
      return;
    }
    setEnroll(null);
    setCode('');
    await loadFactors();
  }

  async function onRemove(factorId: string) {
    setError('');
    setRemovingId(factorId);
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    setRemovingId(null);
    if (unenrollError) {
      setError(unenrollError.message);
      return;
    }
    await loadFactors();
  }

  function cancelEnroll() {
    setEnroll(null);
    setCode('');
    setError('');
  }

  if (loading) {
    return <p style={{ fontSize: 13, color: D.textMuted, fontFamily: D.sans }}>Loading security settings…</p>;
  }

  if (signedIn === false) {
    return (
      <div style={{ padding: 16, background: D.tintRed, border: '1px solid rgba(239,68,68,0.2)', borderRadius: D.radiusSm }}>
        <p style={{ fontSize: 13, color: D.textMain, margin: 0, fontFamily: D.sans, lineHeight: 1.6 }}>
          No active Supabase Auth session — sign in again from <a href="/login" style={{ color: D.accent }}>/login</a> to manage two-factor authentication.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 600, color: D.textActive, fontFamily: D.sans }}>
          Two-factor authentication
        </h2>
        <p style={{ fontSize: 13, color: D.textMuted, margin: 0, lineHeight: 1.6, fontFamily: D.sans }}>
          Require a code from an authenticator app (Google Authenticator, 1Password, Authy) in addition to your password.
        </p>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: D.tintRed, border: '1px solid rgba(239,68,68,0.2)', borderRadius: D.radiusSm }}>
          <p style={{ fontSize: 12.5, color: D.tintRedFg, margin: 0, fontFamily: D.sans }}>{error}</p>
        </div>
      )}

      {factors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {factors.map((f) => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
              background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusSm,
            }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20,
                borderRadius: '50%', background: f.status === 'verified' ? D.tintEmerald : D.glass,
                color: f.status === 'verified' ? D.tintEmeraldFg : D.textMuted, fontSize: 10, fontWeight: 700,
              }}>
                {f.status === 'verified' ? '✓' : '…'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: D.textActive, fontFamily: D.sans }}>
                  {f.friendly_name || 'Authenticator app'}
                </div>
                <div style={{ fontSize: 12.5, color: D.textMuted, fontFamily: D.sans }}>
                  {f.status === 'verified' ? 'Verified' : 'Pending verification'} · added {new Date(f.created_at).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => onRemove(f.id)} disabled={removingId === f.id}
                style={{
                  flexShrink: 0, background: 'transparent', border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: D.radiusPill, color: D.tintRedFg, fontSize: 12.5, padding: '5px 14px',
                  cursor: removingId === f.id ? 'not-allowed' : 'pointer', fontFamily: D.sans,
                  opacity: removingId === f.id ? 0.6 : 1,
                }}
              >
                {removingId === f.id ? 'Removing…' : 'Remove'}
              </button>
            </div>
          ))}
        </div>
      )}

      {!enroll && (
        <div>
          <button
            onClick={startEnroll} disabled={starting}
            style={{
              background: D.accent, border: 'none', borderRadius: D.radiusSm, color: D.accentOn,
              fontSize: 13.5, fontWeight: 700, padding: '10px 22px', cursor: starting ? 'not-allowed' : 'pointer',
              opacity: starting ? 0.6 : 1, fontFamily: D.sans,
            }}
          >
            {starting ? 'Starting…' : factors.length > 0 ? 'Add another authenticator' : 'Set up authenticator app'}
          </button>
        </div>
      )}

      {enroll && (
        <form onSubmit={onVerify} style={{
          display: 'flex', flexDirection: 'column', gap: 16, padding: 20,
          background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radius,
        }}>
          <div style={{ fontFamily: D.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: D.textMuted }}>
            Step 1 — scan
          </div>
          <p style={{ fontSize: 13, color: D.textMain, margin: 0, lineHeight: 1.6, fontFamily: D.sans }}>
            Scan this QR code with your authenticator app, or enter the code manually.
          </p>
          <div style={{
            width: 200, height: 200, background: '#fff', borderRadius: D.radiusSm, padding: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* Supabase returns the QR as an inline SVG data URI. */}
            <img src={enroll.qrSvg} alt="Scan with your authenticator app" width={176} height={176} />
          </div>
          <div style={{
            fontFamily: D.mono, fontSize: 12.5, color: D.textActive, letterSpacing: '0.05em',
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${D.glassBorder}`,
            borderRadius: D.radiusSm, padding: '8px 12px', wordBreak: 'break-all',
          }}>
            {enroll.secret}
          </div>

          <div style={{ height: 1, background: D.sep }} />

          <div style={{ fontFamily: D.mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: D.textMuted }}>
            Step 2 — verify
          </div>
          <label htmlFor="enroll-code" style={{ fontSize: 13, color: D.textMain, fontFamily: D.sans }}>
            Enter the 6-digit code from your app
          </label>
          <input
            id="enroll-code" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
            style={{
              width: 160, boxSizing: 'border-box', background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusSm, color: D.textActive,
              fontSize: 20, letterSpacing: '0.4em', textAlign: 'center', padding: '10px 8px',
              fontFamily: D.mono, outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="submit" disabled={verifying || code.length < 6}
              style={{
                background: D.accent, border: 'none', borderRadius: D.radiusSm, color: D.accentOn,
                fontSize: 13.5, fontWeight: 700, padding: '10px 22px',
                cursor: verifying || code.length < 6 ? 'not-allowed' : 'pointer',
                opacity: verifying || code.length < 6 ? 0.6 : 1, fontFamily: D.sans,
              }}
            >
              {verifying ? 'Verifying…' : 'Verify and enable'}
            </button>
            <button
              type="button" onClick={cancelEnroll}
              style={{
                background: D.glass, border: `1px solid ${D.glassBorder}`, borderRadius: D.radiusSm,
                color: D.textMain, fontSize: 13.5, padding: '10px 18px', cursor: 'pointer', fontFamily: D.sans,
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
