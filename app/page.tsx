export const dynamic = 'force-dynamic';

const S = {
  bg: '#0a0a0a', bg2: '#111111', bg3: '#181818', bg4: '#1f1f1f',
  border: '#1f1f1f', border2: '#2a2a2a',
  textPrimary: '#e8e8e8', textSecondary: '#8a8a8a', textMuted: '#4a4a4a',
  accent: '#f0a500', green: '#22c55e', red: '#ef4444', orange: '#f97316', blue: '#60a5fa',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', sans-serif",
};

function Pill({ color, children }: { color: 'red' | 'orange' | 'green' | 'blue' | 'muted'; children: React.ReactNode }) {
  const map = {
    red: { color: S.red, border: 'rgba(239,68,68,0.3)', bg: 'rgba(239,68,68,0.07)' },
    orange: { color: S.orange, border: 'rgba(249,115,22,0.3)', bg: 'rgba(249,115,22,0.07)' },
    green: { color: S.green, border: 'rgba(34,197,94,0.3)', bg: 'rgba(34,197,94,0.07)' },
    blue: { color: S.blue, border: 'rgba(96,165,250,0.3)', bg: 'rgba(96,165,250,0.07)' },
    muted: { color: S.textMuted, border: S.border2, bg: S.bg3 },
  };
  const c = map[color];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 7px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, fontFamily: S.mono, letterSpacing: '0.06em', border: `1px solid ${c.border}`, background: c.bg, color: c.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {children}
    </span>
  );
}

function StatBlock({ label, value, delta, valueColor }: { label: string; value: string; delta?: string; valueColor?: string }) {
  return (
    <div style={{ padding: '10px 18px', borderRight: `1px solid ${S.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: S.textMuted, fontFamily: S.mono }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: S.mono, letterSpacing: '-0.3px', color: valueColor || S.textPrimary }}>{value}</div>
      {delta && <div style={{ fontSize: '9px', fontFamily: S.mono, color: S.textMuted }}>{delta}</div>}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Route header */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: S.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>DAILY OPS</div>
          <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>CROSS-ENTITY · LAST SYNC 4M AGO</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '3px' }}>
          {['TODAY', '7D', '30D'].map((label, i) => (
            <button key={label} style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: i === 0 ? S.accent : S.bg3, color: i === 0 ? S.bg : S.textMuted, border: `1px solid ${i === 0 ? S.accent : S.border2}`, cursor: 'pointer', fontWeight: 600, letterSpacing: '0.04em' }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Stat bar */}
      <div style={{ background: S.bg3, borderBottom: `1px solid ${S.border}`, display: 'flex', overflowX: 'auto', flexShrink: 0 }}>
        <StatBlock label="NET CASH" value="−$4,792" delta="⚠ OVERDRAFT PENDING" valueColor={S.red} />
        <StatBlock label="SPENT / MTD" value="$13,847" delta="↓ $2,274 vs LM" valueColor={S.orange} />
        <StatBlock label="OVERDUE TASKS" value="4" delta="across 2 entities" valueColor={S.red} />
        <StatBlock label="UNREAD EMAIL" value="7" delta="2 need reply" valueColor={S.orange} />
        <StatBlock label="ALERTS" value="3" delta="1 CRITICAL" valueColor={S.red} />
        <StatBlock label="EVENTS / WEEK" value="12" delta="FRI 6pm live music" valueColor={S.blue} />
        <StatBlock label="ACTIVE GOALS" value="6" delta="2 in progress" />
        <StatBlock label="EMPLOYEES ON" value="5" delta="2 closing tonight" valueColor={S.green} />
      </div>

      {/* 3-column grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 320px', gap: '1px', background: S.border, minHeight: 0, overflow: 'hidden' }}>

        {/* Col 1: Punch list */}
        <div style={{ background: S.bg2, padding: '14px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, marginBottom: '4px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            TODAY&apos;S PUNCH LIST <span style={{ color: S.accent, cursor: 'pointer' }}>+ ADD ITEM</span>
          </div>
          {/* Critical alert */}
          <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '3px', padding: '7px 10px', fontSize: '11px', fontFamily: S.mono, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: S.red, fontWeight: 700 }}>⚠ CRITICAL</span>
            <span style={{ color: S.textMuted }}>Chase ····8991 overdraft risk — avail −$140.97 · 1 pending charge clears tonight</span>
          </div>
          {[
            { label: 'Reply Venard — NI loan financials overdue', pill: 'red' as const, pillLabel: 'OVERDUE 8D', urgent: true },
            { label: 'Reply Shonda — GL specialty markets', pill: 'orange' as const, pillLabel: 'TODAY' },
            { label: 'Investigate PayPal $1,954 / 90d charges', pill: 'orange' as const, pillLabel: 'TODAY' },
            { label: 'Cancel CC ····7114 (Gonzalez left co)', pill: 'blue' as const, pillLabel: 'THIS WEEK' },
            { label: 'Apply LOVELEEDAY EIN', pill: 'blue' as const, pillLabel: 'TMW' },
            { label: 'Cancel Rocket Money subscription', pill: 'orange' as const, pillLabel: 'TODAY' },
          ].map((task) => (
            <div key={task.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', background: task.urgent ? 'rgba(239,68,68,0.05)' : S.bg3, border: `1px solid ${task.urgent ? 'rgba(239,68,68,0.18)' : S.border}`, borderRadius: '3px' }}>
              <div style={{ width: '14px', height: '14px', border: `1px solid ${task.urgent ? S.red : S.border2}`, borderRadius: '2px', flexShrink: 0 }} />
              <div style={{ flex: 1, fontSize: '12px', color: S.textPrimary }}>{task.label}</div>
              <Pill color={task.pill}>{task.pillLabel}</Pill>
            </div>
          ))}
          {/* Done items */}
          {[
            { label: 'Send food license to Kristie', time: 'DONE 18:34' },
            { label: 'Confirm Friday live music slot', time: 'DONE 14:02' },
          ].map((task) => (
            <div key={task.label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', background: S.bg3, border: `1px solid ${S.border}`, borderRadius: '3px', opacity: 0.55 }}>
              <div style={{ width: '14px', height: '14px', border: `1px solid ${S.green}`, borderRadius: '2px', background: 'rgba(34,197,94,0.15)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', color: S.green }}>✓</div>
              <div style={{ flex: 1, fontSize: '12px', color: S.textMuted, textDecoration: 'line-through' }}>{task.label}</div>
              <Pill color="green">{task.time}</Pill>
            </div>
          ))}
        </div>

        {/* Col 2: Entity health + activity */}
        <div style={{ background: S.bg2, padding: '14px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, marginBottom: '12px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              ENTITY HEALTH <span style={{ color: S.accent, cursor: 'pointer' }}>VIEW DETAILS ↗</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Dabney */}
              <div style={{ background: S.bg3, border: `1px solid ${S.border}`, borderRadius: '3px', padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: S.textPrimary }}>DABNEY & CO.</div>
                  <Pill color="orange">1 ALERT</Pill>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px' }}>
                  {[['CASH','$739',S.orange],['MTD SPEND','$13.8k',S.textPrimary],['OPEN TASKS','4',S.red],['REV TODAY','$2,847',S.green]].map(([l,v,c]) => (
                    <div key={l as string}>
                      <div style={{ fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: S.textMuted, fontFamily: S.mono }}>{l}</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, fontFamily: S.mono, color: c as string }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Aspen */}
              <div style={{ background: S.bg3, border: `1px solid ${S.border}`, borderRadius: '3px', padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: S.textPrimary }}>ASPEN & MAY GROUP</div>
                  <Pill color="muted">HOLDING</Pill>
                </div>
                <div style={{ fontSize: '11px', fontFamily: S.mono, color: S.textMuted }}>No operational accounts · EIN 42-2823682 · 1 overdue loan package</div>
                <div style={{ marginTop: '8px', fontSize: '10px', fontFamily: S.mono, color: S.accent }}>+ CONNECT BANK ACCOUNT</div>
              </div>
              {/* Loveleeday */}
              <div style={{ background: S.bg3, border: `1px solid ${S.border}`, borderRadius: '3px', padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: S.textPrimary }}>LOVELEEDAY STUDIOS</div>
                  <Pill color="muted">EMPTY</Pill>
                </div>
                <div style={{ fontSize: '11px', fontFamily: S.mono, color: S.textMuted }}>EIN pending · SaaS arm pre-launch · 2 projects in flight</div>
                <div style={{ marginTop: '8px', fontSize: '10px', fontFamily: S.mono, color: S.accent }}>+ APPLY EIN TOMORROW</div>
              </div>
            </div>
          </div>
          {/* Recent activity */}
          <div>
            <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, marginBottom: '8px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px' }}>
              RECENT ARTHUR ACTIVITY
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px', fontFamily: S.mono }}>
              {[
                { time: '20:19', icon: '✓', color: S.green, text: 'Task created: Cancel Rocket Money' },
                { time: '19:55', icon: '↻', color: S.blue, text: 'Chase sync: 4 new transactions' },
                { time: '18:34', icon: '→', color: S.textMuted, text: 'Email sent: food license → Kristie' },
                { time: '14:12', icon: '⚠', color: S.orange, text: 'Alert: overdraft risk ····8991' },
                { time: '11:30', icon: '→', color: S.textMuted, text: 'SMS Teo: shift report request' },
              ].map(row => (
                <div key={row.time} style={{ display: 'flex', gap: '10px', padding: '5px 8px', background: S.bg3, borderRadius: '2px', borderLeft: `2px solid ${row.color}` }}>
                  <span style={{ color: S.textMuted, minWidth: '42px' }}>{row.time}</span>
                  <span style={{ color: row.color }}>{row.icon}</span>
                  <span style={{ color: S.textSecondary, flex: 1 }}>{row.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Col 3: Alerts + recurring + revenue */}
        <div style={{ background: S.bg2, padding: '14px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Alerts */}
          <div>
            <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, marginBottom: '8px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px' }}>ACTIVE ALERTS · 3</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {[
                { title: '⚠ OVERDRAFT', detail: 'Chase ····8991 avail −$140.97', action: '→ TRANSFER FROM CC', border: 'rgba(239,68,68,0.25)', bg: 'rgba(239,68,68,0.06)', titleColor: S.red },
                { title: '⚡ CC CANCELLATION', detail: '····7114 joint — Gonzalez left', action: '→ START CANCEL FLOW', border: 'rgba(249,115,22,0.22)', bg: 'rgba(249,115,22,0.05)', titleColor: S.orange },
                { title: '📨 REPLY OVERDUE', detail: 'Venard — NI loan financials', action: '→ OPEN DRAFT REPLY', border: 'rgba(249,115,22,0.22)', bg: 'rgba(249,115,22,0.05)', titleColor: S.orange },
              ].map(alert => (
                <div key={alert.title} style={{ background: alert.bg, border: `1px solid ${alert.border}`, borderRadius: '3px', padding: '8px 10px', fontSize: '11px', fontFamily: S.mono }}>
                  <div style={{ color: alert.titleColor, fontWeight: 700, marginBottom: '3px' }}>{alert.title}</div>
                  <div style={{ color: S.textMuted }}>{alert.detail}</div>
                  <div style={{ marginTop: '5px', fontSize: '9px', color: S.accent }}>{alert.action}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Recurring */}
          <div>
            <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, marginBottom: '8px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px' }}>RECURRING / 7D · $1,634</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', fontFamily: S.mono }}>
              {[
                ['THU 28', 'RM $10', S.accent],
                ['FRI 29', 'Sndtrk $60', S.orange],
                ['SUN 31', 'HBase $86 · Toast $469', S.orange],
                ['TUE  2', 'OTable $645', S.orange],
                ['WED  3', 'Ins $364', S.orange],
              ].map(([day, amount, color]) => (
                <div key={day as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${S.border}` }}>
                  <span style={{ color: color as string }}>{day}</span>
                  <span style={{ color: S.textMuted }}>{amount}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Revenue */}
          <div>
            <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, marginBottom: '8px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px' }}>REVENUE TODAY · DABNEY</div>
            <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: S.mono, color: S.green }}>$2,847</div>
            <div style={{ fontSize: '10px', fontFamily: S.mono, color: S.textMuted, marginTop: '3px' }}>↑ $312 vs same-day last week</div>
            <svg width="100%" height="40" viewBox="0 0 220 40" style={{ marginTop: '8px' }} preserveAspectRatio="none">
              <polyline points="0,30 22,26 44,22 66,28 88,18 110,15 132,20 154,12 176,10 198,15 220,8" fill="none" stroke={S.green} strokeWidth="1.5" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontFamily: S.mono, color: S.textMuted, marginTop: '3px' }}>
              <span>10am</span><span>now</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
