'use client';

import { useState } from 'react';

const S = {
  bg: '#0a0a0a', bg2: '#111111', bg3: '#181818', bg4: '#1f1f1f',
  border: '#1f1f1f', border2: '#2a2a2a',
  textPrimary: '#e8e8e8', textSecondary: '#8a8a8a', textMuted: '#4a4a4a',
  accent: '#f0a500', green: '#22c55e', red: '#ef4444', orange: '#f97316', blue: '#60a5fa',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', sans-serif",
};

const SAMPLE_MSGS = [
  { role: "user", content: "What subscriptions are we paying that we can cut? I think we're overspending on SaaS.", time: "19:41" },
  { role: "arthur", content: "Pulling live subscription data from Chase + Stripe...\n\nFound 14 active recurring charges. Quick hits:\n\n• Rocket Money $10/mo — ironically pays for itself, but you haven't used it in 3mo\n• Microsoft 365 $29.99/mo — you're on Google Workspace; this is dead weight\n• Calendly $20/mo — you route through Arthur for scheduling anyway\n• DataDog free-tier breach alert — $46 this month, spike from last deploy\n\nTotal immediate cut: $105.99/mo → $1,271/yr. Draft the cancellation tasks?", time: "19:41", tools: ["Chase sync", "Stripe API", "expense-classifier"] },
  { role: "user", content: "Yes — do it. And add a weekly subscription audit to the recurring tasks.", time: "19:42" },
  { role: "arthur", content: "3 cancellation tasks created → inbox. Weekly sub audit scheduled every Monday 9am.\n\nAlso flagged: Homebase billing jumped $86→$957/mo when you added 3 staff. That's your real overspend — not SaaS. At 9 employees it's cheaper to switch to Gusto ($40 base + $6/person vs $957/mo flat). Run the comparison?", time: "19:43", tools: ["arthur_goal_steps:insert ×3", "cron-scheduler"] },
];

const TOOL_LOG = [
  { time: '19:41', icon: '→', color: '#60a5fa', text: 'GET /chase/transactions?type=recurring' },
  { time: '19:41', icon: '→', color: '#60a5fa', text: 'GET /stripe/subscriptions?active=true' },
  { time: '19:41', icon: '✓', color: '#22c55e', text: '14 subscriptions classified' },
  { time: '19:43', icon: '→', color: '#a78bfa', text: 'INSERT arthur_goal_steps ×3' },
  { time: '19:43', icon: '→', color: '#a78bfa', text: 'cron-scheduler: weekly-sub-audit' },
  { time: '19:43', icon: '✓', color: '#22c55e', text: 'Tasks queued + cron set' },
];

export default function ChatPage() {
  const [input, setInput] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: S.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>CHAT</div>
          <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>
            SESSION #847 · ALL ENTITIES · 23 TOOLS · <span style={{ color: S.green }}>● ROUTER LIVE</span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {['⌥ NEW SESSION', '📋 HISTORY'].map(label => (
            <button key={label} style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: S.bg3, color: S.textMuted, border: `1px solid ${S.border2}`, cursor: 'pointer', fontWeight: 600 }}>{label}</button>
          ))}
        </div>
      </div>

      {/* 2-col layout */}
      <div className="os-split" style={{ flex: 1, ['--rail' as string]: '280px', gap: '1px', background: S.border, minHeight: 0 }}>
        {/* Chat area */}
        <div style={{ background: S.bg, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {/* Messages */}
          <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ textAlign: 'center', fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>— SESSION STARTED · THU 05/28/26 · 19:41 —</div>
            {SAMPLE_MSGS.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '10px', alignItems: 'flex-start' }}>
                {msg.role === 'arthur' && (
                  <div style={{ width: '30px', height: '30px', background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: S.accent, flexShrink: 0, fontFamily: S.mono }}>A</div>
                )}
                <div style={{ maxWidth: '560px' }}>
                  <div style={{ background: msg.role === 'user' ? S.bg3 : 'transparent', border: `1px solid ${msg.role === 'user' ? S.border2 : S.border}`, borderRadius: msg.role === 'user' ? '3px 3px 0 3px' : '3px 3px 3px 0', padding: '12px 16px', fontSize: '13px', lineHeight: '1.6', color: S.textPrimary, whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                  </div>
                  {msg.tools && (
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {msg.tools.map(t => (
                        <span key={t} style={{ fontFamily: S.mono, fontSize: '9px', padding: '1px 6px', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', borderRadius: '2px', color: S.blue }}>⚙ {t}</span>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: '9px', fontFamily: S.mono, color: S.textMuted, marginTop: '4px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>{msg.time}</div>
                </div>
                {msg.role === 'user' && (
                  <div style={{ width: '30px', height: '30px', background: S.accent, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: S.bg, flexShrink: 0, fontFamily: S.mono }}>D</div>
                )}
              </div>
            ))}
          </div>
          {/* Input */}
          <div style={{ background: S.bg2, borderTop: `1px solid ${S.border}`, padding: '14px 20px', display: 'flex', gap: '10px', flexShrink: 0 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Message Arthur… (⌘/ for commands)"
              style={{ flex: 1, background: S.bg3, border: `1px solid ${S.border2}`, borderRadius: '3px', padding: '10px 14px', fontSize: '13px', color: S.textPrimary, fontFamily: S.sans, outline: 'none' }}
            />
            <button style={{ background: S.accent, color: S.bg, border: 'none', borderRadius: '3px', padding: '10px 18px', fontSize: '9px', fontWeight: 700, cursor: 'pointer', fontFamily: S.mono, letterSpacing: '0.08em' }}>SEND ↵</button>
          </div>
        </div>

        {/* Tool log panel */}
        <div style={{ background: S.bg2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${S.border}`, fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted }}>
            TOOL ACTIVITY · SESSION
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 0' }}>
            {TOOL_LOG.map((log, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', padding: '4px 14px', fontSize: '10px', fontFamily: S.mono, borderLeft: `2px solid ${log.color}`, marginBottom: '3px', marginLeft: '6px' }}>
                <span style={{ color: S.textMuted, minWidth: '36px' }}>{log.time}</span>
                <span style={{ color: log.color }}>{log.icon}</span>
                <span style={{ color: S.textSecondary, flex: 1, wordBreak: 'break-all' }}>{log.text}</span>
              </div>
            ))}
          </div>
          {/* Session stats */}
          <div style={{ padding: '12px 14px', borderTop: `1px solid ${S.border}`, fontFamily: S.mono, fontSize: '9px' }}>
            <div style={{ color: S.textMuted, marginBottom: '8px', fontWeight: 700, letterSpacing: '0.1em' }}>SESSION STATS</div>
            {[['TURNS','3'],['TOOLS CALLED','6'],['TOKENS','4,217'],['COST','~$0.031'],['TIER','T14 SONNET']].map(([k,v]) => (
              <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: S.textMuted }}>{k}</span>
                <span style={{ color: S.textSecondary }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
