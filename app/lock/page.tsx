'use client';

import { useState, useEffect } from 'react';
import { Nav } from '../_components/Layout';
import { GlassPanel } from '../_components/GlassPanel';
import { TokenChip } from '../_components/TokenChip';

function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return (
      <div style={{
        fontSize: 160,
        fontWeight: 200,
        letterSpacing: '-0.04em',
        color: 'var(--text-active)',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        minHeight: 160,
      }}>
        &nbsp;
      </div>
    );
  }

  const h = now.getHours() % 12 || 12;
  const m = String(now.getMinutes()).padStart(2, '0');
  const ampm = now.getHours() >= 12 ? 'PM' : 'AM';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
      <div style={{
        fontSize: 160,
        fontWeight: 200,
        letterSpacing: '-0.04em',
        color: 'var(--text-active)',
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {h}:{m}
      </div>
      <div style={{
        fontSize: 'var(--fs-h3)',
        fontWeight: 300,
        color: 'var(--text-muted)',
        marginTop: 'var(--space-6)',
        letterSpacing: '0.04em',
      }}>
        {ampm}
      </div>
    </div>
  );
}

function LiveDate() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div style={{
      fontSize: 'var(--fs-h2)',
      color: 'var(--text-main)',
      fontWeight: 400,
      letterSpacing: '-0.01em',
    }}>
      {dateStr}
    </div>
  );
}

function BriefingCard() {
  const placeholderContent = {
    greeting: 'Good morning.',
    meetings: 3,
    pendingEmails: 7,
    weather: '62°F, partly cloudy',
  };

  return (
    <GlassPanel style={{ width: 500, maxWidth: '100%', padding: 'var(--space-lg)' }}>
      {/* Card header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--space-md)',
      }}>
        <span style={{
          fontFamily: 'var(--font-jetbrains, monospace)',
          fontSize: 'var(--fs-mono)',
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}>
          Daily Briefing
        </span>
        <TokenChip label="Active" color="active" size="xs" />
      </div>

      <div style={{ height: 1, background: 'var(--glass-t1-border)', marginBottom: 'var(--space-md)' }} />

      {/* Briefing body */}
      <p style={{
        margin: 0,
        fontSize: 'var(--fs-small)',
        color: 'var(--text-main)',
        lineHeight: 1.75,
      }}>
        {placeholderContent.greeting} You have{' '}
        <span style={{ fontWeight: 700, color: 'var(--text-active)' }}>
          {placeholderContent.meetings} meetings
        </span>{' '}
        today. Weather is{' '}
        <span style={{ fontWeight: 600, color: 'var(--text-active)' }}>
          {placeholderContent.weather}
        </span>
        . Arthur has prepared drafts for{' '}
        <span style={{ fontWeight: 700, color: 'var(--accent-orange)' }}>
          {placeholderContent.pendingEmails} urgent emails
        </span>{' '}
        awaiting your review.
      </p>

      {/* KV stats row */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-md)',
        marginTop: 'var(--space-md)',
        paddingTop: 'var(--space-sm)',
        borderTop: '1px dashed var(--glass-t1-border)',
      }}>
        {[
          { key: 'Meetings', val: `${placeholderContent.meetings}` },
          { key: 'Approvals', val: `${placeholderContent.pendingEmails}` },
          { key: 'Weather', val: placeholderContent.weather },
        ].map(s => (
          <div key={s.key} style={{ flex: 1 }}>
            <div style={{
              fontFamily: 'var(--font-jetbrains, monospace)',
              fontSize: 9,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-1)',
            }}>{s.key}</div>
            <div style={{
              fontFamily: 'var(--font-jetbrains, monospace)',
              fontSize: 'var(--fs-small)',
              fontWeight: 600,
              color: 'var(--text-active)',
            }}>{s.val}</div>
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

function FingerprintIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 4C8.477 4 4 8.477 4 14" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 4C19.523 4 24 8.477 24 14" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 14C9 11.239 11.239 9 14 9" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M19 14C19 16.761 16.761 19 14 19" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 9C16.761 9 19 11.239 19 14" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 14C9 16.761 11.239 19 14 19" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="14" cy="14" r="2" fill="var(--text-muted)"/>
      <path d="M14 12V7" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 21V16" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 14H7" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M21 14H16" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function FingerprintIconAccent() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 4C8.477 4 4 8.477 4 14" stroke="var(--accent-orange)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 4C19.523 4 24 8.477 24 14" stroke="var(--accent-orange)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 14C9 11.239 11.239 9 14 9" stroke="var(--accent-orange)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M19 14C19 16.761 16.761 19 14 19" stroke="var(--accent-orange)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 9C16.761 9 19 11.239 19 14" stroke="var(--accent-orange)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 14C9 16.761 11.239 19 14 19" stroke="var(--accent-orange)" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="14" cy="14" r="2" fill="var(--accent-orange)"/>
      <path d="M14 12V7" stroke="var(--accent-orange)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M14 21V16" stroke="var(--accent-orange)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 14H7" stroke="var(--accent-orange)" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M21 14H16" stroke="var(--accent-orange)" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

export default function LockPage() {
  const [hoveringFP, setHoveringFP] = useState(false);

  return (
    <>
      {/* Nav is rendered by layout but lock overlays it completely */}
      <Nav />

      {/* Full-viewport overlay — z-index 200 covers nav island */}
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'var(--bg-base)',
        backgroundImage: `
          linear-gradient(var(--grid-line) 1px, transparent 1px),
          linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px',
        backgroundPosition: 'center top',
        overflow: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Status bar top-right */}
        <div style={{
          position: 'absolute',
          top: 'var(--space-6)',
          right: 'var(--space-6)',
          fontFamily: 'var(--font-jetbrains, monospace)',
          fontSize: 'var(--fs-mono)',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          zIndex: 10,
        }}>
          Wi-Fi 6E · Secure Enclave · 100%
        </div>

        {/* Main content */}
        <div style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-xl) var(--space-lg)',
        }}>
          <div style={{
            width: '100%',
            maxWidth: 800,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 'var(--space-md)',
          }}>

            {/* Logo area */}
            <div style={{ marginBottom: 'var(--space-sm)' }}>
              <div style={{
                fontFamily: 'var(--font-jetbrains, monospace)',
                fontSize: 'var(--fs-mono)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--accent-orange)',
                marginBottom: 'var(--space-1)',
              }}>
                ARTHUR OS
              </div>
              <div style={{
                fontFamily: 'var(--font-jetbrains, monospace)',
                fontSize: 'var(--fs-mono)',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>
                Core Interface
              </div>
            </div>

            {/* Clock */}
            <LiveClock />

            {/* Date */}
            <LiveDate />

            {/* Briefing card */}
            <div style={{ marginTop: 'var(--space-sm)' }}>
              <BriefingCard />
            </div>

            {/* Unlock area */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-sm)',
              marginTop: 'var(--space-md)',
            }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 'var(--radius-pill)',
                  background: hoveringFP ? 'var(--glass-t2-bg)' : 'var(--glass-t1-bg)',
                  backdropFilter: 'blur(var(--blur-amount))',
                  WebkitBackdropFilter: 'blur(var(--blur-amount))',
                  border: hoveringFP ? '1px solid var(--accent-orange)' : '1px solid var(--glass-t1-border)',
                  boxShadow: hoveringFP ? '0 0 0 3px var(--accent-orange-soft), var(--glass-t1-shadow)' : 'var(--glass-t1-shadow)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all var(--duration-quick) var(--ease-out-soft)',
                  transform: hoveringFP ? 'scale(1.06)' : 'scale(1)',
                }}
                onMouseEnter={() => setHoveringFP(true)}
                onMouseLeave={() => setHoveringFP(false)}
              >
                {hoveringFP ? <FingerprintIconAccent /> : <FingerprintIcon />}
              </div>
              <button style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 'var(--fs-mono)',
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
                padding: 'var(--space-1) var(--space-2)',
              }}>
                Use Passcode Instead
              </button>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
