'use client';

import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, Image as ImageIcon, Copy, RefreshCw, Pencil, Check } from 'lucide-react';

export interface Attachment {
  url?: string;
  signedUrl?: string;
  mime: string;
  name: string;
  size: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
  model?: string;
  tier?: string;
  ts?: number;
  streaming?: boolean;
  latency_ms?: number;
  tokens?: number;
}

interface MessageListProps {
  messages: Message[];
  loading?: boolean;
  onRegenerate?: (msgId: string) => void;
  onEditPrompt?: (msgId: string) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function AttachmentChip({ att }: { att: Attachment }) {
  const isImage = att.mime.startsWith('image/');
  const displayUrl = att.signedUrl || att.url;

  if (isImage && displayUrl) {
    return (
      <div
        style={{
          borderRadius: '8px',
          overflow: 'hidden',
          maxWidth: '240px',
          border: '1px solid var(--glass-border)',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displayUrl}
          alt={att.name}
          style={{ maxWidth: '100%', display: 'block', maxHeight: '180px', objectFit: 'cover' }}
        />
      </div>
    );
  }

  return (
    <a
      href={displayUrl}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: '8px',
        color: 'var(--text-main)',
        textDecoration: 'none',
        fontSize: '12px',
        maxWidth: '220px',
      }}
    >
      {isImage ? <ImageIcon size={14} style={{ flexShrink: 0 }} /> : <FileText size={14} style={{ flexShrink: 0 }} />}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}
      >
        {att.name}
      </span>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{formatSize(att.size)}</span>
    </a>
  );
}

function UserBubble({ msg }: { msg: Message }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        marginBottom: '16px',
        gap: '10px',
        alignItems: 'flex-end',
      }}
    >
      <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
        {/* Attachments */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'flex-end' }}>
            {msg.attachments.map((att, i) => (
              <AttachmentChip key={i} att={att} />
            ))}
          </div>
        )}
        {/* Text */}
        {msg.content && (
          <div
            style={{
              background: 'var(--glass-bg-tier2)',
              border: '1px solid var(--glass-border-tier2)',
              borderRadius: '16px 16px 4px 16px',
              padding: '10px 14px',
              fontSize: '14px',
              lineHeight: '1.55',
              color: 'var(--text-active)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {msg.content}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Code block with copy button (no syntax highlighting dep)
// ─────────────────────────────────────────────────────────────────────────────

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = typeof children === 'string' ? children
      : (children as React.ReactElement)?.props?.children ?? '';
    navigator.clipboard.writeText(String(text)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }, [children]);

  return (
    <div style={{ position: 'relative', margin: '8px 0' }}>
      <pre
        style={{
          background: 'var(--glass-bg-tier2)',
          border: '1px solid var(--glass-border-tier2)',
          borderRadius: '8px',
          padding: '12px 14px',
          paddingRight: '44px',
          overflowX: 'auto',
          fontSize: '12px',
          lineHeight: '1.6',
          fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
          margin: 0,
        }}
      >
        {children}
      </pre>
      <button
        onClick={handleCopy}
        title={copied ? 'Copied!' : 'Copy code'}
        className="code-copy-btn"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'var(--glass-bg-tier3)',
          border: '1px solid var(--glass-border)',
          borderRadius: '6px',
          padding: '3px 6px',
          cursor: 'pointer',
          color: copied ? 'var(--accent-orange)' : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '10px',
          fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
          opacity: 0,
          transition: 'opacity 150ms, color 150ms',
          minWidth: 'unset',
          minHeight: 'unset',
        }}
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
      </button>
      <style>{`
        div:hover > .code-copy-btn { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier tooltip badge
// ─────────────────────────────────────────────────────────────────────────────

function TierBadge({ tier, model, latency_ms, tokens }: { tier?: string; model?: string; latency_ms?: number; tokens?: number }) {
  const [hovered, setHovered] = useState(false);
  if (!model) return null;
  const label = tier ? `${tier} · ${model}` : model;
  const tooltip = [
    label,
    latency_ms != null ? `${(latency_ms / 1000).toFixed(1)}s` : null,
    tokens != null ? `~${tokens} tok` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      style={{ position: 'relative', display: 'inline-block', marginTop: '4px' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        style={{
          fontSize: '10px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
          letterSpacing: '0.06em',
          opacity: hovered ? 0.8 : 0.35,
          transition: 'opacity 150ms',
          cursor: 'default',
          userSelect: 'none',
        }}
      >
        {label}
      </span>
      {hovered && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '4px',
            background: 'var(--glass-bg-tier3)',
            border: '1px solid var(--glass-border-tier2)',
            borderRadius: '6px',
            padding: '4px 8px',
            whiteSpace: 'nowrap',
            fontSize: '10px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action bar (hover on assistant messages)
// ─────────────────────────────────────────────────────────────────────────────

function ActionBar({ msg, onRegenerate, onEditPrompt }: {
  msg: Message;
  onRegenerate?: (id: string) => void;
  onEditPrompt?: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }, [msg.content]);

  return (
    <div
      className="msg-action-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '2px',
        marginTop: '6px',
        opacity: 0,
        transition: 'opacity 150ms',
      }}
    >
      {onRegenerate && (
        <ActionButton
          icon={<RefreshCw size={11} />}
          label="Regenerate"
          onClick={() => onRegenerate(msg.id)}
        />
      )}
      <ActionButton
        icon={copied ? <Check size={11} /> : <Copy size={11} />}
        label={copied ? 'Copied' : 'Copy'}
        onClick={handleCopy}
        active={copied}
      />
      {onEditPrompt && (
        <ActionButton
          icon={<Pencil size={11} />}
          label="Edit prompt"
          onClick={() => onEditPrompt(msg.id)}
        />
      )}
    </div>
  );
}

function ActionButton({ icon, label, onClick, active }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  const [hov, setHov] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        title={label}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 7px',
          background: hov ? 'var(--glass-bg-tier2)' : 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: '6px',
          cursor: 'pointer',
          color: active ? 'var(--accent-orange)' : hov ? 'var(--text-active)' : 'var(--text-muted)',
          fontSize: '10px',
          fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
          transition: 'all 120ms',
          minWidth: 'unset',
          minHeight: 'unset',
          lineHeight: 1,
        }}
      >
        {icon}
        <span>{label}</span>
      </button>
    </div>
  );
}

function AssistantBubble({ msg, onRegenerate, onEditPrompt }: {
  msg: Message;
  onRegenerate?: (id: string) => void;
  onEditPrompt?: (id: string) => void;
}) {
  return (
    <div
      className="assistant-msg-group"
      style={{
        display: 'flex',
        justifyContent: 'flex-start',
        marginBottom: '20px',
        gap: '10px',
        alignItems: 'flex-start',
      }}
    >
      {/* Avatar */}
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'var(--glass-bg-tier3)',
          border: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 700,
          fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
          color: 'var(--text-muted)',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        A
      </div>

      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {/* Attachments */}
        {msg.attachments && msg.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {msg.attachments.map((att, i) => (
              <AttachmentChip key={i} att={att} />
            ))}
          </div>
        )}
        {/* Markdown content */}
        <div
          className="arthur-prose"
          style={{
            fontSize: '14px',
            lineHeight: '1.65',
            color: 'var(--text-main)',
          }}
        >
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p style={{ margin: '0 0 10px', lineHeight: '1.65' }}>{children}</p>
              ),
              h1: ({ children }) => (
                <h1 style={{ fontSize: '18px', fontWeight: 600, margin: '16px 0 8px', color: 'var(--text-active)' }}>{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '14px 0 6px', color: 'var(--text-active)' }}>{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '12px 0 4px', color: 'var(--text-active)' }}>{children}</h3>
              ),
              ul: ({ children }) => (
                <ul style={{ margin: '6px 0 10px', paddingLeft: '18px' }}>{children}</ul>
              ),
              ol: ({ children }) => (
                <ol style={{ margin: '6px 0 10px', paddingLeft: '18px' }}>{children}</ol>
              ),
              li: ({ children }) => (
                <li style={{ marginBottom: '4px', lineHeight: '1.55' }}>{children}</li>
              ),
              code: ({ children, className }) => {
                const inline = !className;
                if (inline) {
                  return (
                    <code
                      style={{
                        fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
                        fontSize: '12.5px',
                        background: 'var(--glass-bg-tier2)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '4px',
                        padding: '1px 5px',
                        color: 'var(--accent-orange)',
                      }}
                    >
                      {children}
                    </code>
                  );
                }
                return (
                  <code
                    style={{
                      fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
                      fontSize: '12px',
                      display: 'block',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}
                  >
                    {children}
                  </code>
                );
              },
              pre: ({ children }) => (
                <CodeBlock>{children}</CodeBlock>
              ),
              blockquote: ({ children }) => (
                <blockquote
                  style={{
                    borderLeft: '3px solid var(--accent-orange)',
                    margin: '8px 0',
                    padding: '6px 14px',
                    color: 'var(--text-muted)',
                    fontSize: '13.5px',
                    fontStyle: 'italic',
                  }}
                >
                  {children}
                </blockquote>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: 'var(--accent-orange)',
                    textDecoration: 'underline',
                    textDecorationColor: 'rgba(212,255,61,0.4)',
                  }}
                >
                  {children}
                </a>
              ),
              strong: ({ children }) => (
                <strong style={{ fontWeight: 600, color: 'var(--text-active)' }}>{children}</strong>
              ),
              hr: () => (
                <hr style={{ border: 'none', borderTop: '1px solid var(--line-separator)', margin: '16px 0' }} />
              ),
            }}
          >
            {msg.content}
          </ReactMarkdown>
          {/* Streaming cursor */}
          {msg.streaming && (
            <span
              style={{
                display: 'inline-block',
                width: '2px',
                height: '1em',
                background: 'var(--accent-orange)',
                marginLeft: '2px',
                verticalAlign: 'text-bottom',
                animation: 'cursorBlink 0.8s step-end infinite',
                opacity: 0.8,
              }}
            />
          )}
        </div>

        {/* Hover action bar + tier badge row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {!msg.streaming && (
            <ActionBar msg={msg} onRegenerate={onRegenerate} onEditPrompt={onEditPrompt} />
          )}
          <TierBadge tier={msg.tier} model={msg.model} latency_ms={msg.latency_ms} tokens={msg.tokens} />
        </div>
      </div>

      {/* CSS for hover reveal + cursor */}
      <style>{`
        .assistant-msg-group:hover .msg-action-bar { opacity: 1 !important; }
        @keyframes cursorBlink { 0%,100% { opacity: 0.8; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '20px' }}>
      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'var(--glass-bg-tier3)',
          border: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '10px',
          fontWeight: 700,
          fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
          color: 'var(--text-muted)',
          flexShrink: 0,
          marginTop: '2px',
        }}
      >
        A
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          animation: 'thinkFadeIn 200ms ease-out both',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '3px',
            height: '14px',
            background: 'var(--accent-orange)',
            borderRadius: '2px',
            animation: 'thinkPulse 1s ease-in-out infinite',
            opacity: 0.7,
          }}
        />
        <span
          style={{
            fontSize: '13px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
            letterSpacing: '0.02em',
          }}
        >
          arthur is thinking...
        </span>
      </div>
      <style>{`
        @keyframes thinkFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes thinkPulse { 0%,100% { opacity: 0.3; transform: scaleY(0.6); } 50% { opacity: 0.8; transform: scaleY(1); } }
      `}</style>
    </div>
  );
}

export function MessageList({ messages, loading, onRegenerate, onEditPrompt }: MessageListProps) {
  return (
    <>
      {messages.map(msg =>
        msg.role === 'user' ? (
          <UserBubble key={msg.id} msg={msg} />
        ) : (
          <AssistantBubble key={msg.id} msg={msg} onRegenerate={onRegenerate} onEditPrompt={onEditPrompt} />
        )
      )}
      {loading && <TypingIndicator />}
    </>
  );
}
