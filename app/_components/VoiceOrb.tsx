'use client';

import { useEffect, useRef, useState } from 'react';

// Vapi web SDK types (minimal)
interface VapiInstance {
  start(assistantId: string): Promise<void>;
  stop(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
}

interface VapiConstructor {
  new (publicKey: string): VapiInstance;
}

declare global {
  interface Window {
    _vapiInstance?: VapiInstance;
    _vapiClass?: VapiConstructor;
  }
}

const VAPI_PUBLIC_KEY = 'dfbe663f-5360-439b-a2a2-04cf4fd05ec9';
const ASSISTANT_ID = '7614ccf1-879d-4d1c-901c-6f20a910e361';
const VAPI_CDN = 'https://cdn.jsdelivr.net/npm/@vapi-ai/web@2/+esm';

export interface TranscriptLine {
  role: 'user' | 'assistant';
  text: string;
  id: number;
}

interface VoiceOrbProps {
  active: boolean;
  onEnd: () => void;
}

export function VoiceOrb({ active, onEnd }: VoiceOrbProps) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'speaking' | 'listening' | 'ended'>('idle');
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lineCounter = useRef(0);

  // Load and start Vapi when active becomes true
  useEffect(() => {
    if (!active) {
      // Stop if running
      if (window._vapiInstance) {
        try { window._vapiInstance.stop(); } catch {}
      }
      setStatus('idle');
      return;
    }

    let cancelled = false;
    setStatus('connecting');
    setError(null);

    async function loadAndStart() {
      try {
        // Load SDK if not already loaded
        if (!window._vapiClass) {
          const mod = await import(/* webpackIgnore: true */ VAPI_CDN) as { default?: VapiConstructor } & VapiConstructor;
          if (cancelled) return;
          window._vapiClass = (mod.default ?? mod) as VapiConstructor;
        }

        const VapiClass = window._vapiClass!;
        const vapi = new VapiClass(VAPI_PUBLIC_KEY);
        window._vapiInstance = vapi;

        vapi.on('call-start', () => {
          if (!cancelled) setStatus('connected');
        });

        vapi.on('call-end', () => {
          if (!cancelled) {
            setStatus('ended');
            onEnd();
          }
        });

        vapi.on('speech-start', () => {
          if (!cancelled) setStatus('speaking');
        });

        vapi.on('speech-end', () => {
          if (!cancelled) setStatus('listening');
        });

        vapi.on('message', (msg: unknown) => {
          if (cancelled) return;
          const m = msg as { type?: string; role?: string; transcript?: string };
          if (m?.type === 'transcript' && m.transcript) {
            const role = (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant';
            setTranscript(prev => [
              ...prev,
              { role, text: m.transcript!, id: lineCounter.current++ },
            ]);
          }
        });

        vapi.on('error', (err: unknown) => {
          if (cancelled) return;
          const e = err as { message?: string };
          setError(e?.message || 'connection failed');
          setStatus('ended');
          onEnd();
        });

        await vapi.start(ASSISTANT_ID);
      } catch (e: unknown) {
        if (!cancelled) {
          const err = e as { message?: string };
          setError(err?.message || 'failed to start voice call');
          setStatus('ended');
          onEnd();
        }
      }
    }

    loadAndStart();

    return () => {
      cancelled = true;
    };
  }, [active, onEnd]);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  if (!active) return null;

  const statusLabel: Record<typeof status, string> = {
    idle: '',
    connecting: 'connecting...',
    connected: 'connected',
    speaking: 'arthur is speaking...',
    listening: 'listening...',
    ended: 'call ended',
  };

  const orbPulsing = status === 'connected' || status === 'listening' || status === 'speaking';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(12,14,18,0.85)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '32px',
          maxWidth: '420px',
          width: '100%',
          padding: '40px 24px',
        }}
      >
        {/* Pulsing orb */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {orbPulsing && (
            <>
              <div
                style={{
                  position: 'absolute',
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  border: '1px solid var(--accent-orange)',
                  opacity: 0.3,
                  animation: 'orbRing1 2s ease-out infinite',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  width: '140px',
                  height: '140px',
                  borderRadius: '50%',
                  border: '1px solid var(--accent-orange)',
                  opacity: 0.15,
                  animation: 'orbRing2 2s ease-out infinite 0.4s',
                }}
              />
            </>
          )}
          <div
            style={{
              width: '88px',
              height: '88px',
              borderRadius: '50%',
              background: orbPulsing
                ? 'radial-gradient(circle, var(--accent-orange-soft) 0%, rgba(212,255,61,0.04) 100%)'
                : 'var(--glass-bg-tier2)',
              border: `2px solid ${orbPulsing ? 'var(--accent-orange)' : 'var(--glass-border-tier2)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 300ms var(--ease-out-soft)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
                fontSize: '13px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: orbPulsing ? 'var(--accent-orange)' : 'var(--text-muted)',
              }}
            >
              {status === 'speaking' ? '◉' : '◎'}
            </span>
          </div>
        </div>

        {/* Status */}
        <div
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
            fontSize: '12px',
            letterSpacing: '0.06em',
            color: 'var(--text-muted)',
            minHeight: '20px',
            textTransform: 'uppercase',
          }}
        >
          {error ? (
            <span style={{ color: '#ef4444' }}>{error}</span>
          ) : (
            statusLabel[status]
          )}
        </div>

        {/* Transcript */}
        {transcript.length > 0 && (
          <div
            ref={transcriptRef}
            style={{
              width: '100%',
              maxHeight: '200px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '12px 16px',
              background: 'var(--glass-bg-faint)',
              border: '1px solid var(--glass-border)',
              borderRadius: '12px',
            }}
          >
            {transcript.map(line => (
              <div
                key={line.id}
                style={{
                  fontSize: '13px',
                  lineHeight: '1.5',
                  color: line.role === 'assistant' ? 'var(--text-active)' : 'var(--text-muted)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
                    fontSize: '10px',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    marginRight: '8px',
                    color: line.role === 'assistant' ? 'var(--accent-orange)' : 'var(--text-muted)',
                    opacity: 0.7,
                  }}
                >
                  {line.role === 'assistant' ? 'arthur' : 'you'}
                </span>
                {line.text}
              </div>
            ))}
          </div>
        )}

        {/* End call button */}
        <button
          onClick={onEnd}
          style={{
            padding: '10px 28px',
            height: '40px',
            background: 'transparent',
            border: '1px solid var(--glass-border-tier2)',
            borderRadius: 'var(--radius-pill)',
            color: 'var(--text-muted)',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.06em',
            fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
            textTransform: 'uppercase',
            cursor: 'pointer',
            transition: 'all 150ms var(--ease-out-soft)',
            minWidth: 'unset',
            minHeight: 'unset',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = '#ef4444';
            (e.currentTarget as HTMLElement).style.color = '#ef4444';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border-tier2)';
            (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
          }}
        >
          end call
        </button>
      </div>

      <style>{`
        @keyframes orbRing1 {
          0%   { transform: scale(1); opacity: 0.3; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes orbRing2 {
          0%   { transform: scale(1); opacity: 0.15; }
          100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
