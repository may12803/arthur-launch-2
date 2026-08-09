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

// Pseudo-stream a full response string into a message state field.
// Reveals ~30 chars every 60ms so the user sees text "typing in"
// rather than the full wall of text appearing after a long pause.
async function pseudoStream(
  fullText: string,
  onChunk: (partial: string) => void,
  onDone: () => void,
) {
  const CHUNK = 30;
  const INTERVAL = 60;
  let pos = 0;
  return new Promise<void>(resolve => {
    const tick = setInterval(() => {
      pos = Math.min(pos + CHUNK, fullText.length);
      onChunk(fullText.slice(0, pos));
      if (pos >= fullText.length) {
        clearInterval(tick);
        onDone();
        resolve();
      }
    }, INTERVAL);
  });
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
  const [prefillText, setPrefillText] = useState<string | undefined>(undefined);
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
    const assistantMsgId = uid();
    try {
      // Real SSE streaming first. The old path waited for the ENTIRE reply (every
      // tool round + full generation) before pseudoStream animated it — so the
      // typewriter effect was cosmetic and the user stared at a spinner until then.
      // Now tokens render as they are produced. Any failure falls through to the
      // original non-streaming path below, so this can never cost a reply.
      try {
        const sres = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          credentials: 'include',
          body: JSON.stringify({
            prompt,
            session_id: currentSessionId,
            stream: true,
            attachments: attachments.length > 0 ? attachments : undefined,
          }),
        });

        if (sres.ok && sres.body && (sres.headers.get('content-type') || '').includes('text/event-stream')) {
          const reader = sres.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          let acc = '';
          let placed = false;
          type DoneMeta = { model_used?: string; tier_used?: string; latency_ms?: number; tokens?: number };
          let done: DoneMeta | null = null;

          const place = () => {
            if (placed) return;
            placed = true;
            setLoading(false);
            setMessages(prev => [...prev, {
              id: assistantMsgId, role: 'assistant', content: '', ts: Date.now(), streaming: true,
            }]);
          };
          const paint = (s: string) => setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, content: s } : m));

          for (;;) {
            const { done: fin, value } = await reader.read();
            if (fin) break;
            buf += dec.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf('\n')) !== -1) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line.startsWith('data:')) continue;
              let ev: { type?: string; text?: string; name?: string } & Record<string, unknown>;
              try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
              if (ev.type === 'status') { place(); }
              else if (ev.type === 'tool') { place(); paint(acc || `_${String(ev.name)}…_`); }
              else if (ev.type === 'delta') { place(); acc += ev.text || ''; paint(acc); }
              else if (ev.type === 'done') { done = ev as unknown as DoneMeta; }
              else if (ev.type === 'error') { acc = acc || `Error: ${String(ev.error)}`; place(); paint(acc); }
            }
          }

          if (acc.trim()) {
            setMessages(prev => prev.map(m => m.id === assistantMsgId ? {
              ...m, content: acc, streaming: false,
              model: done?.model_used, tier: done?.tier_used,
              latency_ms: done?.latency_ms, tokens: done?.tokens,
            } : m));
            window.dispatchEvent(new CustomEvent('arthur:chat-saved'));
            setLoading(false);
            return;
          }
          // Stream produced nothing usable — drop the placeholder and fall through.
          if (placed) setMessages(prev => prev.filter(m => m.id !== assistantMsgId));
        }
      } catch { /* fall through to the non-streaming path */ }

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
        latency_ms?: number;
        tokens?: number;
      };

      const fullText = data.response ?? '(no response)';

      // 4a. Insert streaming placeholder immediately (zero-content, streaming=true)
      setLoading(false);
      setMessages(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        model: data.model_used,
        tier: data.tier_used,
        latency_ms: data.latency_ms,
        tokens: data.tokens,
        ts: Date.now(),
        streaming: true,
      }]);

      // 4b. Pseudo-stream the full response into the placeholder
      await pseudoStream(
        fullText,
        (partial) => {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, content: partial } : m
          ));
        },
        () => {
          setMessages(prev => prev.map(m =>
            m.id === assistantMsgId ? { ...m, streaming: false } : m
          ));
        },
      );

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

  // Regenerate: remove the assistant message, re-send the preceding user prompt
  const handleRegenerate = useCallback((msgId: string) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId);
      if (idx < 0) return prev;
      // Find the user message immediately before this assistant message
      let userPrompt = '';
      for (let i = idx - 1; i >= 0; i--) {
        if (prev[i].role === 'user') { userPrompt = prev[i].content; break; }
      }
      // Remove the assistant message
      const next = prev.filter((_, i) => i !== idx);
      // Kick off a new send after state settles
      if (userPrompt) {
        setTimeout(() => sendMessage(userPrompt, []), 0);
      }
      return next;
    });
  }, [sendMessage]);

  // Edit prompt: put the preceding user message back in the input
  const handleEditPrompt = useCallback((msgId: string) => {
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === msgId);
      if (idx < 0) return prev;
      let userPrompt = '';
      for (let i = idx - 1; i >= 0; i--) {
        if (prev[i].role === 'user') { userPrompt = prev[i].content; break; }
      }
      // Remove the assistant message so user can re-send a fresh one
      const next = prev.filter((_, i) => i !== idx);
      if (userPrompt) {
        setPrefillText(userPrompt);
      }
      return next;
    });
  }, []);

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
          <MessageList
            messages={messages}
            loading={loading}
            onRegenerate={handleRegenerate}
            onEditPrompt={handleEditPrompt}
          />
        )}
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <ChatInput
        onSend={sendMessage}
        disabled={loading}
        onVoiceClick={onOpenVoice}
        voiceActive={voiceActive}
        prefillText={prefillText}
        onPrefillConsumed={() => setPrefillText(undefined)}
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
