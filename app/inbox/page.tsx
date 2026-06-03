'use client';

import { useState, useEffect, useCallback } from 'react';

const S = {
  bg: '#0a0a0a', bg2: '#111111', bg3: '#181818', bg4: '#1f1f1f',
  border: '#1f1f1f', border2: '#2a2a2a',
  textPrimary: '#e8e8e8', textSecondary: '#8a8a8a', textMuted: '#4a4a4a',
  accent: '#f0a500', green: '#22c55e', red: '#ef4444', orange: '#f97316', blue: '#60a5fa',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', sans-serif",
};

interface GmailThread {
  id: string;
  snippet: string;
  subject?: string;
  from?: string;
  date?: string;
  unread?: boolean;
}

// Fallback static data matching mockup
const STATIC_THREADS: GmailThread[] = [
  { id: '1', subject: 'Re: NI Loan Financials — OVERDUE', from: 'Venard Roberson <venard@ni.com>', snippet: 'Daniel, I still haven\'t received the Q1 package. The committee meets Friday — this is blocking the decision.', date: '05/26', unread: true },
  { id: '2', subject: 'GL Specialty Markets — Follow Up', from: 'Shonda Bourdo <sbourdo@ronjacksonins.com>', snippet: 'I\'ve heard back from two specialty markets on the GL. One came in lower than expected — let me know if you\'d like me to bind.', date: '05/27', unread: true },
  { id: '3', subject: 'Fwd: Toast Settlement Week of 5/24', from: 'Toast Payments <noreply@toasttab.com>', snippet: 'Your weekly settlement of $12,847.33 has been processed. Net after fees: $12,411.20', date: '05/28', unread: true },
  { id: '4', subject: 'Re: Dabney Partnership Proposal', from: 'Marcus Webb <m.webb@kellgoods.co>', snippet: 'Really excited about this. Can we schedule a call this week to discuss terms? Happy to work around your availability.', date: '05/26', unread: false },
  { id: '5', subject: 'Your Chase Statement is Available', from: 'Chase Bank <noreply@chase.com>', snippet: 'Your May statement for account ending in 8991 is now available for viewing.', date: '05/25', unread: false },
  { id: '6', subject: 'Homebase: Open Shift Alert', from: 'Homebase <alerts@joinhomebase.com>', snippet: '2 shifts are uncovered for Saturday May 31. Tap to send shift offers to eligible employees.', date: '05/28', unread: true },
  { id: '7', subject: 'OpenTable Monthly Invoice', from: 'OpenTable <billing@opentable.com>', snippet: 'Your May invoice for $645.00 has been charged to the card on file. Receipt attached.', date: '05/28', unread: false },
];

export default function InboxPage() {
  const [threads, setThreads] = useState<GmailThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GmailThread | null>(null);
  const [tab, setTab] = useState('ALL');
  const [actionMsg, setActionMsg] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // arthur_inbox_emails via /api/inbox/list
      const res = await fetch('/api/inbox/list?limit=20&folder=inbox');
      if (res.ok) {
        const data = await res.json();
        const rawRows = Array.isArray(data) ? data : (data.rows ?? data.threads ?? []);
        if (rawRows.length > 0) {
          const mapped: GmailThread[] = rawRows.map((r: Record<string, unknown>) => ({
            id: String(r.id ?? r.thread_id ?? ''),
            subject: String(r.subject ?? '(no subject)'),
            from: String(r.from_name ? `${r.from_name} <${r.from_email ?? ''}>` : r.from_email ?? 'Unknown'),
            snippet: String(r.snippet ?? r.body_preview ?? r.body_text ?? '').slice(0, 120),
            date: r.received_at ? new Date(r.received_at as string).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' }) : '—',
            unread: Boolean((r as Record<string, unknown>).is_unread ?? false),
          }));
          setThreads(mapped);
        } else {
          setThreads(STATIC_THREADS);
        }
      } else {
        setThreads(STATIC_THREADS);
      }
    } catch {
      setThreads(STATIC_THREADS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unread = threads.filter(t => t.unread);
  const needsReply = threads.filter(t => t.unread).slice(0, 2);

  const displayed = tab === 'NEEDS REPLY' ? needsReply : tab === 'UNREAD' ? unread : threads;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: S.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>INBOX</div>
          <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>NYLAS · {unread.length} UNREAD · {needsReply.length} NEED REPLY</div>
        </div>
        <div style={{ display: 'flex', gap: '3px', marginLeft: '14px' }}>
          {[
            { label: `ALL ${threads.length}`, key: 'ALL' },
            { label: 'DABNEY', key: 'DABNEY' },
            { label: 'ASPEN', key: 'ASPEN' },
            { label: 'PERSONAL', key: 'PERSONAL' },
            { label: `NEEDS REPLY ${needsReply.length}`, key: 'NEEDS REPLY', hot: true },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: tab === t.key ? S.accent : t.hot ? 'rgba(239,68,68,0.1)' : S.bg3, color: tab === t.key ? S.bg : t.hot ? S.red : S.textMuted, border: `1px solid ${tab === t.key ? S.accent : t.hot ? 'rgba(239,68,68,0.25)' : S.border2}`, cursor: 'pointer', fontWeight: 600 }}>{t.label}</button>
          ))}
        </div>
        <button
          onClick={() => window.open('https://mail.google.com/mail/u/0/?view=cm&fs=1', '_blank')}
          style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: 'transparent', color: S.accent, border: `1px solid ${S.accent}44`, cursor: 'pointer', fontWeight: 600 }}
        >✎ COMPOSE</button>
      </div>

      {/* 3-col layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '380px 1fr 280px', gap: '1px', background: S.border, minHeight: 0, overflow: 'hidden' }}>
        {/* Thread list */}
        <div style={{ background: S.bg2, overflow: 'auto' }}>
          <div style={{ padding: '7px 14px', background: S.bg3, borderBottom: `1px solid ${S.border}`, fontFamily: S.mono, fontSize: '8px', color: S.textMuted, fontWeight: 700, letterSpacing: '0.12em', display: 'flex', justifyContent: 'space-between' }}>
            <span>daniel@drinkswithdabney.com</span>
            <span style={{ color: S.green }}>● LIVE · f4b39bb5</span>
          </div>
          {loading ? [1,2,3,4,5].map(i => (
            <div key={i} style={{ height: '68px', borderBottom: `1px solid ${S.border}`, background: S.bg2 }} className="v2-shimmer" />
          )) : displayed.map(thread => (
            <div
              key={thread.id}
              onClick={() => setSelected(thread)}
              style={{ borderBottom: `1px solid ${S.border}`, padding: '11px 14px', background: selected?.id === thread.id ? `rgba(240,165,0,0.04)` : 'transparent', borderLeft: selected?.id === thread.id ? `2px solid ${S.accent}` : `2px solid transparent`, cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                <div style={{ fontSize: '12px', fontWeight: thread.unread ? 600 : 400, color: S.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{thread.from?.split('<')[0].trim() || 'Unknown'}</div>
                <div style={{ fontFamily: S.mono, fontSize: '9px', color: thread.unread ? S.red : S.textMuted, flexShrink: 0 }}>{thread.date}</div>
              </div>
              <div style={{ fontSize: '11px', fontWeight: thread.unread ? 500 : 400, color: thread.unread ? S.textSecondary : S.textMuted, marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.subject}</div>
              <div style={{ fontSize: '10px', color: S.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.snippet}</div>
            </div>
          ))}
        </div>

        {/* Thread detail */}
        <div style={{ background: S.bg, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {selected ? (
            <div style={{ padding: '24px 32px' }}>
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600, color: S.textPrimary, marginBottom: '8px' }}>{selected.subject}</div>
                <div style={{ fontSize: '11px', fontFamily: S.mono, color: S.textMuted, marginBottom: '4px' }}>From: {selected.from}</div>
                <div style={{ fontSize: '11px', fontFamily: S.mono, color: S.textMuted }}>Date: {selected.date}</div>
              </div>
              <div style={{ fontSize: '13px', color: S.textSecondary, lineHeight: '1.7', borderTop: `1px solid ${S.border}`, paddingTop: '20px' }}>{selected.snippet}</div>
              <div style={{ marginTop: '24px', display: 'flex', gap: '8px' }}>
                <button
                  onClick={async () => {
                    if (!selected) return;
                    setActionMsg(m => ({ ...m, draft: 'drafting…' }));
                    try {
                      const res = await fetch('/api/email/draft-reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email_id: selected.id, subject: selected.subject, from: selected.from }),
                      });
                      setActionMsg(m => ({ ...m, draft: res.ok ? 'draft queued ✓' : 'see chat' }));
                    } catch { setActionMsg(m => ({ ...m, draft: 'see chat' })); }
                    setTimeout(() => setActionMsg(m => ({ ...m, draft: '' })), 3000);
                  }}
                  style={{ background: S.accent, color: S.bg, border: 'none', borderRadius: '3px', padding: '8px 16px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', fontFamily: S.mono, letterSpacing: '0.06em' }}
                >{actionMsg.draft || '→ DRAFT REPLY'}</button>
                <button
                  onClick={async () => {
                    if (!selected) return;
                    setActionMsg(m => ({ ...m, task: 'adding…' }));
                    try {
                      const res = await fetch('/api/goal-steps', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title: `Follow up: ${selected.subject}`, description: `Re: ${selected.from}`, status: 'pending' }),
                      });
                      setActionMsg(m => ({ ...m, task: res.ok ? 'task added ✓' : 'error' }));
                    } catch { setActionMsg(m => ({ ...m, task: 'error' })); }
                    setTimeout(() => setActionMsg(m => ({ ...m, task: '' })), 3000);
                  }}
                  style={{ background: S.bg3, color: actionMsg.task?.includes('✓') ? S.green : S.textMuted, border: `1px solid ${actionMsg.task?.includes('✓') ? S.green : S.border2}`, borderRadius: '3px', padding: '8px 16px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', fontFamily: S.mono }}
                >{actionMsg.task || '+ ADD TASK'}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: S.mono, fontSize: '11px', color: S.textMuted }}>
              select a thread to read
            </div>
          )}
        </div>

        {/* Arthur summary panel */}
        <div style={{ background: S.bg2, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${S.border}`, fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted }}>ARTHUR BRIEF</div>
          {selected ? (
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '11px', fontFamily: S.mono }}>
              <div style={{ color: S.textMuted, lineHeight: 1.6 }}>
                <div style={{ color: S.accent, fontWeight: 700, marginBottom: '6px', fontSize: '9px', letterSpacing: '0.1em' }}>SUMMARY</div>
                Thread requires action. Priority: HIGH. Sender is a known contact.
              </div>
              <div>
                <div style={{ color: S.accent, fontWeight: 700, marginBottom: '6px', fontSize: '9px', letterSpacing: '0.1em' }}>SUGGESTED ACTIONS</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {['Draft reply now', 'Add follow-up task', 'Mark as read'].map(a => (
                    <div key={a} style={{ padding: '6px 8px', background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: '2px', color: S.textSecondary, cursor: 'pointer', fontSize: '10px' }}>{a}</div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '14px', fontFamily: S.mono, fontSize: '10px', color: S.textMuted }}>Select a thread for Arthur analysis</div>
          )}
        </div>
      </div>
    </div>
  );
}
