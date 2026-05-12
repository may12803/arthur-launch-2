'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { MessageList, Message, Attachment } from './MessageList';
import { ChatInput, PendingAttachment } from './ChatInput';

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

interface UploadResult {
  url: string;
  signedUrl: string;
  mime: string;
  name: string;
  size: number;
}

async function uploadAttachment(file: File): Promise<UploadResult | null> {
  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/chat/upload', {
      method: 'POST',
      body: fd,
      credentials: 'include',
    });
    if (!res.ok) return null;
    return await res.json() as UploadResult;
  } catch {
    return null;
  }
}

interface ChatSurfaceProps {
  voiceActive?: boolean;
  onOpenVoice?: () => void;
  sessionId?: string;  // when present, load this session's history on mount
}

export function ChatSurface({ voiceActive, onOpenVoice, sessionId }: ChatSurfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stable per-session client id. If parent supplies sessionId (from URL),
  // use it. Otherwise mint a fresh uuid that becomes the new session on
  // first message.
  const [currentSessionId, setCurrentSessionId] = useState<string>(sessionId ?? uid());

  // When the URL session id changes (user clicks a different chat in the
  // sidebar), reset state and load that session's history.
  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      setCurrentSessionId(sessionId);
      setMessages([]);
      setLoading(true);
      fetch(`/api/chat/sessions/${sessionId}`, { credentials: 'include' })
        .then(r => r.ok ? r.json() : { messages: [] })
        .then(json => {
          const rows = (json.messages ?? []) as Array<{ role: string; content: string; metadata?: { tool_calls?: unknown; tier?: string; model?: string }; created_at: string }>;
          const loaded: Message[] = rows
            .filter(r => r.role === 'user' || r.role === 'assistant')
            .map(r => ({
              id: uid(),
              role: r.role as 'user' | 'assistant',
              content: r.content,
              model: r.metadata?.model,
              tier: r.metadata?.tier,
              ts: new Date(r.created_at).getTime(),
            }));
          setMessages(loaded);
        })
        .finally(() => setLoading(false));
    } else if (!sessionId && messages.length > 0) {
      // URL dropped the chat param → user clicked "+ New chat"
      setMessages([]);
      setCurrentSessionId(uid());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string, pendingAtts: PendingAttachment[]) => {
    if (loading) return;

    // 1. Upload attachments first
    let attachments: Attachment[] = [];
    if (pendingAtts.length > 0) {
      const results = await Promise.all(pendingAtts.map(att => uploadAttachment(att.file)));
      attachments = results.filter((r): r is UploadResult => r !== null);
    }

    // 2. Add user message to UI
    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: text,
      attachments,
      ts: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // 3. Build prompt — append attachment info if any
    let prompt = text;
    if (attachments.length > 0 && !text) {
      prompt = `[Attached ${attachments.length} file(s): ${attachments.map(a => a.name).join(', ')}]`;
    } else if (attachments.length > 0) {
      prompt = text + `\n\n[Attached: ${attachments.map(a => a.name).join(', ')}]`;
    }

    // 4. POST to /api/chat
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          prompt,
          session_id: currentSessionId,
          attachments: attachments.length > 0 ? attachments : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const errMsg: Message = {
          id: uid(),
          role: 'assistant',
          content: `Error: ${(errData as { error?: string }).error || res.statusText}`,
          ts: Date.now(),
        };
        setMessages(prev => [...prev, errMsg]);
        return;
      }

      const data = await res.json() as {
        response?: string;
        model_used?: string;
        tier_used?: string;
      };

      const assistantMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: data.response ?? '(no response)',
        model: data.model_used,
        tier: data.tier_used,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      // Tell the sidebar to refresh its session list (title/recency may have changed)
      window.dispatchEvent(new CustomEvent('arthur:chat-saved'));
    } catch (e: unknown) {
      const err = e as { message?: string };
      const errMsg: Message = {
        id: uid(),
        role: 'assistant',
        content: `Network error: ${err?.message || 'unknown'}`,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }, [loading, currentSessionId]);

  // Listen for quick-prompt chip clicks (EmptyState dispatches these via a
  // window event because QuickPromptButton lives outside this component's
  // direct props chain). Wire the listener here so chips actually send.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail === 'string' && detail.length > 0) {
        sendMessage(detail, []);
      }
    };
    window.addEventListener('arthur:quick-prompt', handler);
    return () => window.removeEventListener('arthur:quick-prompt', handler);
  }, [sendMessage]);

  const isEmpty = messages.length === 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
      }}
    >
      {/* ── Messages area ─────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: isEmpty ? '0' : '24px 24px 8px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: isEmpty ? 'center' : 'flex-start',
        }}
      >
        {isEmpty ? (
          <EmptyState />
        ) : (
          <MessageList messages={messages} loading={loading} />
        )}
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <ChatInput
        onSend={sendMessage}
        disabled={loading}
        onVoiceClick={onOpenVoice}
        voiceActive={voiceActive}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state — shown before any messages
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '40px 24px',
        textAlign: 'center',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'var(--glass-bg-tier2)',
          border: '1px solid var(--glass-border-tier2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          fontWeight: 700,
          fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
          color: 'var(--text-muted)',
          marginBottom: '8px',
        }}
      >
        A
      </div>
      <div>
        <div
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--text-active)',
            letterSpacing: '-0.01em',
            marginBottom: '8px',
          }}
        >
          Good to see you, Daniel.
        </div>
        <div
          style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            maxWidth: '380px',
            lineHeight: '1.6',
          }}
        >
          What are we working on today?
        </div>
      </div>

      {/* Quick prompts */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          justifyContent: 'center',
          marginTop: '8px',
          maxWidth: '560px',
        }}
      >
        {[
          "What's in my inbox?",
          "What's on my calendar today?",
          "What's the weather in Kalamazoo?",
          "Show me recent activity",
          "What are my active goals?",
        ].map(q => (
          <QuickPromptButton key={q} text={q} />
        ))}
      </div>
    </div>
  );
}

function QuickPromptButton({ text }: { text: string }) {
  // We can't directly call sendMessage from here — use a custom event
  // that ChatSurface listens to, or just let the ChatInput handle it.
  const handleClick = () => {
    const inputEvent = new CustomEvent('arthur:quick-prompt', { detail: text });
    window.dispatchEvent(inputEvent);
  };

  return (
    <button
      onClick={handleClick}
      style={{
        padding: '7px 14px',
        height: 'auto',
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        borderRadius: 'var(--radius-pill)',
        color: 'var(--text-muted)',
        fontSize: '12.5px',
        cursor: 'pointer',
        transition: 'all 150ms',
        fontFamily: 'inherit',
        minWidth: 'unset',
        minHeight: 'unset',
        lineHeight: '1.4',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.background = 'var(--glass-bg-tier2)';
        (e.currentTarget as HTMLElement).style.color = 'var(--text-active)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border-tier2)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)';
        (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--glass-border)';
      }}
    >
      {text}
    </button>
  );
}
