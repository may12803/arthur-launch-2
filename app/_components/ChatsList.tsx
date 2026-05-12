'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, MessageCircle, Trash2 } from 'lucide-react';

interface SessionRow {
  id: string;
  title: string | null;
  last_message_at: string;
  message_count: number;
  created_at: string;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ChatsListProps {
  expanded?: boolean;
}

export function ChatsList({ expanded = true }: ChatsListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeId = searchParams.get('chat') ?? null;

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/chat/sessions', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      setSessions((json.sessions ?? []) as SessionRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Re-fetch when a new message lands (custom event from ChatSurface)
    const handler = () => refresh();
    window.addEventListener('arthur:chat-saved', handler);
    return () => window.removeEventListener('arthur:chat-saved', handler);
  }, [refresh]);

  const newChat = async () => {
    // Drop the chat param — ChatSurface will mint a fresh client session.
    router.push('/');
  };

  const switchTo = (id: string) => {
    router.push(`/?chat=${id}`);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Archive this chat?')) return;
    await fetch(`/api/chat/sessions/${id}`, { method: 'DELETE', credentials: 'include' });
    if (activeId === id) router.push('/');
    refresh();
  };

  if (!expanded) {
    return (
      <div style={{ padding: '8px 0' }}>
        <button
          onClick={newChat}
          title="New chat"
          style={{
            width: '32px',
            height: '32px',
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            margin: '0 auto',
          }}
        >
          <Plus size={14} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 4px', minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          fontSize: '10px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
        }}
      >
        <span>Chats</span>
        <button
          onClick={newChat}
          title="New chat"
          style={{
            background: 'none',
            border: '1px solid var(--glass-border)',
            borderRadius: '6px',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <Plus size={11} />
        </button>
      </div>

      {loading && sessions.length === 0 && (
        <div style={{ padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
          loading…
        </div>
      )}

      {!loading && sessions.length === 0 && (
        <div style={{ padding: '8px', fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', opacity: 0.6 }}>
          no chats yet
        </div>
      )}

      <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
        {sessions.map((s) => {
          const isActive = activeId === s.id;
          const title = s.title || 'untitled';
          return (
            <div
              key={s.id}
              onClick={() => switchTo(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 8px',
                marginBottom: '2px',
                borderRadius: '6px',
                cursor: 'pointer',
                background: isActive ? 'var(--glass-bg-tier2)' : 'transparent',
                border: `1px solid ${isActive ? 'var(--glass-border-tier2)' : 'transparent'}`,
                transition: 'all 120ms',
                minWidth: 0,
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--glass-bg)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <MessageCircle size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: '12px',
                    color: isActive ? 'var(--text-active)' : 'var(--text-main)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: '1.2',
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-geist-mono, ui-monospace, monospace)',
                    marginTop: '2px',
                  }}
                >
                  {relTime(s.last_message_at)}
                </div>
              </div>
              <button
                onClick={(e) => deleteSession(s.id, e)}
                title="Archive chat"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '2px',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  flexShrink: 0,
                  opacity: 0.4,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.4'; }}
              >
                <Trash2 size={11} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
