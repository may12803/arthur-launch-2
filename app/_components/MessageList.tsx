'use client';

import ReactMarkdown from 'react-markdown';
import { FileText, Image as ImageIcon } from 'lucide-react';

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
}

interface MessageListProps {
  messages: Message[];
  loading?: boolean;
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

function AssistantBubble({ msg }: { msg: Message }) {
  return (
    <div
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
                <pre
                  style={{
                    background: 'var(--glass-bg)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    margin: '8px 0',
                    overflowX: 'auto',
                    fontSize: '12px',
                    lineHeight: '1.6',
                    fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
                  }}
                >
                  {children}
                </pre>
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
        </div>

        {/* Model/tier pill */}
        {msg.model && (
          <div
            style={{
              fontSize: '10px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
              letterSpacing: '0.06em',
              marginTop: '2px',
              opacity: 0.55,
            }}
          >
            {msg.tier ? `${msg.tier} · ` : ''}{msg.model}
          </div>
        )}
      </div>
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
          gap: '5px',
          padding: '12px 14px',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: '16px 16px 16px 4px',
          height: '44px',
        }}
      >
        {[0, 1, 2].map(i => (
          <div
            key={i}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--text-muted)',
              animation: `typingBounce 1.2s ease-in-out infinite`,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

export function MessageList({ messages, loading }: MessageListProps) {
  return (
    <>
      {messages.map(msg =>
        msg.role === 'user' ? (
          <UserBubble key={msg.id} msg={msg} />
        ) : (
          <AssistantBubble key={msg.id} msg={msg} />
        )
      )}
      {loading && <TypingIndicator />}
    </>
  );
}
