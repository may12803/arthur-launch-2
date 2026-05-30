export const dynamic = 'force-dynamic';

const S = {
  bg: '#0a0a0a', bg2: '#111111', bg3: '#181818', bg4: '#1f1f1f',
  border: '#1f1f1f', border2: '#2a2a2a',
  textPrimary: '#e8e8e8', textSecondary: '#8a8a8a', textMuted: '#4a4a4a',
  accent: '#f0a500', green: '#22c55e', red: '#ef4444', orange: '#f97316', blue: '#60a5fa',
  mono: "'JetBrains Mono', monospace", sans: "'Inter', sans-serif",
};

function StatBlock({ label, value, delta, valueColor }: { label: string; value: string; delta?: string; valueColor?: string }) {
  return (
    <div style={{ padding: '10px 18px', borderRight: `1px solid ${S.border}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: S.textMuted, fontFamily: S.mono }}>{label}</div>
      <div style={{ fontSize: '16px', fontWeight: 700, fontFamily: S.mono, letterSpacing: '-0.3px', color: valueColor || S.textPrimary }}>{value}</div>
      {delta && <div style={{ fontSize: '9px', fontFamily: S.mono, color: S.textMuted }}>{delta}</div>}
    </div>
  );
}

const TRANSACTIONS = [
  { date: '05/28', vendor: 'TOAST POS — DAILY CLOSE', category: 'Revenue', amount: '+$2,847.33', entity: 'DABNEY', color: '#22c55e' },
  { date: '05/28', vendor: 'PAYPAL *SERVICEFEE', category: 'Fees', amount: '−$21.67', entity: 'DABNEY', color: '#f97316' },
  { date: '05/27', vendor: 'GORDON FOOD SERVICE', category: 'COGS', amount: '−$1,243.00', entity: 'DABNEY', color: '#f97316' },
  { date: '05/27', vendor: 'HOMEBASE — PAYROLL', category: 'Payroll', amount: '−$2,871.40', entity: 'DABNEY', color: '#ef4444' },
  { date: '05/27', vendor: 'IMPERIAL BEVERAGE', category: 'Liquor', amount: '−$834.00', entity: 'DABNEY', color: '#f97316' },
  { date: '05/26', vendor: 'TOAST POS — DAILY CLOSE', category: 'Revenue', amount: '+$1,924.12', entity: 'DABNEY', color: '#22c55e' },
  { date: '05/26', vendor: 'OPENTABLE — MONTHLY', category: 'SaaS', amount: '−$645.00', entity: 'DABNEY', color: '#ef4444' },
  { date: '05/25', vendor: 'SOUNDTRACK YOUR BRAND', category: 'SaaS', amount: '−$60.00', entity: 'DABNEY', color: '#f97316' },
];

const SPEND_CATEGORIES = [
  { label: 'Payroll', amount: '$5,742', pct: 41, color: '#60a5fa' },
  { label: 'COGS / Food', amount: '$3,847', pct: 28, color: '#22c55e' },
  { label: 'SaaS', amount: '$1,831', pct: 13, color: '#a78bfa' },
  { label: 'Liquor', amount: '$1,243', pct: 9, color: '#f97316' },
  { label: 'Fees', amount: '$682', pct: 5, color: '#f0a500' },
  { label: 'Other', amount: '$502', pct: 4, color: '#4a4a4a' },
];

export default function FinancePage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: S.bg2, borderBottom: `1px solid ${S.border}`, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: S.textPrimary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>FINANCE</div>
          <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, letterSpacing: '0.08em' }}>ALL ENTITIES · CHASE FC · STRIPE FC · LIVE</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '3px', alignItems: 'center' }}>
          {['1M', 'MTD', '3M', '6M', '1Y'].map((label, i) => (
            <button key={label} style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: i === 1 ? S.accent : S.bg3, color: i === 1 ? S.bg : S.textMuted, border: `1px solid ${i === 1 ? S.accent : S.border2}`, cursor: 'pointer', fontWeight: 600 }}>{label}</button>
          ))}
          <div style={{ width: '1px', height: '16px', background: S.border2, margin: '0 4px' }} />
          {['↗ STRIPE FC', '⊞ EXPORT'].map(label => (
            <button key={label} style={{ padding: '3px 10px', fontSize: '9px', fontFamily: S.mono, borderRadius: '2px', background: S.bg3, color: S.textMuted, border: `1px solid ${S.border2}`, cursor: 'pointer', fontWeight: 600 }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Stat bar */}
      <div style={{ background: S.bg3, borderBottom: `1px solid ${S.border}`, display: 'flex', overflowX: 'auto', flexShrink: 0 }}>
        <StatBlock label="SPENT / MTD" value="$13,847" delta="↓ $2,274 vs LM" valueColor={S.orange} />
        <StatBlock label="NET CASH" value="−$4,792.63" delta="↓ $892 vs −7d" valueColor={S.red} />
        <StatBlock label="CHK ····8991" value="$739.21" delta="⚠ OVERDRAFT PENDING" valueColor={S.orange} />
        <StatBlock label="CC TOTAL" value="−$5,531.84" delta="2 cards" valueColor={S.red} />
        <StatBlock label="TOP VENDOR / 30D" value="HOMEBASE" delta="$957 / mo avg" />
        <StatBlock label="RECURRING / 7D" value="$1,634" delta="4 charges" valueColor={S.blue} />
      </div>

      {/* 2-col layout */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1px', background: S.border, minHeight: 0, overflow: 'hidden' }}>
        {/* Transactions table */}
        <div style={{ background: S.bg, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px 20px', borderBottom: `1px solid ${S.border}`, fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
            TRANSACTIONS · MTD <span style={{ color: S.accent }}>FILTER ▾</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: S.bg2 }}>
                {['DATE', 'VENDOR', 'CATEGORY', 'ENTITY', 'AMOUNT'].map(h => (
                  <th key={h} style={{ fontFamily: S.mono, fontSize: '8px', fontWeight: 700, letterSpacing: '0.1em', color: S.textMuted, padding: '7px 16px', textAlign: 'left', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TRANSACTIONS.map((tx, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${S.border}` }}>
                  <td style={{ fontFamily: S.mono, fontSize: '11px', color: S.textMuted, padding: '9px 16px', whiteSpace: 'nowrap' }}>{tx.date}</td>
                  <td style={{ fontSize: '12px', color: S.textPrimary, padding: '9px 16px', fontWeight: 500 }}>{tx.vendor}</td>
                  <td style={{ fontFamily: S.mono, fontSize: '10px', color: S.textSecondary, padding: '9px 16px' }}>{tx.category}</td>
                  <td style={{ fontFamily: S.mono, fontSize: '9px', color: S.textMuted, padding: '9px 16px' }}>{tx.entity}</td>
                  <td style={{ fontFamily: S.mono, fontSize: '12px', fontWeight: 700, color: tx.color, padding: '9px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>{tx.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right panel: spend breakdown + chart */}
        <div style={{ background: S.bg2, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
          {/* Spend breakdown */}
          <div style={{ padding: '14px' }}>
            <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, marginBottom: '12px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px' }}>SPEND BREAKDOWN · MTD</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {SPEND_CATEGORIES.map(cat => (
                <div key={cat.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: S.mono, marginBottom: '3px' }}>
                    <span style={{ color: S.textSecondary }}>{cat.label}</span>
                    <span style={{ color: S.textPrimary }}>{cat.amount} <span style={{ color: S.textMuted }}>({cat.pct}%)</span></span>
                  </div>
                  <div style={{ height: '4px', background: S.bg3, borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${cat.pct}%`, background: cat.color, borderRadius: '2px' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Revenue sparkline */}
          <div style={{ padding: '14px', borderTop: `1px solid ${S.border}` }}>
            <div style={{ fontFamily: S.mono, fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: S.textMuted, marginBottom: '8px', borderBottom: `1px solid ${S.border}`, paddingBottom: '8px' }}>DABNEY REV / 30D</div>
            <div style={{ fontSize: '22px', fontWeight: 700, fontFamily: S.mono, color: S.green }}>$41,234</div>
            <div style={{ fontSize: '10px', fontFamily: S.mono, color: S.textMuted, marginTop: '2px' }}>↑ 14.2% vs prior 30d</div>
            <svg width="100%" height="50" viewBox="0 0 260 50" style={{ marginTop: '10px' }} preserveAspectRatio="none">
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0,40 10,35 30,38 50,30 70,32 90,25 110,28 130,22 150,18 170,24 190,16 210,12 230,15 260,10 L260,50 L0,50 Z" fill="url(#revGrad)" />
              <polyline points="0,40 10,35 30,38 50,30 70,32 90,25 110,28 130,22 150,18 170,24 190,16 210,12 230,15 260,10" fill="none" stroke={S.green} strokeWidth="1.5" />
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', fontFamily: S.mono, color: S.textMuted, marginTop: '3px' }}>
              <span>05/01</span><span>today</span>
            </div>
          </div>

          {/* Overdraft warning */}
          <div style={{ padding: '12px 14px', borderTop: `1px solid ${S.border}`, background: 'rgba(239,68,68,0.04)' }}>
            <div style={{ fontFamily: S.mono, fontSize: '9px', color: S.red, fontWeight: 700, marginBottom: '4px' }}>⚠ OVERDRAFT RISK</div>
            <div style={{ fontFamily: S.mono, fontSize: '10px', color: S.textMuted, lineHeight: 1.5 }}>Chase ····8991 available: <span style={{ color: S.orange }}>$739</span><br />1 pending ACH clears tonight: <span style={{ color: S.red }}>−$880</span></div>
            <div style={{ marginTop: '8px', fontFamily: S.mono, fontSize: '9px', color: S.accent, cursor: 'pointer' }}>→ TRANSFER FROM SAVINGS</div>
          </div>
        </div>
      </div>
    </div>
  );
}
